import { formatDay, formatHour } from "./format";

/**
 * What is chosen in the chart: the pull requests merged on a day, as a bar
 * chooses them, or those merged within one hour of that day, as a cell of
 * the hours' heatmap does.
 */
export interface ChartSelection {
  /** The day, as a `dayKeyOf` key. */
  readonly day: string;
  /** The local hour, 0 to 23, chosen in the heatmap; `null` for a bar. */
  readonly hour: number | null;
}

/**
 * What the list is narrowed to, for example "Merged on Oct 3", or "Merged
 * on Oct 3, 14:00–15:00" for an hour.
 */
export function describeSelection({ day, hour }: ChartSelection): string {
  const on = `Merged on ${formatDay(day)}`;
  return hour === null
    ? on
    : `${on}, ${formatHour(hour)}–${formatHour(hour + 1)}`;
}
