import { GitHubApiError } from "./error";

const baseUrl = "https://api.github.com";

/** The largest page size GitHub's REST API accepts. */
const pageSize = 100;

export interface GitHubApiClientOptions {
  /**
   * Defaults to the global `fetch`, looked up on every request so that a
   * request interceptor installed later (such as a mock) is honored.
   */
  readonly fetch?: typeof fetch;
}

/** The signed-in user, as far as the app needs it. */
export interface Viewer {
  readonly login: string;
}

/** An organization the GitHub App is installed on. */
export interface Organization {
  readonly login: string;
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

  /** `GET /user`: the user the access token belongs to. */
  async getViewer(accessToken: string): Promise<Viewer> {
    const { response, body } = await this.#get(accessToken, "/user");
    const login = isRecord(body) ? body.login : undefined;
    if (typeof login !== "string") {
      throw new GitHubApiError(
        response.status,
        "GitHub API returned a user without a login",
      );
    }
    return { login };
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
            page.push({ login: account.login });
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
    const response = await this.#fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new GitHubApiError(
        response.status,
        `GitHub API responded ${response.status} to GET ${path}`,
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    return { response, body };
  }
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
