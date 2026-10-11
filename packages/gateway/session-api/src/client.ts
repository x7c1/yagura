import { SessionApiError } from "./error";
import { parseSessionTokens, type SessionTokens } from "./tokens";

export interface SessionApiClientOptions {
  /** Base URL of the session API, without a trailing slash. */
  readonly baseUrl: string;
  /**
   * Defaults to the global `fetch`, looked up on every request so that a
   * request interceptor installed later (such as a mock) is honored.
   */
  readonly fetch?: typeof fetch;
}

export interface CreateSessionRequest {
  readonly code: string;
  readonly codeVerifier: string;
  readonly redirectUri: string;
}

/** Typed client for the session API (see docs/design/session-api.md). */
export class SessionApiClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: SessionApiClientOptions) {
    this.#baseUrl = options.baseUrl;
    // Call the function unbound: the browser's fetch rejects any receiver
    // other than the global object.
    const fetchFn = options.fetch;
    this.#fetch = (input, init) => (fetchFn ?? fetch)(input, init);
  }

  /** `POST /session`: exchanges the authorization code for tokens. */
  async createSession(request: CreateSessionRequest): Promise<SessionTokens> {
    const response = await this.#request("POST", "/session", {
      code: request.code,
      code_verifier: request.codeVerifier,
      redirect_uri: request.redirectUri,
    });
    return readTokens(response);
  }

  /** `POST /session/refresh`: obtains a new access token from the cookie. */
  async refreshSession(): Promise<SessionTokens> {
    const response = await this.#request("POST", "/session/refresh");
    return readTokens(response);
  }

  /** `DELETE /session`: clears the refresh cookie. */
  async deleteSession(): Promise<void> {
    await this.#request("DELETE", "/session");
  }

  async #request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const response = await this.#fetch(this.#baseUrl + path, {
      method,
      credentials: "include",
      headers:
        body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      throw SessionApiError.fromBody(response.status, await readJson(response));
    }
    return response;
  }
}

async function readTokens(response: Response): Promise<SessionTokens> {
  const tokens = parseSessionTokens(await readJson(response));
  if (!tokens) {
    throw new SessionApiError(response.status, "unexpected_response");
  }
  return tokens;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
