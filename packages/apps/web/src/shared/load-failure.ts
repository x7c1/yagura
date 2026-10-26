import { ActivityApiError } from "@yagura/activity-api";
import { SessionApiError } from "@yagura/session-api";

/**
 * Why a fetch failed, in the viewer's terms: the network is down
 * (`offline`), the viewer may no longer see what was asked for, as when
 * they lost access to the organization on GitHub (`denied`), or Yagura or
 * GitHub behind it failed otherwise (`unavailable`).
 */
export type LoadFailure = "offline" | "denied" | "unavailable";

/** The {@link LoadFailure} of a fetch that failed with `error`. */
export function classifyLoadFailure(error: unknown): LoadFailure {
  if (error instanceof ActivityApiError) {
    if (error.code === "network_error") {
      return "offline";
    }
    if (error.code === "forbidden" || error.code === "not_found") {
      return "denied";
    }
  }
  if (error instanceof SessionApiError && error.code === "network_error") {
    return "offline";
  }
  return "unavailable";
}
