import type {
  JsonStore,
  KeyValueStore,
  PageLocation,
  Timer,
} from "@yagura/browser";
import { GitHubApiError, type GitHubApiClient } from "@yagura/github-api";
import {
  SessionApiError,
  type SessionApiClient,
  type SessionTokens,
} from "@yagura/session-api";
import { clearViewerCache, ViewerCache } from "../../shared";
import { completeCallback } from "./callback";
import { prepareSignIn } from "./sign-in";
import { TokenHolder } from "./token-holder";

export type SessionState =
  | { readonly status: "pending" }
  | { readonly status: "signed-out"; readonly error?: string }
  | {
      readonly status: "signed-in";
      readonly login: string;
      /**
       * Whether the session API has confirmed the session as `login`. On a
       * page load, the last viewer is signed in unconfirmed at once, so
       * that the view draws from their cache while the session is
       * restored behind it; see {@link SessionController.restore}.
       */
      readonly confirmed: boolean;
    };

export interface SessionControllerOptions {
  readonly sessionApi: SessionApiClient;
  readonly githubApi: GitHubApiClient;
  readonly clientId: string;
  /** Must match the callback URL registered for the GitHub App. */
  readonly redirectUri: string;
  /** Holds the sign-in handoff across the redirect to GitHub. */
  readonly storage: KeyValueStore;
  /**
   * Remembers the last viewer's login across page loads, tabs and browser
   * restarts (`localStorage` in the browser); see {@link LastViewer}.
   */
  readonly lastViewer: KeyValueStore;
  /** The page's address, read on the callback and left afterwards. */
  readonly location: PageLocation;
  /** Schedules the access token's refresh before it expires. */
  readonly timer: Timer;
  /**
   * The browser cache of fetched activity, shared by every viewer of the
   * browser and kept apart per login; see {@link viewerCache}.
   */
  readonly cache: JsonStore;
  /** The current time. Defaults to the system clock. */
  readonly clock?: () => Date;
  /**
   * Sends the browser to the GitHub authorize page. Defaults to assigning
   * the URL to `location`.
   */
  readonly navigate?: (url: URL) => void;
}

/**
 * Owns the sign-in state: the access token (memory only), its refresh, and
 * the signed-in user. Framework-free; the React binding subscribes to it.
 */
export class SessionController {
  readonly #options: SessionControllerOptions;
  readonly #tokens: TokenHolder;
  readonly #listeners = new Set<() => void>();
  readonly #lastViewer: LastViewer;
  #state: SessionState = { status: "pending" };
  #restoring: Promise<void> | undefined;
  #callback: Promise<void> | undefined;
  #refreshing: Promise<boolean> | undefined;
  #signingOut = false;
  /** The last sign-out, which settles once the state is signed out. */
  #signOut: Promise<void> | undefined;
  /**
   * Counts sign-outs, so that a restore or refresh that was in flight when
   * the viewer signed out does not sign them in again.
   */
  #signOuts = 0;

