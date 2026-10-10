// PKCE (RFC 7636) and `state` helpers over Web Crypto.

/** Encodes bytes as base64url without padding. */
export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** A random base64url string carrying `byteLength` bytes of entropy. */
function randomUrlSafeString(byteLength: number): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(byteLength)));
}

/** A fresh `code_verifier`: 32 random bytes encode to 43 characters. */
export function generateCodeVerifier(): string {
  return randomUrlSafeString(32);
}

/** A fresh `state` value for the authorize request. */
export function generateState(): string {
  return randomUrlSafeString(32);
}

/** The S256 `code_challenge`: base64url(SHA-256(ASCII(code_verifier))). */
export async function deriveCodeChallenge(
  codeVerifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}
