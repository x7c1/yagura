/** A non-2xx (or unreadable) response from the GitHub API. */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "GitHubApiError";
    this.status = status;
  }

  /** True when GitHub rejected the access token. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}
