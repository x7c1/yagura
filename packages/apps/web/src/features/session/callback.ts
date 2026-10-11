import type { SessionApiClient, SessionTokens } from "@yagura/session-api";
import { clearHandoff, loadHandoff } from "./handoff";

/** The callback cannot be completed; nothing was sent to the session API. */
export class CallbackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CallbackError";
  }
}

export interface CallbackRequest {
  /** The callback URL's query string, e.g. `window.location.search`. */
  readonly search: string;
  readonly redirectUri: string;
  readonly sessionApi: SessionApiClient;
}

/**
 * Validates the GitHub redirect against the stored handoff and exchanges the
 * code for tokens. The handoff is cleared whatever the outcome, because a
 * code and verifier can be used only once.
 */
export async function completeCallback(
  request: CallbackRequest,
): Promise<SessionTokens> {
  const params = new URLSearchParams(request.search);
  const handoff = loadHandoff();
  clearHandoff();

  const error = params.get("error");
  if (error) {
    throw new CallbackError(`GitHub declined the sign-in: ${error}`);
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    throw new CallbackError("The callback is missing code or state");
  }
  if (!handoff || handoff.state !== state) {
    throw new CallbackError("The callback state does not match this sign-in");
  }
  return request.sessionApi.createSession({
    code,
    codeVerifier: handoff.codeVerifier,
    redirectUri: request.redirectUri,
  });
}
