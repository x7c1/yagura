import type { Narrowing } from "@yagura/activity";
import { formatDay, formatHour } from "./format";

/**
 * What the list is narrowed to, for example "Merged on Oct 3" for a bar,
 * "Pushed on Oct 3" for a push circle, or "Merged or pushed on Oct 3,
 * 14:00–15:00" for a cell of the hours' heatmap.
 */
export function describeSelection(narrowing: Narrowing): string {
  const day = formatDay(narrowing.day);
  switch (narrowing.kind) {
    case "merged":
      return `Merged on ${day}`;
    case "pushed":
      return `Pushed on ${day}`;
    case "hour": {
      const { hour } = narrowing;
      return `Merged or pushed on ${day}, ${formatHour(hour)}–${formatHour(hour + 1)}`;
    }
  }
}

/** What tells one narrowing of the list from another, or from none. */
export function selectionKey(narrowing: Narrowing | null): string {
  if (narrowing === null) {
    return "all";
  }
  return narrowing.kind === "hour"
    ? `${narrowing.day}:${narrowing.hour}`
    : `${narrowing.day}:${narrowing.kind}`;
}
