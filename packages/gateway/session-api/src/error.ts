/**
 * The `error` codes the session API documents, plus `unexpected_response`
 * for a response this client cannot interpret.
 */
export type SessionApiErrorCode =
  | "invalid_request"
  | "invalid_grant"
  | "invalid_session"
  | "upstream_error"
  | "forbidden_origin"
  | "unsupported_media_type"
  | "unexpected_response";

const documentedCodes: ReadonlySet<string> = new Set([
  "invalid_request",
  "invalid_grant",
  "invalid_session",
  "upstream_error",
  "forbidden_origin",
  "unsupported_media_type",
]);

/** A non-2xx (or unreadable) response from the session API. */
export class SessionApiError extends Error {
  readonly status: number;
  readonly code: SessionApiErrorCode;
  readonly description: string | undefined;

  constructor(status: number, code: SessionApiErrorCode, description?: string) {
    super(
      `Session API responded ${status} ${code}` +
        (description ? `: ${description}` : ""),
    );
    this.name = "SessionApiError";
    this.status = status;
    this.code = code;
    this.description = description;
  }

  /** Builds the error from a response body of the documented error shape. */
  static fromBody(status: number, body: unknown): SessionApiError {
    if (typeof body === "object" && body !== null) {
      const { error, error_description } = body as Record<string, unknown>;
      if (typeof error === "string" && documentedCodes.has(error)) {
        return new SessionApiError(
          status,
          error as SessionApiErrorCode,
          typeof error_description === "string" ? error_description : undefined,
        );
      }
    }
    return new SessionApiError(status, "unexpected_response");
  }
}
