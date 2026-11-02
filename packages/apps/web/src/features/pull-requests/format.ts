import {
  kindGroupName,
  kindGroups,
  periodDays,
  startOfDay,
  type EventKind,
  type KindGroup,
  type Period,
} from "@yagura/activity";

/** A day as its month and day, for example "Oct 12". */
export const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** A day key as its month and day, for example "Oct 3". */
export function formatDay(day: string): string {
  return dayFormat.format(startOfDay(day));
}

/** A day as its day of the month alone, for example "21". */
const dateFormat = new Intl.DateTimeFormat("en-US", { day: "numeric" });

/**
 * The texts of the date labels drawn along the chart, keyed by day, for the
 * labelled days in the order they are drawn. As a calendar writes them, the
 * month is written only where it is new: on the first label, and on each
 * label whose month differs from the label drawn before it, for example
 * "Oct 30, 31, Nov 1, 2". A label that is not drawn does not count, so
 * where the 1st of a month has none, the first label drawn in that month
 * carries the month. Text read on its own, such as an accessible name, keeps
 * the full date of {@link formatDay}.
 */
export function formatDayLabels(
  days: readonly string[],
): ReadonlyMap<string, string> {
  const labels = new Map<string, string>();
  let month: number | null = null;
  for (const day of days) {
    const date = startOfDay(day);
    labels.set(
      day,
      date.getMonth() === month
        ? dateFormat.format(date)
        : dayFormat.format(date),
    );
    month = date.getMonth();
  }
  return labels;
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

/** What the list's Date column says of each kind of latest event. */
export const eventWords: Readonly<Record<EventKind, string>> = {
  opened: "Opened",
  pushed: "Pushed",
  merged: "Merged",
};

/** A count of pushes, for example "1 push" or "5 pushes". */
export function formatPushes(count: number): string {
  return count === 1 ? "1 push" : `${count} pushes`;
}

/**
 * A day's bar's name: its day and merged count, then, when it has merges,
 * how many of each group of kinds, in the order the bar draws them and
 * without the groups it has none of, for example "Oct 13, merged: 7 (feat
 * 3, fix 2, docs 1, other 1)" or "Oct 12, merged: 0". `third` is the kind
 * the third group holds.
 */
export function formatMergedDay(
  day: string,
  kinds: Readonly<Record<KindGroup, number>>,
  third: string | null,
): string {
  const merged = kindGroups.reduce((sum, group) => sum + kinds[group], 0);
  const parts = kindGroups
    .filter((group) => kinds[group] > 0)
    .map((group) => `${kindGroupName(group, third)} ${kinds[group]}`);
  const name = `${formatDay(day)}, merged: ${merged}`;
  return parts.length === 0 ? name : `${name} (${parts.join(", ")})`;
}
