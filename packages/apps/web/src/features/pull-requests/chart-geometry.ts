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
export const textHeight = 16;

/** The space between a bar and its count, or an axis and its labels. */
export const textGap = 4;

/**
 * The space above and below the day labels of the column layout. They head
 * both the bars above them and the hours' heatmap below, so they sit midway
 * between the two: this much from the axis down to the labels, and as much
 * from the labels down to the heatmap's first row (see `heatmap-geometry.ts`).
 * It is measured to the labels' capitals and figures, not to their line of
 * text, whose empty room above and below them is not seen.
 */
export const dayLabelSpace = 7;

/**
 * The height of capitals and figures at the small type size, and how far
 * above a text's `y` their middle sits: text is placed by its `middle`
 * baseline, which browsers take to be the middle of the lower-case letters.
 */
export const capitals = { height: 10, rise: 1 } as const;

/**
 * How far a bar's keyboard focus ring reaches past its edge: the ring's
 * width plus its offset (`--focus-ring-width` and `--focus-ring-offset`,
 * 2px each). A count written past a bar's end starts beyond it, so that the
 * ring does not cover the count.
 */
const focusRingReach = 2 + 2;

/** The share of a column taken by its day's bar; the rest is space. */
const barShare = 0.6;

/**
 * The height of the plot in the column layout: short enough to leave the
 * hours' heatmap under it room on a laptop's screen.
 */
const columnsPlotHeight = 120;

/**
 * The widest label of the hours' heatmap drawn under the columns, "18",
 * which goes in the room left of the plot as the axis's labels do.
 */
const hourLabelWidth = 2 * digitWidth;

/**
 * The width the push row's label, "Pushes", needs at the left of the
 * columns, where the axis's labels go.
 */
const pushLabelWidth = 46;

/** The smallest a push circle is: room for a count of one digit. */
const minPushDiameter = 16;

/** The room a push circle leaves around its count, on each side. */
const pushPadding = 3;

/**
 * The space above the column layout's row of push circles, between it and
 * the last row of the hours' heatmap drawn above it.
 */
const pushRowGap = textGap;

/** The thickness of a row's bar. */
const rowBarThickness = 14;

/** The space between two rows. */
const rowGap = 8;

/** The most steps the axis is divided into. */
const maxTicks = 5;

/**
 * How the days are laid out: a column per day with the bar growing up, or a
 * row per day with the bar growing to the right.
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

/**
 * The counts a day is drawn from: the pull requests merged on it, for its
 * bar, and the members' pushes, for its push circle.
 */
export interface Counts {
  readonly merged: number;
  readonly pushed: number;
}

/** A bar, and where its count is written. */
export interface Bar {
  readonly rect: Rect;
  readonly count: TextSpot;
}

/** A circle, its count written at its centre. */
export interface Circle {
  readonly cx: number;
  readonly cy: number;
  readonly r: number;
}

/**
 * One day's group: the day it was drawn from, its bar, its push circle,
 * and where its label goes, if it has one.
 */
