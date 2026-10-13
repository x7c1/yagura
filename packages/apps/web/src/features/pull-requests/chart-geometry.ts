/*
 * The chart is drawn at the width it is given, in CSS pixels, and its text
 * at the small type size (`--font-size-sm`, 13px at the default root size),
 * never scaled. The text sizes below are what that type needs, with some
 * room to spare.
 */

/** The width of one digit of a count, in tabular figures. */
export const digitWidth = 8;

/** The width a day label such as "Sep 29" needs. */
export const dayLabelWidth = 44;

/** The height a line of text needs. */
const textHeight = 16;

/** The space between a bar and its count, or an axis and its labels. */
const textGap = 4;

/**
 * How far a bar's keyboard focus ring reaches past its edge: the ring's
 * width plus its offset (`--focus-ring-width` and `--focus-ring-offset`,
 * 2px each). A count written past a bar's end starts beyond it, so that the
 * ring does not cover the count.
 */
const focusRingReach = 2 + 2;

/** The share of a column's group taken by its two bars; the rest is space. */
const barShare = 0.8;

/** The height of the plot in the column layout. */
const columnsPlotHeight = 180;

/** A row's bars: each bar's thickness, and the space between them. */
const rowBar = { thickness: 14, gap: 2 } as const;

/** The space between two rows. */
const rowGap = 8;

/** The most steps the axis is divided into. */
const maxTicks = 5;

/**
 * How the days are laid out: a column per day with the bars growing up, or
 * a row per day with the bars growing to the right.
 */
export type ChartLayout = "columns" | "rows";

/** A rectangle, in CSS pixels from the chart's top left corner. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Where a piece of text goes: `y` is its vertical centre, and `anchor` says
 * whether `x` is its start, middle or end.
 */
export interface TextSpot {
  readonly x: number;
  readonly y: number;
  readonly anchor: "start" | "middle" | "end";
}

