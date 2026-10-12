import { describe, expect, it } from "vitest";
import {
  chartGeometry,
  chartSize,
  dayLabelWidth,
  yAxis,
  type DayGroup,
} from "./chart-geometry";

const days = (n: number, counts = { opened: 0, merged: 0 }) =>
  Array.from({ length: n }, () => counts);

describe("yAxis", () => {
  it("runs to 1 with nothing to show", () => {
    expect(yAxis(0)).toEqual({ max: 1, step: 1 });
  });

  it("steps by one for small counts", () => {
    expect(yAxis(1)).toEqual({ max: 1, step: 1 });
    expect(yAxis(4)).toEqual({ max: 4, step: 1 });
    expect(yAxis(5)).toEqual({ max: 5, step: 1 });
  });

  it("takes a larger step of 1, 2 or 5 times a power of ten", () => {
    expect(yAxis(7)).toEqual({ max: 8, step: 2 });
    expect(yAxis(11)).toEqual({ max: 15, step: 5 });
    expect(yAxis(42)).toEqual({ max: 50, step: 10 });
    expect(yAxis(230)).toEqual({ max: 250, step: 50 });
  });
});

describe("chartGeometry", () => {
  it("has one group per day, left to right, within the plot", () => {
    const { plot, groups } = chartGeometry(days(14));

    expect(groups).toHaveLength(14);
    const centers = groups.map(({ center }) => center);
    expect([...centers].sort((a, b) => a - b)).toEqual(centers);
    for (const { opened, merged } of groups) {
      expect(opened.x).toBeGreaterThanOrEqual(plot.x);
      expect(merged.x + merged.width).toBeLessThanOrEqual(plot.x + plot.width);
      // Side by side, opened first.
      expect(opened.x + opened.width).toBeLessThanOrEqual(merged.x);
    }
    expect(plot.x + plot.width).toBeLessThanOrEqual(chartSize.width);
  });

  it("scales the bars on one y axis from zero at the plot's bottom", () => {
    const { plot, groups, ticks } = chartGeometry([
      { opened: 4, merged: 2 },
      { opened: 0, merged: 1 },
    ]);
    const bottom = plot.y + plot.height;

    const [first, second] = groups as [DayGroup, DayGroup];
    expect(first.opened).toMatchObject({ y: plot.y, height: plot.height });
    expect(first.merged.height).toBeCloseTo(plot.height / 2);
    expect(first.merged.y + first.merged.height).toBeCloseTo(bottom);
    expect(second.opened.height).toBe(0);
    expect(second.opened.y).toBe(bottom);
    expect(second.merged.height).toBeCloseTo(plot.height / 4);
    expect(ticks.map(({ value }) => value)).toEqual([0, 1, 2, 3, 4]);
    expect(ticks[0]?.y).toBe(bottom);
    expect(ticks[4]?.y).toBe(plot.y);
  });

  it("labels every day when the labels fit", () => {
    const { plot, groups } = chartGeometry(days(14));

    expect(plot.width / 14).toBeGreaterThanOrEqual(dayLabelWidth);
    expect(groups.every(({ labelled }) => labelled)).toBe(true);
  });

  it("labels every other day, today included, when they do not fit", () => {
    const { groups } = chartGeometry(days(31));

    expect(groups.map(({ labelled }) => labelled).slice(-4)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(groups.filter(({ labelled }) => labelled)).toHaveLength(16);
  });
});
