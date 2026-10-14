import { hoursPerDay } from "@yagura/activity";
import {
  dayLabelSpace,
  textGap,
  textHeight,
  type ChartGeometry,
  type ChartLayout,
  type Counts,
  type Rect,
  type TextSpot,
} from "./chart-geometry";

/*
 * The heatmap of the hours, drawn under the bar chart in the same card and
 * laid out from the chart's own geometry, so that its days line up with the
 * bars' days: under the columns, each day's hours are a column under its
 * bar; beside the rows, each day's hours are a thin row across the width.
 */

/** The hours that are labelled; the others are read from their place. */
export const labelledHours: readonly number[] = [0, 6, 12, 18];

/** How many strengths a non-empty cell's colour comes in. */
export const heatSteps = 4;

/** The space between neighbouring cells, so that each reads as its own. */
const cellGap = 1;

/** The height of an hour's row under the columns, its gap included. */
const columnsHourHeight = 6;

/** A day's thin row in the row layout, and the space below it. */
const rowsTrack = { thickness: 10, dayGap: 4 } as const;

/** A labelled hour, and where its label goes. */
export interface HourLabel {
  readonly hour: number;
  readonly spot: TextSpot;
}

/**
 * One day's cells, hour by hour from 0 to 23, and where the day's label
 * goes, if the heatmap has one of its own.
 */
export interface HeatGroup<T extends Counts = Counts> {
  readonly day: T;
  readonly cells: readonly Rect[];
  readonly label: TextSpot | null;
}

export interface HeatmapGeometry<T extends Counts = Counts> {
  /** The layout of the chart it is drawn under. */
  readonly layout: ChartLayout;
  readonly width: number;
  readonly height: number;
  readonly hourLabels: readonly HourLabel[];
  readonly groups: readonly HeatGroup<T>[];
}

/**
 * The strength of a cell's colour, from 1 to {@link heatSteps}, for `count`
 * pull requests in an hour when the busiest hour of the period has `max`:
 * the busiest takes the strongest step, and the steps below it share out
 * the counts under it evenly. An empty cell is 0.
 */
export function heatStep(count: number, max: number): number {
  if (count <= 0 || max <= 0) {
    return 0;
  }
  return Math.min(heatSteps, Math.max(1, Math.ceil((count / max) * heatSteps)));
}

/** The hours, 0 to 23. */
const hours = Array.from({ length: hoursPerDay }, (_, hour) => hour);

/**
 * Where everything in the heatmap goes, under the bar chart laid out as
 * `chart`, at the chart's width.
 */
export function heatmapGeometry<T extends Counts>(
  chart: ChartGeometry<T>,
): HeatmapGeometry<T> {
  return chart.layout === "columns"
    ? columnsHeatmap(chart)
    : rowsHeatmap(chart);
}

/**
 * Under the columns: a row per hour, 0 at the top, and each day's hours in
 * a column as wide as the bar above it. The labelled hours are written left
 * of the plot, where the chart's axis writes its values.
 */
function columnsHeatmap<T extends Counts>(
  chart: ChartGeometry<T>,
): HeatmapGeometry<T> {
  // Room for half a label's height above the first row, so that the label
  // of hour 0 stays inside, and as much below the last. Above the first
  // row, the room is the space under the chart's day labels, which is as
  // much as the space above them (and more than half a label), so that the
  // labels sit midway between the bars and the cells they both head.
  const labelRoom = (textHeight - columnsHourHeight) / 2;
  const top = Math.max(dayLabelSpace, labelRoom);
  const yOf = (hour: number) => top + hour * columnsHourHeight;
  const column = ({ x, width }: Rect): Rect[] =>
    hours.map((hour) => ({
      x,
      y: yOf(hour),
      width,
      height: columnsHourHeight - cellGap,
    }));
  return {
    layout: "columns",
    width: chart.width,
    height: top + hoursPerDay * columnsHourHeight - cellGap + labelRoom,
    hourLabels: labelledHours.map((hour) => ({
      hour,
      spot: {
        x: chart.plot.x - textGap,
        y: yOf(hour) + (columnsHourHeight - cellGap) / 2,
        anchor: "end",
      },
    })),
    groups: chart.groups.map(({ day, bar }) => ({
      day,
      cells: column(bar.rect),
      label: null,
    })),
  };
}

/**
 * Beside the rows: a thin row per day, oldest at the top, labelled at its
 * left as the bars' rows are, and a column per hour across the width from
 * where the bars start, with the labelled hours written above, a line's
 * height below the bars' axis so that the two rows of numbers are not read
 * as one.
 */
function rowsHeatmap<T extends Counts>(
  chart: ChartGeometry<T>,
): HeatmapGeometry<T> {
  const left = chart.plot.x;
  const hourWidth = Math.max(0, chart.width - left) / hoursPerDay;
  const labelsY = textHeight * 1.5;
  const top = labelsY + textHeight / 2 + textGap;
  const dayHeight = rowsTrack.thickness + rowsTrack.dayGap;
  const row = (y: number): Rect[] =>
    hours.map((hour) => ({
      x: left + hour * hourWidth,
      y,
      width: Math.max(0, hourWidth - cellGap),
      height: rowsTrack.thickness,
    }));
  return {
    layout: "rows",
    width: chart.width,
    height: top + chart.groups.length * dayHeight - rowsTrack.dayGap,
    hourLabels: labelledHours.map((hour) => ({
      hour,
      spot: {
        x: left + hour * hourWidth + (hourWidth - cellGap) / 2,
        y: labelsY,
        anchor: "middle",
      },
    })),
    groups: chart.groups.map(({ day }, index) => {
      const y = top + index * dayHeight;
      return {
        day,
        cells: row(y),
        label: {
          x: left - textGap * 2,
          y: y + rowsTrack.thickness / 2,
          anchor: "end",
        },
      };
    }),
  };
}
