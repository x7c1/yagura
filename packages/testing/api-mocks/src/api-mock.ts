import { MemoryStore, type KeyValueStore } from "@yagura/browser";
import { http, HttpResponse, type HttpHandler, type JsonBodyType } from "msw";
import {
  mockActivityFixtures,
  mockActivityResponse,
  mockLogin,
  mockMembers,
  type MockActivityFixtures,
} from "./activity";

/** The organization the mock lets the viewer use. */
export const mockOrganization = "mock-org";

/**
 * The organizations the development server's mock lets the viewer use:
 * more than one, so that the header's organization selector shows. Each
 * has the same members and activity.
 */
export const mockDevelopmentOrganizations: readonly string[] = [
  mockOrganization,
  "mock-labs",
];

/** The id the mock gives the organization `login`. */
export function mockOrganizationId(login: string): string {
  return `O_${login}`;
}

/** The host GitHub serves accounts' avatars from, by their numeric id. */
const githubAvatars = "https://avatars.githubusercontent.com";

/** The longest range `GET /activity` answers: 31 days and an hour. */
const maxRangeMs = (31 * 24 + 1) * 60 * 60 * 1000;

/** How long a signal token is good for: 15 minutes. */
const signalTokenLifetimeMs = 15 * 60 * 1000;

/** The id of the viewer, {@link mockLogin}, among the members. */
const mockViewerId =
  mockMembers.find(({ login }) => login === mockLogin)?.id ?? "";

const signedInKey = "yagura.api-mock.signed-in";
const accessTokenLifetimeSeconds = 28800;

export interface ApiMockOptions {
  /**
   * Base URL of the Yagura API, without a trailing slash: the session API
   * and the activity API are on the same host.
   */
  readonly sessionApiBaseUrl: string;
  /**
   * Where the signed-in flag lives; it stands in for the refresh cookie.
   * Defaults to memory. In the browser, a `sessionStorage` store keeps the
   * mock session across reloads, as the cookie would.
   */
  readonly store?: KeyValueStore;
  /** Starts the mock session signed in, as if a refresh cookie were set. */
  readonly signedIn?: boolean;
  /**
   * The logins of the organizations `GET /activity/organizations` lists.
   * Defaults to {@link mockOrganization} alone.
   */
  readonly organizations?: readonly string[];
  /**
   * The time the fixture activity is placed relative to. Defaults to the
   * mock's creation.
   */
  readonly now?: Date;
}

/** A request the mock answered, for assertions on what the app sent. */
export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly credentials: RequestCredentials;
  /** The `Authorization` header, or `null` when the request had none. */
  readonly authorization: string | null;
  /** The JSON body, or `undefined` when the request had none. */
  readonly body: unknown;
}

/**
 * MSW handlers for the session API (docs/design/session-api.md) and the
 * activity API (docs/design/activity-api.md), sharing enough state for the
 * sign-in flow to complete:
 *
 * - `POST /session` with any code signs the mock session in and issues an
 *   access token for {@link mockLogin}, answering with that login;
 * - `POST /session/refresh` issues a new access token, with the login, while
 *   signed in, and answers `401 invalid_session` otherwise;
 * - `DELETE /session` signs out;
 * - `GET /activity/organizations` lists the `organizations` option's
 *   organizations, by default {@link mockOrganization}, in login order;
 * - `GET /activity` answers the fixture activity (see `activity.ts`) in
 *   the requested range for any of those organizations, `403 forbidden` for
 *   another, and `400 invalid_request` for a missing or bad parameter or a
 *   range longer than 31 days and an hour;
 * - `POST /activity/signal-token` issues a signal token for the viewer's
 *   channel. The mock has no realtime endpoint to use it with, so a page
 *   served from it is not live;
 * - `GET https://avatars.githubusercontent.com/u/<id>` answers a placeholder
 *   avatar for an account of the fixtures, so that the avatars the app
 *   finds by account id load nothing from the network either.
 *
 * The activity API answers `401 invalid_token` for a token the mock did not
 * issue while signed in. {@link holdRequests} holds chosen answers back, so
 * that tests can observe what is drawn while a request is still waiting.
 */
export class ApiMock {
  readonly handlers: readonly HttpHandler[];
  readonly #store: KeyValueStore;
  readonly #issued = new Set<string>();
  readonly #requests: RecordedRequest[] = [];
  readonly #organizations: readonly string[];
  #fixtures: MockActivityFixtures;
  readonly #requestHolds: RequestHold[] = [];
  #signalTokens = 0;

