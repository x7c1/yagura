import { wasMerged, wasOpened } from "./measures";
import type { Period } from "./period";
import type { PullRequest } from "./pull-request";

/** The opened and merged counts and the lines of some pull requests. */
export interface ActivityCounts {
  readonly opened: number;
  readonly merged: number;
  readonly additions: number;
  readonly deletions: number;
}

/** One member's row in the summary table. */
export interface MemberSummary extends ActivityCounts {
  readonly login: string;
}

/** The summary table: a row per member, and the totals over them all. */
export interface ActivitySummary {
  readonly members: readonly MemberSummary[];
  readonly total: ActivityCounts;
}

const noActivity: ActivityCounts = {
  opened: 0,
  merged: 0,
  additions: 0,
  deletions: 0,
};

/**
 * Summarizes the pull requests (each once, as the list holds them) per
 * member, one row per login in the given order: how many the member opened
 * and merged in the period, and the lines of the member's pull requests. A
 * pull request opened and merged in the period counts toward both, but its
 * lines are added once, so that the table adds up to the list. A member
 * without pull requests gets a row of zeros. Authors are matched to logins
 * ignoring case, as GitHub does; pull requests by others are left out.
 */
export function summarizeByMember(
  logins: readonly string[],
  pullRequests: readonly PullRequest[],
  period: Period,
): ActivitySummary {
  const byLogin = new Map<string, ActivityCounts>(
    logins.map((login) => [login.toLowerCase(), noActivity]),
  );
  for (const pr of pullRequests) {
    const key = pr.author.toLowerCase();
    const counts = byLogin.get(key);
    if (counts !== undefined) {
      byLogin.set(key, add(counts, countsOf(pr, period)));
    }
  }
  const members = logins.map((login) => ({
    login,
    ...(byLogin.get(login.toLowerCase()) ?? noActivity),
  }));
  return { members, total: members.reduce(add, noActivity) };
}

function countsOf(pr: PullRequest, period: Period): ActivityCounts {
  return {
    opened: wasOpened(pr, period) ? 1 : 0,
    merged: wasMerged(pr, period) ? 1 : 0,
    additions: pr.additions,
    deletions: pr.deletions,
  };
}

function add(a: ActivityCounts, b: ActivityCounts): ActivityCounts {
  return {
    opened: a.opened + b.opened,
    merged: a.merged + b.merged,
    additions: a.additions + b.additions,
    deletions: a.deletions + b.deletions,
  };
}
