import { MemoryStore, type KeyValueStore } from "@yagura/browser";
import { http, HttpResponse, type HttpHandler } from "msw";
import {
  mockPullRequests,
  searchMockPullRequests,
  type MockPullRequestNode,
} from "./pull-requests";

/** The GitHub login the mock session API answers with. */
export const mockLogin = "mock-user";

/** The organization the mock reports the GitHub App installed on. */
export const mockOrganization = "mock-org";

/**
 * The organizations the development server's mock reports the GitHub App
 * installed on: more than one, so that the header's organization selector
 * shows. Each has the same members and pull requests.
 */
export const mockDevelopmentOrganizations: readonly string[] = [
  mockOrganization,
  "mock-labs",
];

/** The members of {@link mockOrganization}, sorted by login. */
export const mockMemberLogins: readonly string[] = [
  "mock-alice",
  "mock-bob",
  "mock-carol",
  mockLogin,
];

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
  /**
   * The organizations `GET /user/installations` reports the GitHub App
   * installed on. Defaults to {@link mockOrganization} alone.
   */
  readonly organizations?: readonly string[];
  /**
   * The time the fixture pull requests are placed relative to. Defaults to
   * the mock's creation.
   */
  readonly now?: Date;
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
 * MSW handlers for the session API (docs/design/session-api.md) and the
 * GitHub API endpoints the app calls, sharing enough state for the sign-in
 * flow to complete:
 *
 * - `POST /session` with any code signs the mock session in and issues an
 *   access token for {@link mockLogin}, answering with that login;
 * - `POST /session/refresh` issues a new access token, with the login, while
 *   signed in, and answers `401 invalid_session` otherwise;
 * - `DELETE /session` signs out;
 * - `GET /user/installations` answers an installation on each of the
 *   `organizations` option's organizations, by default {@link mockOrganization};
 * - `GET /orgs/{org}/members` answers {@link mockMemberLogins} for any of
 *   those organizations, and `404` for another;
 * - `POST /graphql` answers a pull request `search` with the members'
 *   fixture pull requests, spread over the 14 days before the `now` option
 *   (open, merged, one created before the period and merged in it, closed,
 *   across three repositories), filtered by the query's `author:`,
 *   `is:merged`, `created:` and `merged:` qualifiers (`>=` and `a..b`
 *   ranges), each with its id, state and times only, as the app's search
 *   asks for. It answers a `nodes(ids:)` lookup with the whole fixtures of
 *   those ids, and `null` with a `NOT_FOUND` error for an unknown one, as
 *   GitHub does. It tells the two apart by the `query` and `ids` variables
 *   and does not parse the GraphQL document. {@link holdGraphql} holds
 *   chosen answers back, so that tests can observe what is sent while
 *   another request is still waiting; {@link holdRequests} does the same
 *   for any request.
 *
 * The GitHub endpoints answer `401` for a token the mock did not issue while
 * signed in, as GitHub does for a bad token, and fit on a single page.
 */
export class ApiMock {
  readonly handlers: readonly HttpHandler[];
  readonly #store: KeyValueStore;
  readonly #issued = new Set<string>();
  readonly #requests: RecordedRequest[] = [];
  readonly #organizations: readonly string[];
  readonly #pullRequests: MockPullRequestNode[];
  readonly #holds: Hold[] = [];
  readonly #requestHolds: RequestHold[] = [];

