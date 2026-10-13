import { periodDays, type Period } from "@yagura/activity";

/** A day as its month and day, for example "Oct 12". */
export const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

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
 * The period as the number of its days and its first and last days, for
 * example "Last 14 days · Sep 29 – Oct 12".
 */
export function formatPeriod(period: Period): string {
  return `Last ${periodDays} days · ${dayFormat.format(period.start)} – ${dayFormat.format(period.end)}`;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
