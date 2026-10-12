import { dayKeyOf, periodDayKeys, startOfDay, startOfNextDay } from "./days";
import { measures, measureTime, type Measure } from "./measures";
import type { Period } from "./period";
import type { PullRequest } from "./pull-request";
import type { SearchSpan } from "./queries";

// Planning for the browser cache (docs/design/activity-view.md, "The
// browser cache"): what a member's stored activity still holds, what is
// missing from it, and how fetched results go back into it. Every function
// is pure and takes the current time explicitly.

/** How long short-lived entries are used: today's results, unmerged pull requests, the member list. */
export const shortLifeMs = 10 * 60 * 1000;

/** How long lasting entries are used after they were stored. */
export const lastingLifeMs = 7 * 24 * 60 * 60 * 1000;

/** Whether a short-lived entry stored at `storedAt` is still used at `now`. */
export function isWithinShortLife(storedAt: Date, now: Date): boolean {
  return now.getTime() - storedAt.getTime() < shortLifeMs;
}

/** Whether a lasting entry stored at `storedAt` is still used at `now`. */
export function isWithinLastingLife(storedAt: Date, now: Date): boolean {
  return now.getTime() - storedAt.getTime() < lastingLifeMs;
}

/** One day's results of one measure: the pull requests found on it. */
export interface FetchedDay {
  readonly fetchedAt: Date;
  /** The ids of the day's pull requests; empty for a day without any. */
  readonly ids: readonly string[];
}

/** A pull request as stored, with when it was stored. */
export interface StoredPullRequest {
  readonly storedAt: Date;
  readonly pullRequest: PullRequest;
}

/** What the cache holds for one member. */
export interface MemberActivity {
  /** The fetched days of each measure, by day key. */
  readonly days: Readonly<Record<Measure, ReadonlyMap<string, FetchedDay>>>;
  /** The pull requests the fetched days list, by id. */
  readonly pullRequests: ReadonlyMap<string, StoredPullRequest>;
}

export const emptyMemberActivity: MemberActivity = {
  days: { opened: new Map(), merged: new Map() },
  pullRequests: new Map(),
};

/**
 * Whether the stored results of `day` can be used at `now` without
 * searching again. A past day is complete when it was fetched after it had
 * ended, within the lasting life; one fetched while it was still today is
 * not. Today is complete for the short life after it was fetched.
 */
export function isDayComplete(
  day: string,
  fetched: FetchedDay,
  now: Date,
): boolean {
  if (day === dayKeyOf(now)) {
    return (
      fetched.fetchedAt.getTime() >= startOfDay(day).getTime() &&
      isWithinShortLife(fetched.fetchedAt, now)
    );
  }
  return (
    fetched.fetchedAt.getTime() >= startOfNextDay(day).getTime() &&
    isWithinLastingLife(fetched.fetchedAt, now)
  );
}

/**
 * Drops from `activity` what can no longer be used in `period`: the days
 * outside it, the pull requests stored longer than the lasting life ago
 * together with the days that list them (so that those days are fetched
 * again), and the pull requests no remaining day lists.
 */
export function pruneMemberActivity(
  activity: MemberActivity,
  period: Period,
): MemberActivity {
  const now = period.end;
  const periodDays = new Set(periodDayKeys(period));
  const pullRequests = new Map(
    [...activity.pullRequests].filter(([, stored]) =>
      isWithinLastingLife(stored.storedAt, now),
    ),
  );
  const keepDays = (days: ReadonlyMap<string, FetchedDay>) =>
    new Map(
      [...days].filter(
        ([day, fetched]) =>
          periodDays.has(day) &&
          fetched.ids.every((id) => pullRequests.has(id)),
      ),
    );
  return withListedPullRequests({
    days: {
      opened: keepDays(activity.days.opened),
      merged: keepDays(activity.days.merged),
    },
    pullRequests,
  });
}

/** The days of a measure to search, and the span that covers them. */
export interface SearchPlan extends SearchSpan {
  /** The days the search's results are stored under, oldest first. */
  readonly days: readonly string[];
}

/**
 * What to search for `measure` so that every day of the period is
 * complete, or `undefined` when all of them already are.
 *
 * The search starts at the earliest incomplete day. When today is
 * incomplete as well, it runs up to now and covers today too, so that one
 * search per measure is enough; when today is complete, it ends at the
 * start of today.
 */
