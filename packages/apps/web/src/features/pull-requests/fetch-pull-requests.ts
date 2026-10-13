import {
  emptyMemberActivity,
  idsNeedingDetails,
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
  type FoundPullRequest,
  type Period,
  type PullRequest,
} from "@yagura/activity";
import type { ViewerCache } from "../../shared";
import {
  activityCacheKey,
  decodeMemberActivity,
  encodeMemberActivity,
} from "./activity-record";
import { concurrencyLimit } from "./concurrency";

/**
 * How many requests (searches and lookups together) run at once, so a large
 * organization does not fire dozens.
 */
const requestConcurrency = 4;

/** The GitHub calls the pull request list makes. */
export interface PullRequestsApi {
  /** Runs one pull request search, for each result's id, state and times. */
  search(query: string): Promise<FoundPullRequest[]>;
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
 * period ending at `now`, through the browser cache:
 *
 * - for each member and measure, one search from the earliest day the
 *   cache cannot answer (none when it answers them all), for the ids found
 *   on each day; as soon as a search answers, one lookup by id of the
 *   details of the pull requests found that the cache lacks;
 * - alongside the searches, from the start, one lookup by id of the stored
 *   unmerged pull requests whose short life has passed.
 *
 * At most {@link requestConcurrency} requests run at once, lookups before
 * waiting searches. Each member's activity is stored back when it changed,
 * also when a request failed, and the members' pull requests are merged
 * into one list.
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

  // A failure stops further requests but not the storing of what was
  // fetched before it, so that a retry does not repeat those requests.
  let failure: { readonly error: unknown } | undefined;
  const limit = concurrencyLimit(requestConcurrency);
  const send = <T>(request: () => Promise<T>, ahead = false): Promise<T> =>
    limit(
      async () => {
        if (failure !== undefined) {
          throw failure.error;
        }
        try {
          return await request();
        } catch (error) {
          failure ??= { error };
          throw error;
        }
      },
      { ahead },
    );

  // Each id is looked up at most once per load: an id already sent (by the
  // stale refresh, or for another search) is answered from that lookup, not
  // sent again. Where a search's result and the lookup's answer disagree on
  // the state or the merge, the lookup's answer wins (see `recordSearch`):
  // it is the full read of the pull request, and is taken to be the later.
  const lookups = new Map<string, Promise<PullRequest | null>>();
  const lookUp = async (
    ids: readonly string[],
  ): Promise<Map<string, PullRequest | null>> => {
    const unsent = [...new Set(ids)].filter((id) => !lookups.has(id));
    if (unsent.length > 0) {
      // Lookups go ahead of waiting searches: they finish what a search
      // has started.
      const answer = send(() => api.getPullRequests(unsent), true).then(
        (found) => new Map(found.map((pr) => [pr.id, pr])),
      );
      for (const id of unsent) {
        lookups.set(
          id,
          answer.then((byId) => byId.get(id) ?? null),
        );
      }
    }
    return new Map(
      await Promise.all(
        ids.map(async (id): Promise<[string, PullRequest | null]> => [
          id,
          (await lookups.get(id)) ?? null,
        ]),
      ),
    );
  };

  // Which stored pull requests to refresh is known before any search, so
  // their lookup is sent first, alongside the searches.
  const stale = members.flatMap(({ activity }) =>
    staleUnmergedIds(activity, now),
  );
  const refresh = async () => {
    if (stale.length === 0) {
      return;
    }
    const refreshed = [...(await lookUp(stale)).values()].filter(
      (pr) => pr !== null,
    );
    for (const member of members) {
      member.activity = recordRefresh(member.activity, stale, refreshed, now);
    }
  };

  const searches = members.flatMap((member) =>
    measures.flatMap((measure) => {
      const plan = planSearch(member.activity, measure, period);
      return plan === undefined ? [] : [{ member, measure, plan }];
    }),
  );
  const search = async ({
    member,
    measure,
    plan,
  }: (typeof searches)[number]) => {
    const found = await send(() =>
      api.search(searchQuery(member.login, measure, plan)),
    );
    // What needs details is decided again after each lookup: while one
    // waits, the stale refresh or another search may change what is
    // stored, and the day must not be stored with an id lacking details.
    const details = new Map<string, PullRequest | null>();
    for (;;) {
      const missing = idsNeedingDetails(member.activity, found, now).filter(
        (id) => !details.has(id),
      );
      if (missing.length === 0) {
        break;
      }
      for (const [id, pr] of await lookUp(missing)) {
        details.set(id, pr);
      }
    }
    member.activity = recordSearch(
      member.activity,
      measure,
      plan,
      found,
      details,
      now,
    );
  };

  await Promise.all(
    [refresh(), ...searches.map(search)].map((task) =>
      task.catch((error: unknown) => {
        failure ??= { error };
      }),
    ),
  );

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
