/** The access token the session API hands out, as returned by its endpoints. */
export interface SessionTokens {
  readonly accessToken: string;
  readonly tokenType: string;
  /** Lifetime of the access token in seconds, counted from the response. */
  readonly expiresIn: number;
}

/** Parses the JSON body of a successful token response. */
export function parseSessionTokens(body: unknown): SessionTokens | undefined {
  if (typeof body !== "object" || body === null) {
    return undefined;
  }
  const { access_token, token_type, expires_in } = body as Record<
    string,
    unknown
  >;
  if (
    typeof access_token !== "string" ||
    typeof token_type !== "string" ||
    typeof expires_in !== "number"
  ) {
    return undefined;
  }
  return {
    accessToken: access_token,
    tokenType: token_type,
    expiresIn: expires_in,
  };
}
