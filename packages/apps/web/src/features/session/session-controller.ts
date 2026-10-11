import type { KeyValueStore, PageLocation, Timer } from "@yagura/browser";
import { GitHubApiError, type GitHubApiClient } from "@yagura/github-api";
import {
  SessionApiError,
  type SessionApiClient,
  type SessionTokens,
} from "@yagura/session-api";
import { completeCallback } from "./callback";
import { prepareSignIn } from "./sign-in";
import { TokenHolder } from "./token-holder";

export type SessionState =
  | { readonly status: "pending" }
  | { readonly status: "signed-out"; readonly error?: string }
  | { readonly status: "signed-in"; readonly login: string };

export interface SessionControllerOptions {
  readonly sessionApi: SessionApiClient;
  readonly githubApi: GitHubApiClient;
  readonly clientId: string;
  /** Must match the callback URL registered for the GitHub App. */
  readonly redirectUri: string;
  /** Holds the sign-in handoff across the redirect to GitHub. */
  readonly storage: KeyValueStore;
  /** The page's address, read on the callback and left afterwards. */
  readonly location: PageLocation;
  /** Schedules the access token's refresh before it expires. */
  readonly timer: Timer;
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
  #state: SessionState = { status: "pending" };
  #restoring: Promise<void> | undefined;
  #callback: Promise<void> | undefined;
  #refreshing: Promise<boolean> | undefined;

  constructor(options: SessionControllerOptions) {
    this.#options = options;
    this.#tokens = new TokenHolder(
      options.timer,
      () => void this.#refreshOnExpiry(),
    );
  }

  /** The page's address. */
  get location(): PageLocation {
    return this.#options.location;
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
   * session API for one once. Repeated calls share the first attempt. Does
   * nothing after `handleCallback`, whose outcome (including its error) is
   * already the session state.
   */
  restore(): Promise<void> {
    this.#restoring ??= this.#restore();
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

  async signOut(): Promise<void> {
    this.#tokens.clear();
    try {
      await this.#options.sessionApi.deleteSession();
      this.#signedOut();
    } catch (error) {
      this.#signedOut(`Signed out locally, but ${describe(error)}`);
    }
  }

  /**
   * Runs a GitHub API call with the current access token. On a 401 the token
   * is refreshed and the call retried once.
   */
  async withAccessToken<T>(
    call: (accessToken: string) => Promise<T>,
  ): Promise<T> {
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

  async #restore(): Promise<void> {
    if (
      this.#callback !== undefined ||
      this.#tokens.accessToken !== undefined
    ) {
      return;
    }
    try {
      if (await this.#refresh()) {
        await this.#loadViewer();
      }
    } catch (error) {
      this.#signedOut(describe(error));
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
      await this.#loadViewer();
    } catch (error) {
      this.#tokens.clear();
      this.#signedOut(describe(error));
    }
  }

  async #loadViewer(): Promise<void> {
    const viewer = await this.withAccessToken((token) =>
      this.#options.githubApi.getViewer(token),
    );
    this.#setState({ status: "signed-in", login: viewer.login });
  }

  /**
   * Replaces the access token from the refresh cookie. Resolves `false` and
   * signs out when the session API answers 401; other failures reject.
   */
  #refresh(): Promise<boolean> {
    this.#refreshing ??= this.#options.sessionApi
      .refreshSession()
      .then(
        (tokens: SessionTokens) => {
          this.#tokens.set(tokens);
          return true;
        },
        (error: unknown) => {
          this.#tokens.clear();
          if (error instanceof SessionApiError && error.status === 401) {
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

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
