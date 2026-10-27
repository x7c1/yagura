import type { Member, OrganizationActivity } from "./activity";
import { isPerson, type CountedEvent } from "./events";
import type { ListedPullRequest } from "./list";

/** The counts of one row of the summary table. */
export interface ActivityCounts {
  /** Pull requests the account opened in the period. */
  readonly opened: number;
  /** Pull requests the account opened that were merged in the period. */
  readonly merged: number;
  /** The account's pushes in the period; `null` for a bot, whose pushes are not counted. */
  readonly pushed: number | null;
  readonly additions: number;
  readonly deletions: number;
}

/** One account's row in the summary table. */
export interface MemberSummary extends ActivityCounts {
  readonly member: Member;
}

/** The summary table: a row per account, and the totals over them all. */
export interface ActivitySummary {
  readonly members: readonly MemberSummary[];
  readonly total: ActivityCounts;
}

/**
 * Summarizes the period per account: a row per member who is a person, in
 * the order of `activity.members`, with zeros for one without activity;
 * then a row per bot that opened a pull request of the list, in login
 * order. A row counts the pull requests the account opened: how many were
 * opened and how many merged in the period, whoever merged them, and their
 * lines, each pull request's once; and, for a person, their pushes to any
 * pull request. The totals add up the rows, the bots' included, so that
 * their merged count is the chart's.
 *
 * `listed` and `events` are the period's {@link listPullRequests} and
 * {@link countedEvents}.
 */
export function summarizeByMember(
  activity: OrganizationActivity,
  listed: readonly ListedPullRequest[],
  events: readonly CountedEvent[],
): ActivitySummary {
  const people = activity.members.filter(isPerson);
  const bots = activity.members
    .filter(
      (member) =>
        !isPerson(member) &&
        listed.some(({ author }) => author?.id === member.id),
    )
    .sort((a, b) => compare(a.login, b.login));
  const rows = [...people, ...bots].map((member) =>
    summarize(member, listed, events),
  );
  const total = rows.reduce<ActivityCounts>(
    (sum, row) => ({
      opened: sum.opened + row.opened,
      merged: sum.merged + row.merged,
      pushed: (sum.pushed ?? 0) + (row.pushed ?? 0),
      additions: sum.additions + row.additions,
      deletions: sum.deletions + row.deletions,
    }),
    { opened: 0, merged: 0, pushed: 0, additions: 0, deletions: 0 },
  );
  return { members: rows, total };
}

function summarize(
  member: Member,
  listed: readonly ListedPullRequest[],
  events: readonly CountedEvent[],
): MemberSummary {
  const authored = new Set(
    listed
      .filter(({ author }) => author?.id === member.id)
      .map(({ pullRequest }) => pullRequest.id),
  );
  const count = (kind: CountedEvent["kind"]) =>
    events.filter(
      (event) => event.kind === kind && authored.has(event.pullRequest.id),
    ).length;
  let additions = 0;
  let deletions = 0;
  for (const { pullRequest } of listed) {
    if (authored.has(pullRequest.id)) {
      additions += pullRequest.additions;
      deletions += pullRequest.deletions;
    }
  }
  return {
    member,
    opened: count("opened"),
    merged: count("merged"),
    pushed: isPerson(member)
      ? events.filter(
          (event) => event.kind === "pushed" && event.actorId === member.id,
        ).length
      : null,
    additions,
    deletions,
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