  constructor(options: ApiMockOptions) {
    this.#store = options.store ?? new MemoryStore();
    this.#organizations = options.organizations ?? [mockOrganization];
    this.#pullRequests = mockPullRequests(options.now ?? new Date());
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
      http.get(`${githubApi}/user/installations`, async ({ request }) => {
        await this.#record(request);
        if (!this.#authorized(request)) {
          return badCredentials();
        }
        return HttpResponse.json({
          total_count: this.#organizations.length,
          installations: this.#organizations.map((login, index) => ({
            id: index + 1,
            account: {
              login,
              type: "Organization",
              avatar_url: avatarUrl(login),
            },
          })),
        });
      }),
      http.get(
        `${githubApi}/orgs/:org/members`,
        async ({ request, params }) => {
          await this.#record(request);
          if (!this.#authorized(request)) {
            return badCredentials();
          }
          if (!this.#organizations.includes(String(params.org))) {
            return HttpResponse.json({ message: "Not Found" }, { status: 404 });
          }
          return HttpResponse.json(
            mockMemberLogins.map((login) => ({
              login,
              avatar_url: avatarUrl(login),
            })),
          );
        },
      ),
      http.post(`${githubApi}/graphql`, async ({ request }) => {
        const body = await this.#record(request);
        if (!this.#authorized(request)) {
          return badCredentials();
        }
        const variables = isRecord(body) ? body.variables : undefined;
        const query = isRecord(variables) ? variables.query : undefined;
        const ids = isRecord(variables) ? variables.ids : undefined;
        await this.#held(isRecord(variables) ? variables : {});
        if (isStringArray(ids)) {
          return this.#lookUpNodes(ids);
        }
        if (typeof query !== "string") {
          return HttpResponse.json({
            data: null,
            errors: [
              { message: "The API mock answers only searches and lookups" },
            ],
          });
        }
        return HttpResponse.json({
          data: {
            search: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: searchMockPullRequests(this.#pullRequests, query).map(
                ({ __typename, id, state, createdAt, mergedAt }) => ({
                  __typename,
                  id,
                  state,
                  createdAt,
                  mergedAt,
                }),
              ),
            },
          },
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

  /**
   * The search queries of the GraphQL requests, in order. Lookups by id are
   * not searches and are left out.
   */
  get searches(): readonly string[] {
    return this.#graphqlVariables().flatMap(({ query }) =>
      typeof query === "string" ? [query] : [],
    );
  }

  /** The ids of each GraphQL `nodes(ids:)` lookup, in order. */
  get lookups(): readonly (readonly string[])[] {
    return this.#graphqlVariables().flatMap(({ ids }) =>
      isStringArray(ids) ? [ids] : [],
    );
  }

  /**
   * Adds a pull request to those the mock serves, as if it were opened
   * after the mock was created.
   */
  addPullRequest(pullRequest: MockPullRequestNode): void {
    this.#pullRequests.push(pullRequest);
  }

  /**
   * Holds back the answer to every GraphQL request whose variables `match`
   * accepts until the returned function is called. A held request is
   * recorded when it arrives, so it shows in {@link requests} while held.
   */
  holdGraphql(
    match: (variables: Readonly<Record<string, unknown>>) => boolean,
  ): () => void {
    let release!: () => void;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#holds.push({ match, released });
    return release;
  }

  /**
   * Holds back the answer to every request that `match` accepts, as it is
   * recorded, until the returned function is called. For the GraphQL
   * requests, {@link holdGraphql} matches on their variables.
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

  #graphqlVariables(): Record<string, unknown>[] {
    return this.requestsTo("POST", `${githubApi}/graphql`).flatMap(
      ({ body }) =>
        isRecord(body) && isRecord(body.variables) ? [body.variables] : [],
    );
  }

  /** Waits for the release of each hold that `variables` match. */
  async #held(variables: Readonly<Record<string, unknown>>): Promise<void> {
    for (const { match, released } of this.#holds) {
      if (match(variables)) {
        await released;
      }
    }
  }

  #lookUpNodes(ids: readonly string[]): Response {
    const nodes = ids.map(
      (id) => this.#pullRequests.find((pr) => pr.id === id) ?? null,
    );
    const errors = ids.flatMap((id, index) =>
      nodes[index] === null
        ? [
            {
              type: "NOT_FOUND",
              path: ["nodes", index],
              message: `Could not resolve to a node with the global id of '${id}'.`,
            },
          ]
        : [],
    );
    return HttpResponse.json({
      data: { nodes },
      ...(errors.length > 0 && { errors }),
    });
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

/** Answers held back by {@link ApiMock.holdGraphql}. */
interface Hold {
  readonly match: (variables: Readonly<Record<string, unknown>>) => boolean;
  readonly released: Promise<void>;
}

/** Answers held back by {@link ApiMock.holdRequests}. */
interface RequestHold {
  readonly match: (request: RecordedRequest) => boolean;
  readonly released: Promise<void>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
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

function badCredentials(): Response {
  return HttpResponse.json({ message: "Bad credentials" }, { status: 401 });
}

/**
 * A placeholder avatar: a colored square with the login's initial, inline so
 * that mock mode loads nothing from the network.
 */
function avatarUrl(login: string): string {
  const hue = [...login].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 360;
  const initial = login
    .replace(/^mock-/, "")
    .charAt(0)
    .toUpperCase();
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">` +
    `<rect width="40" height="40" fill="hsl(${hue} 50% 60%)"/>` +
    `<text x="20" y="26" font-family="sans-serif" font-size="18" ` +
    `text-anchor="middle" fill="white">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function error(status: number, code: string): Response {
  return HttpResponse.json({ error: code }, { status });
}
