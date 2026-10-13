import type {
  FoundPullRequest,
  PullRequest,
  PullRequestState,
} from "@yagura/activity";
import { GitHubApiError } from "./error";

const baseUrl = "https://api.github.com";

/** The largest page size GitHub's REST and GraphQL APIs accept. */
const pageSize = 100;

/** The login GitHub shows for the author of a deleted account. */
const ghostLogin = "ghost";

/** The fields {@link PullRequest} needs, on a node that may be one. */
const pullRequestFields = `
  __typename
  ... on PullRequest {
    id
    title
    url
    repository { nameWithOwner }
    author { login }
    state
    createdAt
    mergedAt
    additions
    deletions
  }`;

/**
 * One page of a pull request search, with only what places a pull request
 * on a day: GitHub computes the lines per pull request, which makes a search
 * asking for them slow.
 */
const searchPullRequestIdsQuery = `
query SearchPullRequestIds($query: String!, $after: String) {
  search(type: ISSUE, query: $query, first: ${pageSize}, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on PullRequest {
        id
        state
        createdAt
        mergedAt
      }
    }
  }
}`;

/** Pull requests by node id, at most {@link pageSize} at a time. */
const pullRequestsByIdQuery = `
query PullRequests($ids: [ID!]!) {
  nodes(ids: $ids) {${pullRequestFields}
  }
}`;

/**
 * The GraphQL error types a `nodes` lookup reports for an id it answers
 * with `null`: one that no longer exists, or that the token cannot see.
 */
const missingNodeErrorTypes: ReadonlySet<unknown> = new Set([
  "NOT_FOUND",
  "FORBIDDEN",
]);

const pullRequestStates: Readonly<Record<string, PullRequestState>> = {
  OPEN: "open",
  MERGED: "merged",
  CLOSED: "closed",
};

export interface GitHubApiClientOptions {
  /**
   * Defaults to the global `fetch`, looked up on every request so that a
   * request interceptor installed later (such as a mock) is honored.
   */
  readonly fetch?: typeof fetch;
}

/** An organization the GitHub App is installed on. */
export interface Organization {
  readonly login: string;
  /**
   * The organization's avatar image. Absent when it is not known, as in an
   * organization stored before avatars were kept.
   */
  readonly avatarUrl?: string;
}

/** A member of an organization. */
export interface Member {
  readonly login: string;
  readonly avatarUrl: string;
}

/** Typed client for the GitHub API. */
export class GitHubApiClient {
  readonly #fetch: typeof fetch;

  constructor(options: GitHubApiClientOptions = {}) {
    // Call the function unbound: the browser's fetch rejects any receiver
    // other than the global object.
    const fetchFn = options.fetch;
    this.#fetch = (input, init) => (fetchFn ?? fetch)(input, init);
  }

