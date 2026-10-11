import { MemoryStore, type KeyValueStore } from "@yagura/browser";
import { http, HttpResponse, type HttpHandler } from "msw";

/** The GitHub login the mock answers `GET /user` with. */
export const mockLogin = "mock-user";

const githubApi = "https://api.github.com";
const signedInKey = "yagura.api-mock.signed-in";
const accessTokenLifetimeSeconds = 28800;

export interface ApiMockOptions {
  /** Base URL of the session API, without a trailing slash. */
  readonly sessionApiBaseUrl: string;
  /**
   * Where the signed-in flag lives; it stands in for the refresh cookie.
   * Defaults to memory. In the browser, a `sessionStorage` store keeps the
   * mock session across reloads, as the cookie would.
   */
  readonly store?: KeyValueStore;
  /** Starts the mock session signed in, as if a refresh cookie were set. */
  readonly signedIn?: boolean;
}

/** A request the mock answered, for assertions on what the app sent. */
export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly credentials: RequestCredentials;
  /** The JSON body, or `undefined` when the request had none. */
  readonly body: unknown;
}

/**
 * MSW handlers for the session API (docs/design/session-api.md) and
 * GitHub's `GET /user`, sharing enough state for the sign-in flow to
 * complete:
 *
 * - `POST /session` with any code signs the mock session in and issues an
 *   access token;
 * - `POST /session/refresh` issues a new access token while signed in, and
 *   answers `401 invalid_session` otherwise;
 * - `DELETE /session` signs out;
 * - `GET /user` answers {@link mockLogin} for a token the mock issued while
 *   signed in, and `401` for any other.
 */
export class ApiMock {
  readonly handlers: readonly HttpHandler[];
  readonly #store: KeyValueStore;
  readonly #issued = new Set<string>();
  readonly #requests: RecordedRequest[] = [];

  constructor(options: ApiMockOptions) {
    this.#store = options.store ?? new MemoryStore();
    if (options.signedIn !== undefined) {
      this.signedIn = options.signedIn;
    }
    const base = options.sessionApiBaseUrl;
    this.handlers = [
      http.post(`${base}/session`, async ({ request }) => {
        const body = await this.#record(request);
        if (!isCreateSessionBody(body)) {
          return error(400, "invalid_request");
        }
        this.signedIn = true;
        return this.#issueTokens();
      }),
      http.post(`${base}/session/refresh`, async ({ request }) => {
        await this.#record(request);
        if (!this.signedIn) {
          return error(401, "invalid_session");
        }
        return this.#issueTokens();
      }),
      http.delete(`${base}/session`, async ({ request }) => {
        await this.#record(request);
        this.signedIn = false;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${githubApi}/user`, async ({ request }) => {
        await this.#record(request);
        const token = request.headers
          .get("Authorization")
          ?.replace(/^Bearer /, "");
        if (!this.signedIn || token === undefined || !this.#issued.has(token)) {
          return HttpResponse.json(
            { message: "Bad credentials" },
            { status: 401 },
          );
        }
        return HttpResponse.json({ login: mockLogin });
      }),
    ];
  }

  /** Whether the mock session is signed in, i.e. the cookie is set. */
  get signedIn(): boolean {
    return this.#store.get(signedInKey) === "true";
  }

  set signedIn(value: boolean) {
    if (value) {
      this.#store.set(signedInKey, "true");
    } else {
      this.#store.remove(signedInKey);
      this.#issued.clear();
    }
  }

  /** Every request the handlers answered, in order. */
  get requests(): readonly RecordedRequest[] {
    return this.#requests;
  }

  /** The recorded requests to `url` with `method`. */
  requestsTo(method: string, url: string): readonly RecordedRequest[] {
    return this.#requests.filter(
      (request) => request.method === method && request.url === url,
    );
  }

  #issueTokens(): Response {
    const accessToken = `ghu_mock_${this.#issued.size + 1}`;
    this.#issued.add(accessToken);
    return HttpResponse.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: accessTokenLifetimeSeconds,
    });
  }

  async #record(request: Request): Promise<unknown> {
    const text = await request.clone().text();
    let body: unknown;
    if (text !== "") {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }
    this.#requests.push({
      method: request.method,
      url: request.url,
      credentials: request.credentials,
      body,
    });
    return body;
  }
}

function isCreateSessionBody(body: unknown): boolean {
  if (typeof body !== "object" || body === null) {
    return false;
  }
  const { code, code_verifier, redirect_uri } = body as Record<string, unknown>;
  return (
    typeof code === "string" &&
    typeof code_verifier === "string" &&
    typeof redirect_uri === "string"
  );
}

function error(status: number, code: string): Response {
  return HttpResponse.json({ error: code }, { status });
}