  constructor(options: SessionControllerOptions) {
    this.#options = options;
    this.#lastViewer = new LastViewer(options.lastViewer);
    this.#tokens = new TokenHolder(
      options.timer,
      () => void this.#refreshOnExpiry(),
    );
  }

  /** The page's address. */
  get location(): PageLocation {
    return this.#options.location;
  }

  /** The GitHub API client; call it through {@link withAccessToken}. */
  get githubApi(): GitHubApiClient {
    return this.#options.githubApi;
  }

  /** The current time, from the clock the controller was given. */
  now(): Date {
    return this.#options.clock?.() ?? new Date();
  }

  /**
   * The signed-in viewer's part of the browser cache. It reads from the
   * start, but stores only while the session is confirmed as the viewer,
   * so that a session that has ended never writes into the cache. It
   * stops storing once the viewer signs out, whose entries
   * {@link signOut} deletes.
   */
  viewerCache(): ViewerCache {
    const state = this.#state;
    if (state.status !== "signed-in") {
      throw new Error("Not signed in");
    }
    const { login } = state;
    return new ViewerCache(
      this.#options.cache,
      login,
      () =>
        !this.#signingOut &&
        this.#state.status === "signed-in" &&
        this.#state.confirmed &&
        this.#state.login === login,
    );
  }

  get state(): SessionState {
    return this.#state;
  }

  get accessToken(): string | undefined {
    return this.#tokens.accessToken;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /**
   * Restores the session on page load: with no token in memory, asks the
   * session API for one once, then finds the viewer's login. Repeated calls
   * share the first attempt. Does nothing after `handleCallback`, whose
   * outcome (including its error) is already the session state.
   *
   * When a last viewer is remembered, they are signed in unconfirmed at
   * once, before anything is asked, so that the view draws their cached
   * activity without waiting. The restore then confirms them, switches to
   * the login it finds, or signs out: forgetting the last viewer when the
   * session has ended (`401`), keeping them on any other failure.
   */
  restore(): Promise<void> {
    if (this.#restoring === undefined) {
      const login = this.#canRestore() ? this.#lastViewer.get() : undefined;
      if (login !== undefined) {
        this.#setState({ status: "signed-in", login, confirmed: false });
      }
      this.#restoring = this.#restore();
    }
    return this.#restoring;
  }

  /**
   * Completes the GitHub redirect. Never rejects: a failure leaves the user
   * signed out with an error. Repeated calls share the first attempt.
   */
  handleCallback(search: string): Promise<void> {
    this.#callback ??= this.#handleCallback(search);
    return this.#callback;
  }

  async signIn(): Promise<void> {
    try {
      const url = await prepareSignIn({
        clientId: this.#options.clientId,
        redirectUri: this.#options.redirectUri,
        storage: this.#options.storage,
      });
      const { navigate, location } = this.#options;
      if (navigate) {
        navigate(url);
      } else {
        location.assign(url);
      }
    } catch (error) {
      this.#signedOut(describe(error));
    }
  }

  /**
   * Signs out: forgets the access token and the last viewer, deletes the
   * viewer's entries from the browser cache, and ends the session. A
   * restore still in flight no longer signs anyone in.
   *
   * `DELETE /session` is sent only once a refresh in flight has answered:
   * its answer sets a new refresh cookie, which, arriving after the answer
   * that clears the cookie, would keep the session alive for the next load.
   */
  signOut(): Promise<void> {
    this.#signOut = this.#signOutNow();
    return this.#signOut;
  }

  async #signOutNow(): Promise<void> {
    const state = this.#state;
    const refreshing = this.#refreshing;
    this.#signingOut = true;
    this.#signOuts += 1;
    this.#tokens.clear();
    this.#lastViewer.forget();
    try {
      if (state.status === "signed-in") {
        await clearViewerCache(this.#options.cache, state.login);
      }
      // Its outcome no longer matters: the count of sign-outs drops it.
      await refreshing?.catch(() => undefined);
      await this.#options.sessionApi.deleteSession();
      this.#signedOut();
    } catch (error) {
      this.#signedOut(`Signed out locally, but ${describe(error)}`);
    } finally {
      this.#signingOut = false;
    }
  }

  /**
   * Runs a GitHub API call with the current access token. While the session
   * is not confirmed yet, waits for the restore first, and fails when it
   * did not confirm the same viewer. On a 401 the token is refreshed and the
   * call retried once.
   */
  async withAccessToken<T>(
    call: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const state = this.#state;
    if (state.status === "signed-in" && !state.confirmed) {
      await this.#restoring;
      // A sign-out under way fails the call only once it is signed out and
      // the view is gone, so that the view does not show a failure meanwhile.
      await this.#signOut;
      const now = this.#state;
      if (
        now.status !== "signed-in" ||
        this.#tokens.accessToken === undefined
      ) {
        throw new Error("The session has ended");
      }
      if (now.login !== state.login) {
        throw new Error(`Signed in as ${now.login} instead`);
      }
    }
    return this.#withToken(call);
  }

  /** {@link withAccessToken} without waiting for the restore. */
  async #withToken<T>(call: (accessToken: string) => Promise<T>): Promise<T> {
    const token = this.#requireToken();
    try {
      return await call(token);
    } catch (error) {
      if (!(error instanceof GitHubApiError && error.isUnauthorized)) {
        throw error;
      }
    }
    if (!(await this.#refresh())) {
      throw new Error("The session has ended");
    }
    return call(this.#requireToken());
  }

  #canRestore(): boolean {
    return (
      this.#callback === undefined && this.#tokens.accessToken === undefined
    );
  }

  async #restore(): Promise<void> {
    if (!this.#canRestore()) {
      return;
    }
    const signOuts = this.#signOuts;
    try {
      if (await this.#refresh()) {
        await this.#loadViewer(signOuts);
      }
    } catch (error) {
      if (signOuts === this.#signOuts) {
        this.#signedOut(describe(error));
      }
    }
  }

  async #handleCallback(search: string): Promise<void> {
    try {
      const tokens = await completeCallback({
        search,
        redirectUri: this.#options.redirectUri,
        sessionApi: this.#options.sessionApi,
        storage: this.#options.storage,
      });
      this.#tokens.set(tokens);
      await this.#loadViewer(this.#signOuts);
    } catch (error) {
      this.#tokens.clear();
      this.#signedOut(describe(error));
    }
  }

  /**
   * Finds the viewer's login, signs them in confirmed and remembers them as
   * the last viewer; unless they signed out since `signOuts` was counted.
   */
  async #loadViewer(signOuts: number): Promise<void> {
    const viewer = await this.#withToken((token) =>
      this.#options.githubApi.getViewer(token),
    );
    if (signOuts !== this.#signOuts) {
      return;
    }
    this.#lastViewer.remember(viewer.login);
    this.#setState({
      status: "signed-in",
      login: viewer.login,
      confirmed: true,
    });
  }

  /**
   * Replaces the access token from the refresh cookie. When the session API
   * answers 401, the session has ended: resolves `false`, forgets the last
   * viewer and signs out. Other failures reject. A refresh answered after a
   * sign-out resolves `false` and keeps no token.
   */
  #refresh(): Promise<boolean> {
    const signOuts = this.#signOuts;
    this.#refreshing ??= this.#options.sessionApi
      .refreshSession()
      .then(
        (tokens: SessionTokens) => {
          if (signOuts !== this.#signOuts) {
            return false;
          }
          this.#tokens.set(tokens);
          return true;
        },
        (error: unknown) => {
          if (signOuts !== this.#signOuts) {
            return false;
          }
          this.#tokens.clear();
          if (error instanceof SessionApiError && error.status === 401) {
            this.#lastViewer.forget();
            this.#signedOut();
            return false;
          }
          throw error;
        },
      )
      .finally(() => {
        this.#refreshing = undefined;
      });
    return this.#refreshing;
  }

  async #refreshOnExpiry(): Promise<void> {
    try {
      await this.#refresh();
    } catch (error) {
      this.#signedOut(describe(error));
    }
  }

  #requireToken(): string {
    const token = this.#tokens.accessToken;
    if (token === undefined) {
      throw new Error("Not signed in");
    }
    return token;
  }

  #signedOut(error?: string): void {
    this.#setState(
      error === undefined
        ? { status: "signed-out" }
        : { status: "signed-out", error },
    );
  }

  #setState(state: SessionState): void {
    this.#state = state;
    for (const listener of this.#listeners) {
      listener();
    }
  }
}

/**
 * The login of the viewer who signed in last in this browser, kept in a
 * {@link KeyValueStore} over `localStorage` rather than in the IndexedDB
 * cache: it is read synchronously, so that the last viewer is signed in
 * (unconfirmed) before anything is asked of IndexedDB or the network, and
 * it stays apart from the cache entries a sign-out deletes by prefix.
 *
 * Like the cache, it only saves time: a store that fails reads as nothing
 * remembered and ignores writes, with a warning in the console.
 */
class LastViewer {
  static readonly #key = "yagura.last-viewer";
  readonly #store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.#store = store;
  }

  get(): string | undefined {
    try {
      return this.#store.get(LastViewer.#key);
    } catch (error) {
      warnLastViewer("read", error);
      return undefined;
    }
  }

  remember(login: string): void {
    try {
      this.#store.set(LastViewer.#key, login);
    } catch (error) {
      warnLastViewer("remember", error);
    }
  }

  forget(): void {
    try {
      this.#store.remove(LastViewer.#key);
    } catch (error) {
      warnLastViewer("forget", error);
    }
  }
}

function warnLastViewer(action: string, error: unknown): void {
  console.warn(`Could not ${action} the last viewer:`, error);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
