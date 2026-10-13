import { periodDays, type Period } from "@yagura/activity";

/** A day as its month and day, for example "Oct 12". */
export const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/**
 * A moment as its month, day and 24-hour time in the local time zone, for
 * example "Oct 13 14:05".
 */
export function formatDayTime(time: Date): string {
  return `${dayFormat.format(time)} ${pad(time.getHours())}:${pad(time.getMinutes())}`;
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