export function planSearch(
  activity: MemberActivity,
  measure: Measure,
  period: Period,
): SearchPlan | undefined {
  const now = period.end;
  const stored = activity.days[measure];
  const days = periodDayKeys(period);
  const complete = (day: string) => {
    const fetched = stored.get(day);
    return fetched !== undefined && isDayComplete(day, fetched, now);
  };
  const first = days.findIndex((day) => !complete(day));
  if (first < 0) {
    return undefined;
  }
  const from = startOfDay(days[first] as string);
  const today = days[days.length - 1] as string;
  if (complete(today)) {
    return {
      days: days.slice(first, -1),
      from,
      to: startOfDay(today),
    };
  }
  return { days: days.slice(first), from, to: undefined };
}

/**
 * Splits search results of `measure` by the day each counts on (see
 * {@link measureTime}), with an entry for each of `days`, empty for a day
 * without any. Results on other days are left out.
 */
export function splitIntoDays(
  pullRequests: readonly PullRequest[],
  measure: Measure,
  days: readonly string[],
): Map<string, PullRequest[]> {
  const byDay = new Map<string, PullRequest[]>(days.map((day) => [day, []]));
  for (const pr of pullRequests) {
    const time = measureTime(pr, measure);
    if (time !== null) {
      byDay.get(dayKeyOf(time))?.push(pr);
    }
  }
  return byDay;
}

/**
 * Stores the results of the search planned by `plan`, made at `fetchedAt`:
 * each of the plan's days, empty ones included, replacing what was stored
 * for them, and the pull requests found.
 */
export function recordSearch(
  activity: MemberActivity,
  measure: Measure,
  plan: SearchPlan,
  results: readonly PullRequest[],
  fetchedAt: Date,
): MemberActivity {
  const days = new Map(activity.days[measure]);
  const pullRequests = new Map(activity.pullRequests);
  for (const [day, found] of splitIntoDays(results, measure, plan.days)) {
    days.set(day, { fetchedAt, ids: found.map(({ id }) => id) });
    for (const pullRequest of found) {
      pullRequests.set(pullRequest.id, { storedAt: fetchedAt, pullRequest });
    }
  }
  // A pull request the search no longer finds is listed by no day now.
  return withListedPullRequests({
    days: { ...activity.days, [measure]: days },
    pullRequests,
  });
}

/**
 * The ids of the stored pull requests that are not merged and were stored
 * longer than the short life ago: their state and lines may have changed,
 * so they are fetched again by id.
 */
export function staleUnmergedIds(
  activity: MemberActivity,
  now: Date,
): string[] {
  return [...activity.pullRequests.values()]
    .filter(
      ({ storedAt, pullRequest }) =>
        pullRequest.state !== "merged" && !isWithinShortLife(storedAt, now),
    )
    .map(({ pullRequest }) => pullRequest.id);
}

/**
 * Stores the pull requests fetched again by id at `fetchedAt`. Of the
 * requested `ids`, those missing from `refreshed` (deleted, or no longer
 * visible) are dropped, from the days that listed them too. Ids not stored
 * in `activity` are ignored.
 */
export function recordRefresh(
  activity: MemberActivity,
  ids: readonly string[],
  refreshed: readonly PullRequest[],
  fetchedAt: Date,
): MemberActivity {
  const byId = new Map(refreshed.map((pr) => [pr.id, pr]));
  const pullRequests = new Map(activity.pullRequests);
  const dropped = new Set<string>();
  for (const id of ids) {
    if (!pullRequests.has(id)) {
      continue;
    }
    const pullRequest = byId.get(id);
    if (pullRequest === undefined) {
      pullRequests.delete(id);
      dropped.add(id);
    } else {
      pullRequests.set(id, { storedAt: fetchedAt, pullRequest });
    }
  }
  if (dropped.size === 0) {
    return { ...activity, pullRequests };
  }
  const withoutDropped = (days: ReadonlyMap<string, FetchedDay>) =>
    new Map(
      [...days].map(([day, fetched]) => [
        day,
        { ...fetched, ids: fetched.ids.filter((id) => !dropped.has(id)) },
      ]),
    );
  return {
    days: {
      opened: withoutDropped(activity.days.opened),
      merged: withoutDropped(activity.days.merged),
    },
    pullRequests,
  };
}

/** The pull requests the stored days list, each once. */
export function storedPullRequests(activity: MemberActivity): PullRequest[] {
  return [...activity.pullRequests.values()].map(
    ({ pullRequest }) => pullRequest,
  );
}

/** `activity` without the pull requests no day lists. */
function withListedPullRequests(activity: MemberActivity): MemberActivity {
  const listed = new Set<string>();
  for (const measure of measures) {
    for (const { ids } of activity.days[measure].values()) {
      for (const id of ids) {
        listed.add(id);
      }
    }
  }
  return {
    ...activity,
    pullRequests: new Map(
      [...activity.pullRequests].filter(([id]) => listed.has(id)),
    ),
  };
}
