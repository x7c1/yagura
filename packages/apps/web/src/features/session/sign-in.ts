import { saveHandoff } from "./handoff";
import {
  deriveCodeChallenge,
  generateCodeVerifier,
  generateState,
} from "./pkce";

const authorizeUrl = "https://github.com/login/oauth/authorize";

export interface SignInRequest {
  readonly clientId: string;
  readonly redirectUri: string;
}

/**
 * Prepares the authorize URL for a new sign-in and records the `state` and
 * verifier for the callback.
 */
export async function prepareSignIn(request: SignInRequest): Promise<URL> {
  if (!request.clientId) {
    throw new Error("VITE_GITHUB_CLIENT_ID is not configured");
  }
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await deriveCodeChallenge(codeVerifier);
  saveHandoff({ state, codeVerifier });

  const url = new URL(authorizeUrl);
  url.searchParams.set("client_id", request.clientId);
  url.searchParams.set("redirect_uri", request.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}
