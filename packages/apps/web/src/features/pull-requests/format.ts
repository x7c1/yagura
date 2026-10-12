import type { Period } from "@yagura/activity";

/** A day as its month and day, for example "Oct 12". */
export const dayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});

/** The period as its first and last days, for example "Sep 29 – Oct 12". */
export function formatPeriod(period: Period): string {
  return `${dayFormat.format(period.start)} – ${dayFormat.format(period.end)}`;
}
