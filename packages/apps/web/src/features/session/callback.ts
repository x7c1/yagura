import type { KeyValueStore } from "@yagura/browser";
import type { SessionApiClient, SessionTokens } from "@yagura/session-api";
import { clearHandoff, loadHandoff } from "./handoff";

/**
 * Why a callback cannot be completed: the viewer cancelled on GitHub
 * (`cancelled`), GitHub declined the sign-in for another reason
 * (`declined`), or the callback does not belong to the sign-in this tab
 * started, as a stale, reused or other tab's callback URL does (`stale`).
 */
export type CallbackErrorReason = "cancelled" | "declined" | "stale";

/** The callback cannot be completed; nothing was sent to the session API. */
export class CallbackError extends Error {
  readonly reason: CallbackErrorReason;

  constructor(reason: CallbackErrorReason, message: string) {
    super(message);
    this.name = "CallbackError";
    this.reason = reason;
  }
}

export interface CallbackRequest {
  /** The callback URL's query string, including its leading `?`. */
  readonly search: string;
  readonly redirectUri: string;
  readonly sessionApi: SessionApiClient;
  /** Where `prepareSignIn` recorded the handoff. */
  readonly storage: KeyValueStore;
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
  const handoff = loadHandoff(request.storage);
  clearHandoff(request.storage);

  const error = params.get("error");
  if (error) {
    throw new CallbackError(
      error === "access_denied" ? "cancelled" : "declined",
      `GitHub declined the sign-in: ${error}`,
    );
  }
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    throw new CallbackError("stale", "The callback is missing code or state");
  }
  if (!handoff || handoff.state !== state) {
    throw new CallbackError(
      "stale",
      "The callback state does not match this sign-in",
    );
  }
  return request.sessionApi.createSession({
    code,
    codeVerifier: handoff.codeVerifier,
    redirectUri: request.redirectUri,
  });
}