export interface DayGroup<T extends Counts = Counts> {
  readonly day: T;
  readonly bar: Bar;
  readonly push: Circle;
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
  /**
   * Where the push circles go. In the column layout they are a row of their
   * own, drawn under the hours' heatmap, and their circles and label are
   * placed from the top left corner of that row, `pushRow.height` tall; in
   * the row layout (`pushRow` null) they are in the chart, next to the
   * dates.
   */
  readonly pushRow: { readonly height: number } | null;
  /** Where the push circles' label, "Pushes", goes. */
  readonly pushLabel: TextSpot;
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

/** The largest merged count of `days`, or 0 for none. */
function maxCount(days: readonly Counts[]): number {
  return Math.max(0, ...days.map((d) => d.merged));
}

/**
 * The diameter of every push circle: room for the largest count of pushes
 * of `days`, so that the circles are all one size and their counts, not
 * their sizes, tell the days apart.
 */
export function pushDiameter(days: readonly Counts[]): number {
  const most = Math.max(0, ...days.map((d) => d.pushed));
  return Math.max(minPushDiameter, textWidth(most) + pushPadding * 2);
}

/**
 * The room left of the column layout's plot, for the axis's labels, the
 * push row's label and the labels of the hours' heatmap under it, which
 * shares the plot's columns.
 */
function columnsAxisWidth(axisMax: number): number {
  return Math.max(textWidth(axisMax), hourLabelWidth, pushLabelWidth) + textGap;
}

/**
 * The narrowest a column's bar may be: wide enough for the largest count
 * written above it, with a gap to its neighbour's count.
 */
function columnBarWidthNeeded(days: readonly Counts[]): number {
  return textWidth(maxCount(days)) + textGap;
}

/**
 * The narrowest width at which every column has room for its bar and its
 * count, with at least a digit's width of space between one day's bar and
 * the next, so that neighbouring days' counts do not run together, room
 * for its push circle with a gap to the next one, and room for a label
 * under at least every other day, so that the days can be told apart
 * without counting columns. Narrower than this, as on a phone, the days
 * are laid out in rows, each labelled.
 */
export function minColumnsWidth(days: readonly Counts[]): number {
  const axis = yAxis(maxCount(days));
  const groupWidth = Math.max(
    columnBarWidthNeeded(days) / barShare,
    digitWidth / (1 - barShare),
    pushDiameter(days) + textGap,
    (dayLabelWidth + textGap) / 2,
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
 * Where everything in the chart goes for the merged count of each day,
 * oldest first, at `width`. Both layouts put the days in order, the newest
 * last, on an axis shared by all the bars and starting at zero, with each
 * bar's count past its end.
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
 * A column per day, its bar growing up from the axis, centred in it, and
 * its push circle centred under it in a row of its own, labelled at its
 * left, which is drawn under the hours' heatmap. Every day is labelled below if the labels fit side by side, else
 * every other day (or fewer, as needed), counting back from the last one
 * so that today always has a label.
 */
function columnsGeometry<T extends Counts>(
  days: readonly T[],
  width: number,
): ChartGeometry<T> {
  const axis = yAxis(maxCount(days));
  const left = columnsAxisWidth(axis.max);
  const r = pushDiameter(days) / 2;
  // The push row's circles, under the heatmap, with room under them for a
  // circle's focus ring.
  const pushY = pushRowGap + r;
  const pushRowHeight = pushY + r + focusRingReach;
  // Room above the plot for the count of a bar that reaches its top, and
  // no more: the section's heading is right above.
  const plot: Rect = {
    x: left,
    y: textHeight + textGap,
    width: width - left,
    height: columnsPlotHeight,
  };
  const bottom = plot.y + plot.height;
  const yOf = (value: number) => bottom - (value / axis.max) * plot.height;

  const groupWidth = plot.width / days.length;
  const barWidth = groupWidth * barShare;
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
    // The chart ends at the foot of the day labels' capitals: the space
    // under them is the heatmap's, drawn right under the chart.
    height: bottom + dayLabelSpace + capitals.height,
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
    pushRow: { height: pushRowHeight },
    pushLabel: { x: plot.x - textGap, y: pushY, anchor: "end" },
    groups: days.map((day, index) => {
      const center = plot.x + groupWidth * (index + 0.5);
      return {
        day,
        bar: bar(center - barWidth / 2, day.merged),
        push: { cx: center, cy: pushY, r },
        label:
          (days.length - 1 - index) % labelEvery === 0
            ? {
                x: center,
                y: bottom + dayLabelSpace + capitals.height / 2 + capitals.rise,
                anchor: "middle",
              }
            : null,
      };
    }),
  };
}

/**
 * A row per day, the day's label left of its push circle, and the bar
 * right of that, growing to the right from the axis. Every day is
 * labelled, and the circles are labelled "Pushes" above them.
 */
function rowsGeometry<T extends Counts>(
  days: readonly T[],
  width: number,
): ChartGeometry<T> {
  const max = maxCount(days);
  const axis = yAxis(max);
  const r = pushDiameter(days) / 2;
  const pushX = dayLabelWidth + textGap * 2 + r;
  const left = pushX + r + textGap * 2;
  const rowInner = Math.max(rowBarThickness, r * 2);
  const rowHeight = rowInner + rowGap;
  // A count starts clear of its bar's focus ring, and there is room right
  // of the plot for the count of a bar that reaches its end.
  const countOffset = focusRingReach + textGap;
  const plot: Rect = {
    x: left,
    // Room above the rows for the push circles' label.
    y: textHeight + textGap,
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
      height: rowBarThickness,
    },
    count: {
      x: xOf(value) + countOffset,
      y: top + rowBarThickness / 2,
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
    pushRow: null,
    pushLabel: { x: pushX, y: textHeight / 2, anchor: "middle" },
    groups: days.map((day, index) => {
      const top = plot.y + rowHeight * index + rowGap / 2;
      const middle = top + rowInner / 2;
      return {
        day,
        bar: bar(middle - rowBarThickness / 2, day.merged),
        push: { cx: pushX, cy: middle, r },
        label: {
          x: pushX - r - textGap * 2,
          y: middle,
          anchor: "end",
        },
      };
    }),
  };
}