  /**
   * `GET /user/installations`: the organizations the GitHub App is installed
   * on among those the user can access, sorted by login. Installations on
   * user accounts are left out.
   */
  async listOrganizationInstallations(
    accessToken: string,
  ): Promise<Organization[]> {
    const organizations = await this.#getAllPages(
      accessToken,
      "/user/installations",
      (body) => {
        const installations = isRecord(body) ? body.installations : undefined;
        if (!Array.isArray(installations)) {
          return undefined;
        }
        const page: Organization[] = [];
        for (const installation of installations) {
          const account: unknown = isRecord(installation)
            ? installation.account
            : undefined;
          if (!isRecord(account) || typeof account.login !== "string") {
            return undefined;
          }
          if (account.type === "Organization") {
            page.push(
              typeof account.avatar_url === "string"
                ? { login: account.login, avatarUrl: account.avatar_url }
                : { login: account.login },
            );
          }
        }
        return page;
      },
    );
    return organizations.sort((a, b) => compare(a.login, b.login));
  }

  /** `GET /orgs/{org}/members`: the organization's members, sorted by login. */
  async listOrganizationMembers(
    accessToken: string,
    org: string,
  ): Promise<Member[]> {
    const members = await this.#getAllPages(
      accessToken,
      `/orgs/${encodeURIComponent(org)}/members`,
      (body) => {
        if (!Array.isArray(body)) {
          return undefined;
        }
        const page: Member[] = [];
        for (const member of body) {
          if (
            !isRecord(member) ||
            typeof member.login !== "string" ||
            typeof member.avatar_url !== "string"
          ) {
            return undefined;
          }
          page.push({ login: member.login, avatarUrl: member.avatar_url });
        }
        return page;
      },
    );
    return members.sort((a, b) => compare(a.login, b.login));
  }

  /**
   * The GraphQL `search` for pull requests matching `query` (GitHub's search
   * syntax), following every page, with each pull request's id, state and
   * times only; {@link getPullRequests} looks up the rest. Results that are
   * not pull requests, such as issues, are left out.
   */
  async searchPullRequestIds(
    accessToken: string,
    query: string,
  ): Promise<FoundPullRequest[]> {
    const pullRequests: FoundPullRequest[] = [];
    let after: string | null = null;
    do {
      const { response, data } = await this.#graphql(
        accessToken,
        searchPullRequestIdsQuery,
        { query, after },
      );
      const page = parseSearchPage(data);
      if (page === undefined) {
        throw new GitHubApiError(
          response.status,
          "GitHub API returned an unexpected body to the pull request search",
        );
      }
      pullRequests.push(...page.pullRequests);
      after = page.endCursor;
    } while (after !== null);
    return pullRequests;
  }

  /**
   * The GraphQL `nodes` lookup for the pull requests with the given node
   * ids, {@link pageSize} ids per request. An id that comes back `null`
   * (deleted, or no longer visible to the token) or as something other
   * than a pull request is left out; the rest keep the order of `ids`.
   */
  async getPullRequests(
    accessToken: string,
    ids: readonly string[],
  ): Promise<PullRequest[]> {
    const pullRequests: PullRequest[] = [];
    for (let start = 0; start < ids.length; start += pageSize) {
      const { response, data } = await this.#graphql(
        accessToken,
        pullRequestsByIdQuery,
        { ids: ids.slice(start, start + pageSize) },
        (error) => missingNodeErrorTypes.has(error.type),
      );
      const page = parseNodes(data);
      if (page === undefined) {
        throw new GitHubApiError(
          response.status,
          "GitHub API returned an unexpected body to the pull request lookup",
        );
      }
      pullRequests.push(...page);
    }
    return pullRequests;
  }

  /**
   * GETs every page of a list endpoint, following the `Link` header's
   * `rel="next"`. `parse` turns one page's body into its items, or
   * `undefined` when the body is not the expected shape.
   */
  async #getAllPages<T>(
    accessToken: string,
    path: string,
    parse: (body: unknown) => T[] | undefined,
  ): Promise<T[]> {
    const items: T[] = [];
    let url: string | undefined = `${baseUrl}${path}?per_page=${pageSize}`;
    while (url !== undefined) {
      const { response, body } = await this.#get(accessToken, path, url);
      const page = parse(body);
      if (page === undefined) {
        throw new GitHubApiError(
          response.status,
          `GitHub API returned an unexpected body to GET ${path}`,
        );
      }
      items.push(...page);
      url = nextPageUrl(response.headers.get("Link"));
    }
    return items;
  }

  /**
   * GETs `url` (by default `path` on the API) and reads the JSON body.
   * `path` names the endpoint in errors.
   */
  async #get(
    accessToken: string,
    path: string,
    url = `${baseUrl}${path}`,
  ): Promise<{ response: Response; body: unknown }> {
    return this.#request(accessToken, `GET ${path}`, url, { method: "GET" });
  }

  /**
   * POSTs a GraphQL query and returns its `data`. A response carrying
   * `errors` is a {@link GitHubApiError} with the first error's message,
   * unless `tolerate` accepts every one of them and `data` came back.
   */
  async #graphql(
    accessToken: string,
    query: string,
    variables: Record<string, unknown>,
    tolerate: (error: Record<string, unknown>) => boolean = () => false,
  ): Promise<{ response: Response; data: unknown }> {
    const { response, body } = await this.#request(
      accessToken,
      "POST /graphql",
      `${baseUrl}/graphql`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      },
    );
    if (
      isRecord(body) &&
      Array.isArray(body.errors) &&
      !(
        isRecord(body.data) &&
        body.errors.every((error) => isRecord(error) && tolerate(error))
      )
    ) {
      const [first]: unknown[] = body.errors;
      const message =
        isRecord(first) && typeof first.message === "string"
          ? first.message
          : "GitHub API returned an error to POST /graphql";
      throw new GitHubApiError(response.status, message);
    }
    return { response, data: isRecord(body) ? body.data : undefined };
  }

  /**
   * Sends a request with the access token and reads the JSON body. `name`
   * (such as `GET /user/installations`) names the endpoint in errors.
   */
  async #request(
    accessToken: string,
    name: string,
    url: string,
    init: { method: string; headers?: Record<string, string>; body?: string },
  ): Promise<{ response: Response; body: unknown }> {
    const response = await this.#fetch(url, {
      ...init,
      headers: {
        ...init.headers,
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new GitHubApiError(
        response.status,
        `GitHub API responded ${response.status} to ${name}`,
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    return { response, body };
  }
}

/**
 * One page of the pull request search: its pull requests and the cursor of
 * the next page, `null` on the last. `undefined` when `data` is not the
 * expected shape.
 */
function parseSearchPage(
  data: unknown,
): { pullRequests: FoundPullRequest[]; endCursor: string | null } | undefined {
  const search = isRecord(data) ? data.search : undefined;
  if (!isRecord(search) || !Array.isArray(search.nodes)) {
    return undefined;
  }
  const { pageInfo } = search;
  if (!isRecord(pageInfo) || typeof pageInfo.hasNextPage !== "boolean") {
    return undefined;
  }
  let endCursor: string | null = null;
  if (pageInfo.hasNextPage) {
    if (typeof pageInfo.endCursor !== "string") {
      return undefined;
    }
    endCursor = pageInfo.endCursor;
  }
  const pullRequests: FoundPullRequest[] = [];
  for (const node of search.nodes) {
    if (isRecord(node) && node.__typename !== "PullRequest") {
      continue;
    }
    const pullRequest = parseFoundPullRequest(node);
    if (pullRequest === undefined) {
      return undefined;
    }
    pullRequests.push(pullRequest);
  }
  return { pullRequests, endCursor };
}

/**
 * The pull requests of a `nodes` lookup, leaving out `null` and other
 * nodes. `undefined` when `data` is not the expected shape.
 */
function parseNodes(data: unknown): PullRequest[] | undefined {
  const nodes = isRecord(data) ? data.nodes : undefined;
  if (!Array.isArray(nodes)) {
    return undefined;
  }
  const pullRequests: PullRequest[] = [];
  for (const node of nodes) {
    if (
      node === null ||
      (isRecord(node) && node.__typename !== "PullRequest")
    ) {
      continue;
    }
    const pullRequest = parsePullRequest(node);
    if (pullRequest === undefined) {
      return undefined;
    }
    pullRequests.push(pullRequest);
  }
  return pullRequests;
}

/** The id, state and times of a pull request node. */
function parseFoundPullRequest(node: unknown): FoundPullRequest | undefined {
  if (!isRecord(node)) {
    return undefined;
  }
  const { id } = node;
  const state =
    typeof node.state === "string" ? pullRequestStates[node.state] : undefined;
  const createdAt = parseTime(node.createdAt);
  const mergedAt = node.mergedAt === null ? null : parseTime(node.mergedAt);
  if (
    typeof id !== "string" ||
    state === undefined ||
    createdAt === undefined ||
    mergedAt === undefined
  ) {
    return undefined;
  }
  return { id, state, createdAt, mergedAt };
}

function parsePullRequest(node: unknown): PullRequest | undefined {
  const found = parseFoundPullRequest(node);
  if (found === undefined || !isRecord(node)) {
    return undefined;
  }
  const { title, url, repository, author, additions, deletions } = node;
  const repositoryName = isRecord(repository)
    ? repository.nameWithOwner
    : undefined;
  // A deleted account's pull requests have no author.
  const login =
    author === null ? ghostLogin : isRecord(author) ? author.login : undefined;
  if (
    typeof title !== "string" ||
    typeof url !== "string" ||
    typeof repositoryName !== "string" ||
    typeof login !== "string" ||
    typeof additions !== "number" ||
    typeof deletions !== "number"
  ) {
    return undefined;
  }
  return {
    ...found,
    title,
    url,
    repository: repositoryName,
    author: login,
    additions,
    deletions,
  };
}

/** An ISO 8601 timestamp as a `Date`, or `undefined` if it is not one. */
function parseTime(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? undefined : time;
}

/** The `rel="next"` URL of a `Link` header, if there is one. */
function nextPageUrl(link: string | null): string | undefined {
  for (const part of link?.split(",") ?? []) {
    const match = /^\s*<([^>]*)>\s*;\s*rel="next"\s*$/.exec(part);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Orders logins as GitHub treats them: case-insensitively. */
function compare(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}
