import type { Measure } from "./measures";

/**
 * The span a search covers: from `from` to just before `to`, or on with no
 * end when `to` is `undefined`.
 */
export interface SearchSpan {
  readonly from: Date;
  /** Exclusive; `undefined` for a search that runs up to now. */
  readonly to: Date | undefined;
}

/**
 * The GitHub search query for `login`'s pull requests of `measure` in the
 * span: created in it for opened, merged in it for merged. The bounds are
 * written with the local offset, so that a day starts at local midnight
 * rather than UTC midnight. GitHub's `a..b` ranges include both ends, so
 * the upper bound is the last second before `to`.
 */
export function searchQuery(
  login: string,
  measure: Measure,
  span: SearchSpan,
): string {
  const from = localTimestamp(span.from);
  const range =
    span.to === undefined
      ? `>=${from}`
      : `${from}..${localTimestamp(new Date(span.to.getTime() - 1000))}`;
  return measure === "opened"
    ? `is:pr author:${login} created:${range}`
    : `is:pr is:merged author:${login} merged:${range}`;
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