  constructor(options: ApiMockOptions) {
    this.#store = options.store ?? new MemoryStore();
    this.#organizations = [
      ...(options.organizations ?? [mockOrganization]),
    ].sort();
    this.#fixtures = mockActivityFixtures(options.now ?? new Date());
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
      http.get(`${base}/activity/organizations`, async ({ request }) => {
        await this.#record(request);
        if (!this.#authorized(request)) {
          return error(401, "invalid_token");
        }
        return noStore({
          organizations: this.#organizations.map((login) => ({
            id: mockOrganizationId(login),
            login,
            avatarUrl: avatarUrl(login),
          })),
        });
      }),
      http.get(`${base}/activity`, async ({ request }) => {
        await this.#record(request);
        if (!this.#authorized(request)) {
          return error(401, "invalid_token");
        }
        const params = new URL(request.url).searchParams;
        const organization = params.get("organization");
        const from = parseBound(params.get("from"));
        const to = parseBound(params.get("to"));
        if (
          organization === null ||
          from === undefined ||
          to === undefined ||
          to.getTime() < from.getTime() ||
          to.getTime() - from.getTime() > maxRangeMs
        ) {
          return error(400, "invalid_request");
        }
        if (
          !this.#organizations.some(
            (login) => mockOrganizationId(login) === organization,
          )
        ) {
          return error(403, "forbidden");
        }
        return noStore(mockActivityResponse(this.#fixtures, from, to));
      }),
      http.post(`${base}/activity/signal-token`, async ({ request }) => {
        await this.#record(request);
        if (!this.#authorized(request)) {
          return error(401, "invalid_token");
        }
        this.#signalTokens += 1;
        return noStore({
          token: `mock-signal-token-${this.#signalTokens}`,
          expiresAt: new Date(Date.now() + signalTokenLifetimeMs).toISOString(),
          channel: `/mock-yagura-viewers/${mockViewerId}`,
        });
      }),
      http.get(`${githubAvatars}/u/:id`, ({ params }) => {
        const { members, bots } = this.#fixtures;
        const account = [...members, ...bots].find(
          ({ id }) => id === params["id"],
        );
        return new HttpResponse(avatarSvg(account?.login ?? "?"), {
          headers: { "Content-Type": "image/svg+xml" },
        });
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

  /** The requests for an organization's activity, in order. */
  get activityRequests(): readonly RecordedRequest[] {
    return this.#requests.filter(
      ({ method, url }) =>
        method === "GET" && new URL(url).pathname === "/activity",
    );
  }

  /** The requests for a signal token, in order. */
  get signalTokenRequests(): readonly RecordedRequest[] {
    return this.#requests.filter(
      ({ method, url }) =>
        method === "POST" && new URL(url).pathname === "/activity/signal-token",
    );
  }

  /** What the activity API serves, before it is narrowed to a range. */
  get fixtures(): MockActivityFixtures {
    return this.#fixtures;
  }

  /** Replaces what the activity API serves from now on. */
  set fixtures(fixtures: MockActivityFixtures) {
    this.#fixtures = fixtures;
  }

  /**
   * Holds back the answer to every request that `match` accepts, as it is
   * recorded, until the returned function is called. A held request shows
   * in {@link requests} while held.
   */
  holdRequests(match: (request: RecordedRequest) => boolean): () => void {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#requestHolds.push({ match, released });
    return release;
  }

  /** Forgets the requests recorded so far. */
  clearRequests(): void {
    this.#requests.length = 0;
  }

  /** The recorded requests to `url` with `method`. */
  requestsTo(method: string, url: string): readonly RecordedRequest[] {
    return this.#requests.filter(
      (request) => request.method === method && request.url === url,
    );
  }

  /** Whether the request carries a token the mock issued while signed in. */
  #authorized(request: Request): boolean {
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    return this.signedIn && token !== undefined && this.#issued.has(token);
  }

  #issueTokens(): Response {
    const accessToken = `ghu_mock_${this.#issued.size + 1}`;
    this.#issued.add(accessToken);
    return HttpResponse.json({
      access_token: accessToken,
      token_type: "bearer",
      expires_in: accessTokenLifetimeSeconds,
      login: mockLogin,
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
    const recorded: RecordedRequest = {
      method: request.method,
      url: request.url,
      credentials: request.credentials,
      authorization: request.headers.get("Authorization"),
      body,
    };
    this.#requests.push(recorded);
    for (const { match, released } of this.#requestHolds) {
      if (match(recorded)) {
        await released;
      }
    }
    return body;
  }
}

/** Answers held back by {@link ApiMock.holdRequests}. */
interface RequestHold {
  readonly match: (request: RecordedRequest) => boolean;
  readonly released: Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCreateSessionBody(body: unknown): boolean {
  if (!isRecord(body)) {
    return false;
  }
  const { code, code_verifier, redirect_uri } = body;
  return (
    typeof code === "string" &&
    typeof code_verifier === "string" &&
    typeof redirect_uri === "string"
  );
}

/**
 * A bound of the requested range, which must carry its zone (`Z` or an
 * offset), or `undefined` when it is missing or unreadable.
 */
function parseBound(value: string | null): Date | undefined {
  if (value === null || !/(Z|[+-]\d\d:\d\d)$/.test(value)) {
    return undefined;
  }
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? undefined : time;
}

/**
 * A placeholder avatar as a data URL, so that mock mode loads nothing from
 * the network.
 */
function avatarUrl(login: string): string {
  return `data:image/svg+xml,${encodeURIComponent(avatarSvg(login))}`;
}

/** A placeholder avatar: a colored square with the login's initial. */
function avatarSvg(login: string): string {
  const hue = [...login].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
  const initial = login
    .replace(/^mock-/, "")
    .charAt(0)
    .toUpperCase();
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">` +
    `<rect width="40" height="40" fill="hsl(${hue} 50% 60%)"/>` +
    `<text x="20" y="26" font-family="sans-serif" font-size="18" ` +
    `text-anchor="middle" fill="white">${initial}</text></svg>`
  );
}

/** A JSON answer of the activity API, which is never to be cached. */
function noStore(body: JsonBodyType): Response {
  return HttpResponse.json(body, {
    headers: { "Cache-Control": "no-store" },
  });
}

function error(status: number, code: string): Response {
  return HttpResponse.json(
    { error: code, error_description: `The API mock answers ${code}.` },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
