/** The number of days the activity view covers, today included. */
export const periodDays = 14;

/** A span of time: from `start` (inclusive) to `end` (inclusive). */
export interface Period {
  readonly start: Date;
  readonly end: Date;
}

/**
 * The period ending at `now`: from local midnight {@link periodDays} − 1
 * days before today, so that today counts as one of the days, to `now`.
 * Days follow the runtime's local time zone, which in the browser is the
 * user's.
 */
export function periodEndingAt(now: Date): Period {
  // Going through the calendar date, not by subtracting milliseconds, keeps
  // the start at midnight across a daylight saving change.
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - (periodDays - 1),
  );
  return { start, end: new Date(now.getTime()) };
}

/** Whether `time` falls within `period`. */
export function isWithin(time: Date, period: Period): boolean {
  const t = time.getTime();
  return period.start.getTime() <= t && t <= period.end.getTime();
}
