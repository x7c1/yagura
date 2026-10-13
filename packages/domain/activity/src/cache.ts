import { dayKeyOf, periodDayKeys, startOfDay, startOfNextDay } from "./days";
import { measures, measureTime, type Measure } from "./measures";
import type { Period } from "./period";
import type { FoundPullRequest, PullRequest } from "./pull-request";
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
export function splitIntoDays<T extends FoundPullRequest>(
  pullRequests: readonly T[],
  measure: Measure,
  days: readonly string[],
): Map<string, T[]> {
  const byDay = new Map<string, T[]>(days.map((day) => [day, []]));
  for (const pr of pullRequests) {
    const time = measureTime(pr, measure);
    if (time !== null) {
      byDay.get(dayKeyOf(time))?.push(pr);
    }
  }
  return byDay;
}

/**
 * The ids among `found` (a search's results at `now`) whose details are
 * fetched by id: those not stored, and those stored but not merged, whose
 * state or lines may have changed, unless they were stored within the short
 * life and the search reports the same state. A stored merged pull request
 * is final and is not fetched again. Each id is listed once.
 */
export function idsNeedingDetails(
  activity: MemberActivity,
  found: readonly FoundPullRequest[],
  now: Date,
): string[] {
  const ids = new Set<string>();
  for (const { id, state } of found) {
    const stored = activity.pullRequests.get(id);
    const current =
      stored !== undefined &&
      (stored.pullRequest.state === "merged" ||
        (isWithinShortLife(stored.storedAt, now) &&
          stored.pullRequest.state === state));
    if (!current) {
      ids.add(id);
    }
  }
  return [...ids];
}

/**
 * Stores the results of the search planned by `plan`, made at `fetchedAt`:
 * each of the plan's days, empty ones included, replacing what was stored
 * for them, and the pull requests found.
 *
 * `found` are the search's results; `details` are the pull requests fetched
 * by id for them, `null` for an id whose lookup found nothing. A found pull
 * request with details is stored with them and placed on the days they
 * give, so that the lookup's answer wins over the search's where the two
 * disagree on the state or the merge. One without details keeps its stored
 * record, which is not renewed; one whose lookup found nothing (deleted, or
 * no longer visible) is dropped, from the days that listed it too.
 *
 * Throws when a found pull request on one of the plan's days has neither
 * details nor a stored record: its day would be stored without them.
 */
export function recordSearch(
  activity: MemberActivity,
  measure: Measure,
  plan: SearchPlan,
  found: readonly FoundPullRequest[],
  details: ReadonlyMap<string, PullRequest | null>,
  fetchedAt: Date,
): MemberActivity {
  const days = new Map(activity.days[measure]);
  const pullRequests = new Map(activity.pullRequests);
  const dropped = new Set<string>();
  const placed: FoundPullRequest[] = [];
  for (const result of found) {
    const detail = details.get(result.id);
    if (detail === null) {
      dropped.add(result.id);
    } else {
      placed.push(detail ?? result);
    }
  }
  for (const [day, onDay] of splitIntoDays(placed, measure, plan.days)) {
    days.set(day, { fetchedAt, ids: onDay.map(({ id }) => id) });
    for (const { id } of onDay) {
      const pullRequest = details.get(id);
      if (pullRequest) {
        pullRequests.set(id, { storedAt: fetchedAt, pullRequest });
      } else if (!pullRequests.has(id)) {
        throw new Error(`No details of the pull request ${id} to store`);
      }
    }
  }
  // A pull request the search no longer finds is listed by no day now.
  return withListedPullRequests(
    withoutIds(
      { days: { ...activity.days, [measure]: days }, pullRequests },
      dropped,
    ),
  );
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
      dropped.add(id);
    } else {
      pullRequests.set(id, { storedAt: fetchedAt, pullRequest });
    }
  }
  return withoutIds({ ...activity, pullRequests }, dropped);
}

/** The pull requests the stored days list, each once. */
export function storedPullRequests(activity: MemberActivity): PullRequest[] {
  return [...activity.pullRequests.values()].map(
    ({ pullRequest }) => pullRequest,
  );
}

/** `activity` without the pull requests `ids`, in its days too. */
function withoutIds(
  activity: MemberActivity,
  ids: ReadonlySet<string>,
): MemberActivity {
  if (ids.size === 0) {
    return activity;
  }
  const withoutDropped = (days: ReadonlyMap<string, FetchedDay>) =>
    new Map(
      [...days].map(([day, fetched]) => [
        day,
        { ...fetched, ids: fetched.ids.filter((id) => !ids.has(id)) },
      ]),
    );
  return {
    days: {
      opened: withoutDropped(activity.days.opened),
      merged: withoutDropped(activity.days.merged),
    },
    pullRequests: new Map(
      [...activity.pullRequests].filter(([id]) => !ids.has(id)),
    ),
  };
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