/** A line between two points. */
export interface Line {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

/** A step of the axis: its value, its grid line and its label. */
export interface Tick {
  readonly value: number;
  readonly line: Line;
  readonly label: TextSpot;
}

/** The counts a day's group is drawn from. */
export interface Counts {
  readonly opened: number;
  readonly merged: number;
}

/** A bar, and where its count is written. */
export interface Bar {
  readonly rect: Rect;
  readonly count: TextSpot;
}

/**
 * One day's group: the day it was drawn from, its two bars, and where its
 * label goes, if it has one.
 */
export interface DayGroup<T extends Counts = Counts> {
  readonly day: T;
  readonly opened: Bar;
  readonly merged: Bar;
  readonly label: TextSpot | null;
}

export interface ChartGeometry<T extends Counts = Counts> {
  readonly layout: ChartLayout;
  /** The chart's size: `width` is the width it was given. */
  readonly width: number;
  readonly height: number;
  /** The plot area, inside the axes, the bars start from its bottom or left. */
  readonly plot: Rect;
  readonly ticks: readonly Tick[];
  readonly groups: readonly DayGroup<T>[];
}

/**
 * The axis for counts up to `max`: it starts at zero and ends at the
 * smallest multiple of a 1, 2 or 5 step (times a power of ten) that holds
 * `max` in at most {@link maxTicks} steps. With nothing to show, the axis
 * runs to 1.
 */
export function yAxis(max: number): { max: number; step: number } {
  if (max <= 0) {
    return { max: 1, step: 1 };
  }
  for (let power = 1; ; power *= 10) {
    for (const base of [1, 2, 5]) {
      const step = base * power;
      const steps = Math.ceil(max / step);
      if (steps <= maxTicks) {
        return { max: steps * step, step };
      }
    }
  }
}

/** The width `value` needs when written out. */
function textWidth(value: number): number {
  return String(value).length * digitWidth;
}

/** The largest count of `days`, or 0 for none. */
function maxCount(days: readonly Counts[]): number {
  return Math.max(0, ...days.flatMap((d) => [d.opened, d.merged]));
}

/** The room left of the column layout's plot, for the axis's labels. */
function columnsAxisWidth(axisMax: number): number {
  return textWidth(axisMax) + textGap;
}

/**
 * The narrowest a column's bar may be: wide enough for the largest count
 * written above it, with a gap to its neighbour's count.
 */
function columnBarWidthNeeded(days: readonly Counts[]): number {
  return textWidth(maxCount(days)) + textGap;
}

/**
 * The narrowest width at which every column has room for its two bars and
 * their counts side by side, with at least a digit's width of space between
 * one day's group and the next, so that neighbouring days' counts do not
 * run together. Narrower than this, the days are laid out in rows.
 */
export function minColumnsWidth(days: readonly Counts[]): number {
  const axis = yAxis(maxCount(days));
  const groupWidth = Math.max(
    (columnBarWidthNeeded(days) * 2) / barShare,
    digitWidth / (1 - barShare),
  );
  return columnsAxisWidth(axis.max) + groupWidth * days.length;
}

/** The layout the days get at `width`: columns if they fit, else rows. */
export function chartLayout(
  days: readonly Counts[],
  width: number,
): ChartLayout {
  return days.length > 0 && width >= minColumnsWidth(days) ? "columns" : "rows";
}

/**
 * Where everything in the chart goes for the opened and merged counts of
 * each day, oldest first, at `width`. Both layouts put the days in order,
 * the newest last, the opened bar before the merged one, on an axis shared
 * by all the bars and starting at zero, with each bar's count past its end.
 */
export function chartGeometry<T extends Counts>(
  days: readonly T[],
  width: number,
): ChartGeometry<T> {
  return chartLayout(days, width) === "columns"
    ? columnsGeometry(days, width)
    : rowsGeometry(days, width);
}

/** The values of the steps of `axis`, from zero up. */
function tickValues(axis: { max: number; step: number }): number[] {
  return Array.from(
    { length: axis.max / axis.step + 1 },
    (_, index) => index * axis.step,
  );
}

/**
 * A column per day, the two bars side by side growing up from the axis.
 * Every day is labelled below if the labels fit side by side, else every
 * other day (or fewer, as needed), counting back from the last one so that
 * today always has a label.
 */
function columnsGeometry<T extends Counts>(
  days: readonly T[],
  width: number,
): ChartGeometry<T> {
  const axis = yAxis(maxCount(days));
  const left = columnsAxisWidth(axis.max);
  // Room above the plot for the count of a bar that reaches its top.
  const plot: Rect = {
    x: left,
    y: textHeight + textGap,
    width: width - left,
    height: columnsPlotHeight,
  };
  const bottom = plot.y + plot.height;
  const yOf = (value: number) => bottom - (value / axis.max) * plot.height;

  const groupWidth = plot.width / days.length;
  const barWidth = (groupWidth * barShare) / 2;
  const labelEvery = Math.ceil((dayLabelWidth + textGap) / groupWidth);
  const bar = (left: number, value: number): Bar => ({
    rect: {
      x: left,
      y: yOf(value),
      width: barWidth,
      height: bottom - yOf(value),
    },
    count: {
      x: left + barWidth / 2,
      y: yOf(value) - textGap - textHeight / 2,
      anchor: "middle",
    },
  });

  return {
    layout: "columns",
    width,
    height: bottom + textGap + textHeight,
    plot,
    ticks: tickValues(axis).map((value) => ({
      value,
      line: {
        x1: plot.x,
        x2: plot.x + plot.width,
        y1: yOf(value),
        y2: yOf(value),
      },
      label: { x: plot.x - textGap, y: yOf(value), anchor: "end" },
    })),
    groups: days.map((day, index) => {
      const center = plot.x + groupWidth * (index + 0.5);
      return {
        day,
        opened: bar(center - barWidth, day.opened),
        merged: bar(center, day.merged),
        label:
          (days.length - 1 - index) % labelEvery === 0
            ? {
                x: center,
                y: bottom + textGap + textHeight / 2,
                anchor: "middle",
              }
            : null,
      };
    }),
  };
}

/**
 * A row per day, the day's label left of its two bars, the opened bar above
 * the merged one, both growing to the right from the axis. Every day is
 * labelled.
 */
function rowsGeometry<T extends Counts>(
  days: readonly T[],
  width: number,
): ChartGeometry<T> {
  const max = maxCount(days);
  const axis = yAxis(max);
  const left = dayLabelWidth + textGap * 2;
  const rowHeight = rowBar.thickness * 2 + rowBar.gap + rowGap;
  // A count starts clear of its bar's focus ring, and there is room right
  // of the plot for the count of a bar that reaches its end.
  const countOffset = focusRingReach + textGap;
  const plot: Rect = {
    x: left,
    y: 0,
    width: Math.max(0, width - left - countOffset - textWidth(max)),
    height: rowHeight * days.length,
  };
  const bottom = plot.y + plot.height;
  const xOf = (value: number) => plot.x + (value / axis.max) * plot.width;
  const bar = (top: number, value: number): Bar => ({
    rect: {
      x: plot.x,
      y: top,
      width: xOf(value) - plot.x,
      height: rowBar.thickness,
    },
    count: {
      x: xOf(value) + countOffset,
      y: top + rowBar.thickness / 2,
      anchor: "start",
    },
  });

  return {
    layout: "rows",
    width,
    height: bottom + textGap + textHeight,
    plot,
    ticks: tickValues(axis).map((value) => ({
      value,
      line: { x1: xOf(value), x2: xOf(value), y1: plot.y, y2: bottom },
      label: {
        x: xOf(value),
        y: bottom + textGap + textHeight / 2,
        anchor: "middle",
      },
    })),
    groups: days.map((day, index) => {
      const top = plot.y + rowHeight * index + rowGap / 2;
      return {
        day,
        opened: bar(top, day.opened),
        merged: bar(top + rowBar.thickness + rowBar.gap, day.merged),
        label: {
          x: plot.x - textGap * 2,
          y: top + rowBar.thickness + rowBar.gap / 2,
          anchor: "end",
        },
      };
    }),
  };
}
