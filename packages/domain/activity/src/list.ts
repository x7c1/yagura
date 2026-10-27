import type { Member, OrganizationActivity, PullRequest } from "./activity";
import type { CountedEvent, EventKind } from "./events";

/**
 * How the list shows where a pull request stands: merged when it was
 * merged in the range, else closed, else a draft, else open.
 */
export type ShownState = "open" | "draft" | "merged" | "closed";

/** A row of the pull request list. */
export interface ListedPullRequest {
  readonly pullRequest: PullRequest;
  /** The account that opened it, or `undefined` when the response does not name it. */
  readonly author: Member | undefined;
  readonly state: ShownState;
  /**
   * The pull request's latest counted event in the period, or in a
   * narrowed list the latest one the narrowing covers (see `narrowList`).
   */
  readonly latest: { readonly kind: EventKind; readonly at: Date };
  /**
   * The members' pushes to it in the period, or in a narrowed list those
   * in the narrowing's day or hour.
   */
  readonly pushes: number;
  /** Whether a bot opened it. */
  readonly byBot: boolean;
}

/**
 * The pull requests the list holds, newest first by their latest counted
 * event: those opened or merged in the period, and those a member pushed to
 * in it, each once. `events` are the period's {@link countedEvents}.
 */
export function listPullRequests(
  activity: OrganizationActivity,
  events: readonly CountedEvent[],
): ListedPullRequest[] {
  const members = new Map(
    activity.members.map((member) => [member.id, member]),
  );
  const merged = new Set(
    activity.activities
      .filter((entry) => entry.kind === "merged")
      .map((entry) => entry.pullRequestId),
  );
  const rows = new Map<string, ListedPullRequest>();
  for (const event of events) {
    const { pullRequest } = event;
    const row = rows.get(pullRequest.id);
    const pushes = (row?.pushes ?? 0) + (event.kind === "pushed" ? 1 : 0);
    const latest =
      row === undefined || event.at.getTime() >= row.latest.at.getTime()
        ? { kind: event.kind, at: event.at }
        : row.latest;
    if (row !== undefined) {
      rows.set(pullRequest.id, { ...row, latest, pushes });
      continue;
    }
    const author = members.get(pullRequest.authorId);
    rows.set(pullRequest.id, {
      pullRequest,
      author,
      state: shownState(pullRequest, merged.has(pullRequest.id)),
      latest,
      pushes,
      byBot: author?.type === "Bot",
    });
  }
  return [...rows.values()].sort(
    (a, b) => b.latest.at.getTime() - a.latest.at.getTime(),
  );
}

function shownState(pr: PullRequest, merged: boolean): ShownState {
  if (merged) {
    return "merged";
  }
  if (pr.state === "closed") {
    return "closed";
  }
  return pr.draft ? "draft" : "open";
}
