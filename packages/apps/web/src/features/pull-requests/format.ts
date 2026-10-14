import { periodDays, startOfDay, type Period } from "@yagura/activity";

/** A day as its month and day, for example "Oct 12". */
export const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** A day key as its month and day, for example "Oct 3". */
export function formatDay(day: string): string {
  return dayFormat.format(startOfDay(day));
}

/**
 * The number of the pull request at `url`, for example "#123" for
 * "https://github.com/owner/repo/pull/123", read from the address so that
 * nothing more is fetched or stored; `null` for an address of another shape.
 */
export function pullRequestNumber(url: string): string | null {
  const match = /\/pull\/(\d+)\/?$/.exec(url);
  return match ? `#${match[1]}` : null;
}

/**
 * A moment as its date and 24-hour time in the local time zone, every part
 * padded to a fixed width so that a column of them lines up, for example
 * "2026-10-03 14:05".
 */
export function formatDateTime(time: Date): string {
  const date = `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
  return `${date} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
}

/**
 * The start of a local hour of the day, 0 to 24, in 24-hour form, for
 * example "09:00"; 24 is the end of the day's last hour.
 */
export function formatHour(hour: number): string {
  return `${pad(hour)}:00`;
}

/**
 * The period as the number of its days and its first and last days, for
 * example "Last 14 days · Sep 29 – Oct 12".
 */
export function formatPeriod(period: Period): string {
  return `Last ${periodDays} days · ${dayFormat.format(period.start)} – ${dayFormat.format(period.end)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
