import { countedTime } from "./daily";
import { dayKeyOf, periodDayKeys } from "./days";
import { measures, type Measure } from "./measures";
import type { Period } from "./period";
import type { PullRequest } from "./pull-request";

/** The hours of a day, 0 to 23, that the counts per hour are kept for. */
export const hoursPerDay = 24;

/**
 * How many pull requests were opened and merged in each hour of one day:
 * the element at index `h` counts those of the local hour from `h`:00 to
 * `h + 1`:00.
 */
export interface DayHourCounts {
  /** The day, as a {@link dayKeyOf} key. */
  readonly day: string;
  readonly opened: readonly number[];
  readonly merged: readonly number[];
}

/**
 * The opened and merged counts of each local hour of each day of the
 * period, oldest day first, every hour of every day present, an hour with
 * nothing as zero. A pull request counts in the hour of the same time that
 * places it on its day in `countByDay`, so that a day's hours add up to that
 * day's counts. On a day a daylight saving change shortens, the skipped
 * hour stays empty; on one it lengthens, the repeated hour counts both.
 */
export function countByHour(
  pullRequests: readonly PullRequest[],
  period: Period,
): DayHourCounts[] {
  const counts = new Map(
    periodDayKeys(period).map((day) => [
      day,
      {
        opened: new Array<number>(hoursPerDay).fill(0),
        merged: new Array<number>(hoursPerDay).fill(0),
      },
    ]),
  );
  for (const pr of pullRequests) {
    for (const measure of measures) {
      const time = countedTime(pr, period, measure);
      const entry = time === null ? undefined : counts.get(dayKeyOf(time));
      if (time !== null && entry !== undefined) {
        const hours = entry[measure];
        const hour = time.getHours();
        hours[hour] = (hours[hour] ?? 0) + 1;
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
 * The pull requests, in the order given, that {@link countByHour} counts for
 * `measure` on `day` (a {@link dayKeyOf} key) within the local hour that
 * starts at `hour`.
 */
export function pullRequestsInHour(
  pullRequests: readonly PullRequest[],
  period: Period,
  day: string,
  hour: number,
  measure: Measure,
): PullRequest[] {
  return pullRequests.filter((pr) => {
    const time = countedTime(pr, period, measure);
    return time !== null && dayKeyOf(time) === day && time.getHours() === hour;
  });
}
