/**
 * A non-2xx (or unreadable) response from the GitHub API, a GraphQL
 * response carrying `errors`, or no response at all (`status` 0, with the
 * failure as `cause`).
 */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "GitHubApiError";
    this.status = status;
  }

  /** True when GitHub rejected the access token. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** True when the request got no response, as when the network is down. */
  get isNetworkFailure(): boolean {
    return this.status === 0;
  }
}
