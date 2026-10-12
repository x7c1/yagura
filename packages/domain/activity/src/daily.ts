import { dayKeyOf, periodDayKeys } from "./days";
import {
  measures,
  measureTime,
  wasMerged,
  wasOpened,
  type Measure,
} from "./measures";
import type { Period } from "./period";
import type { PullRequest } from "./pull-request";

/** How many pull requests were opened and merged on one day. */
export interface DayCounts {
  /** The day, as a {@link dayKeyOf} key. */
  readonly day: string;
  readonly opened: number;
  readonly merged: number;
}

/**
 * The opened and merged counts of each day of the period, oldest first. Every
 * day is present, a day with nothing as zeros. A pull request counts as
 * opened on the local day it was created and as merged on the local day it
 * was merged, as long as that falls within the period; one opened on one day
 * and merged on another counts on each day for its own measure.
 */
export function countByDay(
  pullRequests: readonly PullRequest[],
  period: Period,
): DayCounts[] {
  const counts = new Map(
    periodDayKeys(period).map((day) => [day, { opened: 0, merged: 0 }]),
  );
  for (const pr of pullRequests) {
    for (const measure of measures) {
      const day = dayOf(pr, period, measure);
      const entry = day === null ? undefined : counts.get(day);
      if (entry !== undefined) {
        entry[measure] += 1;
      }
    }
  }
  return [...counts].map(([day, { opened, merged }]) => ({
    day,
    opened,
    merged,
  }));
}

/**
 * The pull requests, in the order given, that {@link countByDay} counts for
 * `measure` on `day` (a {@link dayKeyOf} key).
 */
export function pullRequestsOn(
  pullRequests: readonly PullRequest[],
  period: Period,
  day: string,
  measure: Measure,
): PullRequest[] {
  return pullRequests.filter((pr) => dayOf(pr, period, measure) === day);
}

/**
 * The local day the pull request counts for `measure` on, or `null` when it
 * does not count for it in the period.
 */
function dayOf(
  pr: PullRequest,
  period: Period,
  measure: Measure,
): string | null {
  const counts =
    measure === "opened" ? wasOpened(pr, period) : wasMerged(pr, period);
  const time = measureTime(pr, measure);
  return counts && time !== null ? dayKeyOf(time) : null;
}
