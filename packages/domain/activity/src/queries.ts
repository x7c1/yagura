import type { Period } from "./period";

/** The two GitHub searches for one member's activity in a period. */
export interface MemberQueries {
  /** Pull requests the member created in the period. */
  readonly opened: string;
  /** Pull requests by the member merged in the period. */
  readonly merged: string;
}

/**
 * The GitHub search queries for `login`'s pull requests opened and merged in
 * the period. The bound is the period's start with the local offset, so
 * that it falls on local midnight rather than UTC midnight.
 */
export function memberQueries(login: string, period: Period): MemberQueries {
  const start = localTimestamp(period.start);
  return {
    opened: `is:pr author:${login} created:>=${start}`,
    merged: `is:pr is:merged author:${login} merged:>=${start}`,
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
