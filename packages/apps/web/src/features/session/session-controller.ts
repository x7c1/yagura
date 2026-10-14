import type {
  JsonStore,
  KeyValueStore,
  PageLocation,
  TabChannel,
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

/** What a tab posts to the browser's other tabs when the viewer signs out. */
const signedOutMessage = "signed-out";

/**
 * The note on the sign-in screen when `DELETE /session` failed: the refresh
 * cookie may still be set, so that the next page load would restore the
 * session. Reloading restores that same session, if it is still there, and
 * signing out of it sends the request once more; signing in through GitHub
 * instead would start a new session and leave the old one's tokens
 * unrevoked.
 */
export const signOutUnconfirmedNote =
  "You are signed out in this browser, but Yagura could not reach the " +
  "server to end your session, so it may sign you back in the next time " +
  "you open it. To end it, reload this page and, if you are signed in " +
  "again, sign out once more.";

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
  /**
   * The channel to the browser's other tabs of the app, over which a
   * sign-out in one tab signs out every other; see {@link
   * SessionController.signOut}.
   */
  readonly tabs: TabChannel;
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
  #refreshing: Promise<SessionTokens | undefined> | undefined;
  /**
   * Whether the refresh in flight was answered with new tokens, and so with
   * a new refresh cookie, whatever the controller then made of the answer;
   * see {@link #signedOutElsewhere}.
   */
  #refreshRenewed: Promise<boolean> | undefined;
  /**
   * The last sign-out's deletion of the viewer's cache entries, which
   * settles once they are gone.
   */
  #signOut: Promise<void> | undefined;
  /**
   * Counts sign-outs, in this tab or in another tab of the browser, so that
   * a restore, refresh or load that was in flight when the viewer signed
   * out does not sign them in or store anything again.
   */
  #signOuts = 0;

  constructor(options: SessionControllerOptions) {
    this.#options = options;
    this.#lastViewer = new LastViewer(options.lastViewer);
    this.#tokens = new TokenHolder(
      options.timer,
      () => void this.#refreshOnExpiry(),
    );
    // The controller lives as long as the page, so it never unsubscribes.
    options.tabs.onMessage((message) => {
      if (message === signedOutMessage) {
        void this.#signedOutElsewhere();
      }
    });
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
   * stops storing for good once the viewer signs out, in this tab or
   * another, whose entries {@link signOut} deletes.
   */
  viewerCache(): ViewerCache {
    const state = this.#state;
    if (state.status !== "signed-in") {
      throw new Error("Not signed in");
    }
    const { login } = state;
    const signOuts = this.#signOuts;
    return new ViewerCache(
      this.#options.cache,
      login,
      () =>
        this.#signOuts === signOuts &&
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
   * session API once for a token and the viewer's login. Repeated calls
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
   * Signs out of this browser at once: forgets the access token and the
   * last viewer, deletes the viewer's entries from the browser cache, shows
   * the sign-in screen, and tells the browser's other tabs, which forget
   * theirs too (see {@link #forget}). A restore, refresh or load still in
   * flight no longer signs anyone in or stores anything.
   *
   * The session itself, the refresh cookie the tabs share, is ended by
   * `DELETE /session` behind the sign-in screen; the server also revokes
   * the session's tokens at GitHub then, which may take a while. The
   * request is sent only once a refresh in flight has answered: its answer
   * sets a new refresh cookie, which, arriving after the answer that clears
   * the cookie, would keep the session alive for the next load. When the
   * request fails, the cookie may still be set, and the sign-in screen
   * says so with {@link signOutUnconfirmedNote}.
   *
   * The returned promise settles, never rejecting, once the request has
   * answered and the cache entries are deleted.
   */
  async signOut(): Promise<void> {
    const refreshing = this.#refreshing;
    const cleared = this.#forget();
    const signOuts = this.#signOuts;
    this.#options.tabs.post(signedOutMessage);
    // Its outcome no longer matters: the count of sign-outs drops it.
    await refreshing?.catch(() => undefined);
    await this.#endSession(signOuts);
    await cleared;
  }

  /**
   * Signs out for a sign-out in another tab of the browser, which ends the
   * session the tabs share: forgets the session here at once (see
   * {@link #forget}) and sends no request of its own, but for one case.
   * When this tab's own refresh was in flight, its answer may set the
   * refresh cookie again, with the token GitHub rotated to, after the other
   * tab's `DELETE /session` cleared it, and so keep the session alive for
   * the next load. This tab then waits for the refresh, and when it was
   * answered with new tokens, sends `DELETE /session` itself, which revokes
   * the rotated token and clears the cookie again. A refresh that failed set
   * no cookie, and nothing is sent.
   */
  async #signedOutElsewhere(): Promise<void> {
    const renewed = this.#refreshRenewed;
    const cleared = this.#forget();
    const signOuts = this.#signOuts;
    if (renewed !== undefined && (await renewed)) {
      await this.#endSession(signOuts);
    }
    await cleared;
  }

  /**
   * Sends `DELETE /session` for the sign-out counted as `signOuts`. When it
   * fails, the sign-in screen says that the session may not have ended,
   * unless a later sign-out, here or in another tab, has its own outcome.
   */
  async #endSession(signOuts: number): Promise<void> {
    try {
      await this.#options.sessionApi.deleteSession();
    } catch (error) {
      console.warn("Could not end the session on the server:", error);
      if (signOuts === this.#signOuts && this.#state.status === "signed-out") {
        this.#signedOut(signOutUnconfirmedNote);
      }
    }
  }

  /**
   * Forgets the session in this tab, for a sign-out here or in another tab
   * of the browser: counts the sign-out, forgets the access token (which
   * also stops its refresh) and the last viewer, starts deleting the
   * viewer's cache entries, and shows the sign-in screen, which drops the
   * view and everything it shows. Every tab deletes the entries, so that a
   * write that was already under way in one tab when another signed out is
   * deleted too. Resolves once the entries are deleted.
   */
  #forget(): Promise<void> {
    const state = this.#state;
    this.#signOuts += 1;
    this.#tokens.clear();
    this.#lastViewer.forget();
    const cleared =
      state.status === "signed-in"
        ? clearViewerCache(this.#options.cache, state.login)
        : Promise.resolve();
    this.#signOut = cleared;
    this.#signedOut();
    return cleared;
  }

  /**
   * Runs a GitHub API call with the current access token. While the session
   * is not confirmed yet, waits for the restore first, and fails when it
   * did not confirm the same viewer. On a 401 the token is refreshed and the
   * call retried once, unless the refresh answered with another login.
   */
  async withAccessToken<T>(
    call: (accessToken: string) => Promise<T>,
  ): Promise<T> {
    const state = this.#state;
    if (state.status === "signed-in" && !state.confirmed) {
      await this.#restoring;
      // A sign-out under way fails the call only once its cache entries are
      // deleted, by when the view is gone, so that the view does not show a
      // failure meanwhile.
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
    const state = this.#state;
    try {
      return await call(token);
    } catch (error) {
      if (!(error instanceof GitHubApiError && error.isUnauthorized)) {
        throw error;
      }
    }
    const tokens = await this.#refresh();
    if (tokens === undefined) {
      throw new Error("The session has ended");
    }
    if (state.status === "signed-in" && tokens.login !== state.login) {
      throw new Error(`Signed in as ${tokens.login} instead`);
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
      const tokens = await this.#refresh();
      if (tokens !== undefined) {
        this.#confirm(tokens.login, signOuts);
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
      this.#confirm(tokens.login, this.#signOuts);
    } catch (error) {
      this.#tokens.clear();
      this.#signedOut(describe(error));
    }
  }

  /**
   * Signs the viewer in, confirmed, as the `login` the session API answered
   * with, and remembers them as the last viewer; unless they signed out
   * since `signOuts` was counted.
   */
  #confirm(login: string, signOuts: number): void {
    if (signOuts !== this.#signOuts) {
      return;
    }
    this.#lastViewer.remember(login);
    this.#setState({ status: "signed-in", login, confirmed: true });
  }

  /**
   * Replaces the access token from the refresh cookie, and resolves the
   * session API's answer. When the session API answers 401, the session has
   * ended: resolves `undefined`, forgets the last viewer and signs out.
   * Other failures reject. A refresh answered after a sign-out resolves
   * `undefined` and keeps no token. When a confirmed session's refresh
   * answers with another login (the refresh cookie, shared by the browser's
   * tabs, now belongs to someone who signed in elsewhere), the session
   * switches to that login.
   */
  #refresh(): Promise<SessionTokens | undefined> {
    if (this.#refreshing !== undefined) {
      return this.#refreshing;
    }
    const signOuts = this.#signOuts;
    const answer = this.#options.sessionApi.refreshSession();
    this.#refreshRenewed = answer.then(
      () => true,
      () => false,
    );
    this.#refreshing = answer
      .then(
        (tokens: SessionTokens) => {
          if (signOuts !== this.#signOuts) {
            return undefined;
          }
          this.#tokens.set(tokens);
          const state = this.#state;
          if (
            state.status === "signed-in" &&
            state.confirmed &&
            state.login !== tokens.login
          ) {
            this.#confirm(tokens.login, signOuts);
          }
          return tokens;
        },
        (error: unknown) => {
          if (signOuts !== this.#signOuts) {
            return undefined;
          }
          this.#tokens.clear();
          if (error instanceof SessionApiError && error.status === 401) {
            this.#lastViewer.forget();
            this.#signedOut();
            return undefined;
          }
          throw error;
        },
      )
      .finally(() => {
        this.#refreshing = undefined;
        this.#refreshRenewed = undefined;
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
