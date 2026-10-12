import {
  memberQueries,
  mergeSearchResults,
  periodEndingAt,
  type Period,
  type PullRequest,
} from "@yagura/activity";
import { mapConcurrently } from "./concurrency";

/** How many searches run at once, so a large organization does not fire dozens. */
const searchConcurrency = 4;

/** Runs one GitHub pull request search. */
export type SearchPullRequests = (query: string) => Promise<PullRequest[]>;

/** The pull requests the members opened or merged in the period. */
export interface MembersPullRequests {
  readonly period: Period;
  /** Each pull request once, newest first by its latest event in the period. */
  readonly pullRequests: readonly PullRequest[];
}

/**
 * Fetches the pull requests the members (by login) opened or merged in the
 * period ending at `now`: two searches per member, opened and merged, a few
 * at a time, merged into one list.
 */
export async function fetchMembersPullRequests(
  search: SearchPullRequests,
  logins: readonly string[],
  now: Date,
): Promise<MembersPullRequests> {
  const period = periodEndingAt(now);
  const queries = logins.flatMap((login) => {
    const { opened, merged } = memberQueries(login, period);
    return [opened, merged];
  });
  const results = await mapConcurrently(queries, searchConcurrency, search);
  return { period, pullRequests: mergeSearchResults(results, period) };
}
