/** The size of the chart, in the units of its SVG `viewBox`. */
export const chartSize = { width: 640, height: 200 } as const;

/** Room around the plot: the y axis's labels left, the day labels below. */
const margin = { top: 8, right: 8, bottom: 24, left: 32 } as const;

/** The width a day label such as "Sep 29" needs, at the chart's font size. */
export const dayLabelWidth = 40;

/** The most steps the y axis is divided into. */
const maxTicks = 5;

/** A rectangle in the chart's units. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A tick on the y axis: its value, and where it is drawn. */
export interface Tick {
  readonly value: number;
  readonly y: number;
}

/** The counts a day's group is drawn from. */
export interface Counts {
  readonly opened: number;
  readonly merged: number;
}

/**
 * One day's group: the day it was drawn from, its two bars, and where its
 * label goes, if it has one.
 */
export interface DayGroup<T extends Counts = Counts> {
  readonly day: T;
  readonly opened: Rect;
  readonly merged: Rect;
  /** The horizontal centre of the group, where its label is drawn. */
  readonly center: number;
  readonly labelled: boolean;
}

export interface ChartGeometry<T extends Counts = Counts> {
  /** The plot area, inside the axes. */
  readonly plot: Rect;
  readonly ticks: readonly Tick[];
  readonly groups: readonly DayGroup<T>[];
}

/**
 * The y axis for counts up to `max`: it starts at zero and ends at the
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

/**
 * Where everything in the chart goes for the opened and merged counts of
 * each day, oldest first: one group per day, the opened bar left of the
 * merged one, on a y axis shared by both and starting at zero. Every day is
 * labelled if the labels fit side by side, else every other day, counting
 * back from the last one so that today always has a label.
 */
export function chartGeometry<T extends Counts>(
  days: readonly T[],
): ChartGeometry<T> {
  const plot: Rect = {
    x: margin.left,
    y: margin.top,
    width: chartSize.width - margin.left - margin.right,
    height: chartSize.height - margin.top - margin.bottom,
  };
  const bottom = plot.y + plot.height;
  const axis = yAxis(Math.max(0, ...days.flatMap((d) => [d.opened, d.merged])));
  const yOf = (value: number) => bottom - (value / axis.max) * plot.height;

  const groupWidth = days.length === 0 ? 0 : plot.width / days.length;
  // A fifth of each group is left as space between the groups.
  const barWidth = (groupWidth * 0.8) / 2;
  const labelEvery = groupWidth >= dayLabelWidth ? 1 : 2;
  const bar = (left: number, value: number): Rect => ({
    x: left,
    y: yOf(value),
    width: barWidth,
    height: bottom - yOf(value),
  });

  return {
    plot,
    ticks: Array.from({ length: axis.max / axis.step + 1 }, (_, index) => ({
      value: index * axis.step,
      y: yOf(index * axis.step),
    })),
    groups: days.map((day, index) => {
      const center = plot.x + groupWidth * (index + 0.5);
      return {
        day,
        opened: bar(center - barWidth, day.opened),
        merged: bar(center, day.merged),
        center,
        labelled: (days.length - 1 - index) % labelEvery === 0,
      };
    }),
  };
}
