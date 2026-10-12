import {
  emptyMemberActivity,
  measures,
  mergeSearchResults,
  periodEndingAt,
  planSearch,
  pruneMemberActivity,
  recordRefresh,
  recordSearch,
  searchQuery,
  staleUnmergedIds,
  storedPullRequests,
  type Period,
  type PullRequest,
} from "@yagura/activity";
import type { ViewerCache } from "../../shared";
import {
  activityCacheKey,
  decodeMemberActivity,
  encodeMemberActivity,
} from "./activity-record";
import { mapConcurrently } from "./concurrency";

/** How many searches run at once, so a large organization does not fire dozens. */
const searchConcurrency = 4;

/** The GitHub calls the pull request list makes. */
export interface PullRequestsApi {
  /** Runs one pull request search. */
  search(query: string): Promise<PullRequest[]>;
  /** Looks pull requests up by node id, leaving out those not found. */
  getPullRequests(ids: readonly string[]): Promise<PullRequest[]>;
}

/** The pull requests the members opened or merged in the period. */
export interface MembersPullRequests {
  readonly period: Period;
  /** Each pull request once, newest first by its latest event in the period. */
  readonly pullRequests: readonly PullRequest[];
}

/**
 * Fetches the pull requests the members (by login) opened or merged in the
 * period ending at `now`, through the browser cache: for each member and
 * measure, one search from the earliest day the cache cannot answer (none
 * when it answers them all), a few at a time; then one lookup by id of the
 * stored unmerged pull requests whose short life has passed. Each member's
 * activity is stored back when it changed, also when a request failed, and
 * the members' pull requests are merged into one list.
 */
export async function fetchMembersPullRequests(
  api: PullRequestsApi,
  cache: ViewerCache,
  logins: readonly string[],
  now: Date,
): Promise<MembersPullRequests> {
  const period = periodEndingAt(now);
  const members = await Promise.all(
    logins.map(async (login) => {
      const stored = await cache.get(activityCacheKey(login));
      const activity = pruneMemberActivity(
        decodeMemberActivity(stored) ?? emptyMemberActivity,
        period,
      );
      return { login, stored, activity };
    }),
  );

  const searches = members.flatMap((member) =>
    measures.flatMap((measure) => {
      const plan = planSearch(member.activity, measure, period);
      return plan === undefined ? [] : [{ member, measure, plan }];
    }),
  );
  // A failure stops further requests but not the storing of what was
  // fetched before it, so that a retry does not repeat those searches.
  let failure: { readonly error: unknown } | undefined;
  await mapConcurrently(
    searches,
    searchConcurrency,
    async ({ member, measure, plan }) => {
      if (failure !== undefined) {
        return;
      }
      try {
        const results = await api.search(
          searchQuery(member.login, measure, plan),
        );
        member.activity = recordSearch(
          member.activity,
          measure,
          plan,
          results,
          now,
        );
      } catch (error) {
        failure ??= { error };
      }
    },
  );

  const stale = members.flatMap(({ activity }) =>
    staleUnmergedIds(activity, now),
  );
  if (failure === undefined && stale.length > 0) {
    try {
      const refreshed = await api.getPullRequests(stale);
      for (const member of members) {
        member.activity = recordRefresh(member.activity, stale, refreshed, now);
      }
    } catch (error) {
      failure = { error };
    }
  }

  await Promise.all(
    members.map(async ({ login, stored, activity }) => {
      const value = encodeMemberActivity(activity);
      // Pruning, searches and lookups all show as a change here.
      if (JSON.stringify(value) !== JSON.stringify(stored)) {
        await cache.set(activityCacheKey(login), value);
      }
    }),
  );
  if (failure !== undefined) {
    throw failure.error;
  }
  return {
    period,
    pullRequests: mergeSearchResults(
      members.map(({ activity }) => storedPullRequests(activity)),
      period,
    ),
  };
}
