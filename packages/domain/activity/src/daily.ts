import { dayKeyOf, periodDayKeys } from "./days";
import type { CountedEvent } from "./events";
import type { Period } from "./period";

/** How many pull requests were merged, and how many pushes made, on one day. */
export interface DayCounts {
  /** The day, as a {@link dayKeyOf} key. */
  readonly day: string;
  readonly merged: number;
  /** The members' pushes. */
  readonly pushed: number;
}

/** The hours of a day, 0 to 23, that the counts per hour are kept for. */
export const hoursPerDay = 24;

/**
 * How many pull requests were merged, and how many pushes made, in each
 * hour of one day: the element at index `h` counts those of the local hour
 * from `h`:00 to `h + 1`:00.
 */
export interface DayHourCounts {
  /** The day, as a {@link dayKeyOf} key. */
  readonly day: string;
  readonly merged: readonly number[];
  readonly pushed: readonly number[];
}

/**
 * The merged and pushed counts of each day of the period, oldest first.
 * Every day is present, a day with nothing as zeros. Each of the
 * {@link countedEvents} counts on the local day it happened.
 */
export function countByDay(
  events: readonly CountedEvent[],
  period: Period,
): DayCounts[] {
  return countByHour(events, period).map(({ day, merged, pushed }) => ({
    day,
    merged: sum(merged),
    pushed: sum(pushed),
  }));
}

/**
 * The merged and pushed counts of each local hour of each day of the
 * period, oldest day first, every hour of every day present, an hour with
 * nothing as zero, so that a day's hours add up to that day's counts in
 * {@link countByDay}. On a day a daylight saving change shortens, the
 * skipped hour stays empty; on one it lengthens, the repeated hour counts
 * both.
 */
export function countByHour(
  events: readonly CountedEvent[],
  period: Period,
): DayHourCounts[] {
  const counts = new Map(
    periodDayKeys(period).map((day) => [
      day,
      {
        merged: new Array<number>(hoursPerDay).fill(0),
        pushed: new Array<number>(hoursPerDay).fill(0),
      },
    ]),
  );
  for (const event of events) {
    const entry = counts.get(dayKeyOf(event.at));
    if (entry !== undefined && event.kind !== "opened") {
      const hours = entry[event.kind];
      const hour = event.at.getHours();
      hours[hour] = (hours[hour] ?? 0) + 1;
    }
  }
  return [...counts].map(([day, { merged, pushed }]) => ({
    day,
    merged,
    pushed,
  }));
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
