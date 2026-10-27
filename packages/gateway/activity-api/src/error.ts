/**
 * The `error` codes the activity API documents, plus `unexpected_response`
 * for a response this client cannot interpret and `network_error` for a
 * request that got no response at all.
 */
export type ActivityApiErrorCode =
  | "invalid_request"
  | "invalid_token"
  | "forbidden"
  | "not_found"
  | "upstream_error"
  | "internal_error"
  | "unexpected_response"
  | "network_error";

const documentedCodes: ReadonlySet<string> = new Set([
  "invalid_request",
  "invalid_token",
  "forbidden",
  "not_found",
  "upstream_error",
  "internal_error",
]);

/**
 * A non-2xx (or unreadable) response from the activity API, or no response
 * at all (`network_error`, with `status` 0 and the failure as `cause`).
 */
export class ActivityApiError extends Error {
  readonly status: number;
  readonly code: ActivityApiErrorCode;
  readonly description: string | undefined;

  constructor(
    status: number,
    code: ActivityApiErrorCode,
    description?: string,
    options?: ErrorOptions,
  ) {
    super(
      (code === "network_error"
        ? "Activity API could not be reached"
        : `Activity API responded ${status} ${code}`) +
        (description ? `: ${description}` : ""),
      options,
    );
    this.name = "ActivityApiError";
    this.status = status;
    this.code = code;
    this.description = description;
  }

  /**
   * True when the API did not accept the access token, as when it has
   * expired: the caller refreshes the session and tries again.
   */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Builds the error from a response body of the documented error shape. */
  static fromBody(status: number, body: unknown): ActivityApiError {
    if (typeof body === "object" && body !== null) {
      const { error, error_description } = body as Record<string, unknown>;
      if (typeof error === "string" && documentedCodes.has(error)) {
        return new ActivityApiError(
          status,
          error as ActivityApiErrorCode,
          typeof error_description === "string" ? error_description : undefined,
        );
      }
    }
    return new ActivityApiError(status, "unexpected_response");
  }
}
