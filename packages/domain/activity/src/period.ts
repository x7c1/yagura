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

/**
 * The range of time to ask the activity of the period for: from the
 * period's start up to, but not including, local midnight at the end of
 * its last day, so that the whole of today is asked for.
 */
export function requestRange(period: Period): {
  readonly from: Date;
  readonly to: Date;
} {
  const { end } = period;
  return {
    from: period.start,
    to: new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1),
  };
}

/**
 * `time` as an ISO 8601 timestamp in the runtime's local time zone, to the
 * second, with its offset: for example `2026-09-29T00:00:00+09:00`.
 */
export function localTimestamp(time: Date): string {
  const offset = -time.getTimezoneOffset();
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}` +
    `T${pad(time.getHours())}:${pad(time.getMinutes())}:${pad(time.getSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
