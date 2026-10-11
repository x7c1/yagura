import { GitHubApiError } from "./error";

const baseUrl = "https://api.github.com";

export interface GitHubApiClientOptions {
  readonly fetch: typeof fetch;
}

/** The signed-in user, as far as the app needs it. */
export interface Viewer {
  readonly login: string;
}

/** Typed client for the GitHub API. */
export class GitHubApiClient {
  readonly #fetch: typeof fetch;

  constructor(options: GitHubApiClientOptions) {
    // Call the injected function unbound: the browser's fetch rejects any
    // receiver other than the global object.
    const fetchFn = options.fetch;
    this.#fetch = (input, init) => fetchFn(input, init);
  }

  /** `GET /user`: the user the access token belongs to. */
  async getViewer(accessToken: string): Promise<Viewer> {
    const response = await this.#fetch(`${baseUrl}/user`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!response.ok) {
      throw new GitHubApiError(
        response.status,
        `GitHub API responded ${response.status} to GET /user`,
      );
    }
    const body: unknown = await response.json().catch(() => undefined);
    const login =
      typeof body === "object" && body !== null
        ? (body as Record<string, unknown>).login
        : undefined;
    if (typeof login !== "string") {
      throw new GitHubApiError(
        response.status,
        "GitHub API returned a user without a login",
      );
    }
    return { login };
  }
}
