import { GitHubApiError } from "@yagura/github-api";
import { SessionApiError } from "@yagura/session-api";

/**
 * Why a fetch failed, in the viewer's terms: the network is down
 * (`offline`), GitHub is limiting the viewer's requests (`rate-limited`),
 * GitHub no longer lets the viewer see what was asked for, as when the
 * app was removed from the organization (`denied`), or GitHub or the
 * session API failed otherwise (`unavailable`).
 */
export type LoadFailure = "offline" | "rate-limited" | "denied" | "unavailable";

/** The {@link LoadFailure} of a fetch that failed with `error`. */
export function classifyLoadFailure(error: unknown): LoadFailure {
  if (error instanceof GitHubApiError) {
    if (error.isNetworkFailure) {
      return "offline";
    }
    // GitHub answers a rate limit with 403 or 429 over REST, and with a
    // GraphQL error otherwise; each names the limit.
    if (error.status === 429 || /rate limit/i.test(error.message)) {
      return "rate-limited";
    }
    if (error.status === 403 || error.status === 404) {
      return "denied";
    }
  }
  if (error instanceof SessionApiError && error.code === "network_error") {
    return "offline";
  }
  return "unavailable";
}
