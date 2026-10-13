/**
 * The access token the session API hands out, and the login it belongs to, as
 * returned by its endpoints.
 */
export interface SessionTokens {
  readonly accessToken: string;
  readonly tokenType: string;
  /** Lifetime of the access token in seconds, counted from the response. */
  readonly expiresIn: number;
  /** GitHub login of the user the access token belongs to. */
  readonly login: string;
}

/** Parses the JSON body of a successful token response. */
export function parseSessionTokens(body: unknown): SessionTokens | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { access_token, token_type, expires_in, login } = body as Record<
    string,
    unknown
  >;
  if (
    typeof access_token !== "string" ||
    typeof token_type !== "string" ||
    typeof expires_in !== "number" ||
    typeof login !== "string"
  ) {
    return undefined;
  }
  return {
    accessToken: access_token,
    tokenType: token_type,
    expiresIn: expires_in,
    login,
  };
}
