import { describe, expect, it } from "vitest";
import {
  chartGeometry,
  chartLayout,
  dayLabelWidth,
  digitWidth,
  minColumnsWidth,
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

describe("chartLayout", () => {
  it("switches to rows just below the width the columns need", () => {
    const fortnight = days(14, { opened: 7, merged: 3 });
    const switchAt = minColumnsWidth(fortnight);

    expect(chartLayout(fortnight, switchAt)).toBe("columns");
    expect(chartLayout(fortnight, switchAt - 1)).toBe("rows");
    // A desktop's content width fits the columns, a phone's does not.
    expect(chartLayout(fortnight, 1000)).toBe("columns");
    expect(chartLayout(fortnight, 340)).toBe("rows");
  });

  it("needs wider columns for counts with more digits", () => {
    const small = days(14, { opened: 9, merged: 0 });
    const large = days(14, { opened: 120, merged: 0 });

    expect(minColumnsWidth(large)).toBeGreaterThan(minColumnsWidth(small));
    expect(chartLayout(large, minColumnsWidth(small))).toBe("rows");
  });

  it("keeps a digit's width between neighbouring days at the switch point", () => {
    for (const counts of [
      { opened: 7, merged: 3 },
      { opened: 120, merged: 0 },
    ]) {
      const fortnight = days(14, counts);
      const { groups } = chartGeometry(fortnight, minColumnsWidth(fortnight));

      for (const [index, { merged }] of groups.slice(0, -1).entries()) {
        const next = groups[index + 1] as DayGroup;
        const space = next.opened.rect.x - (merged.rect.x + merged.rect.width);
        expect(space).toBeGreaterThanOrEqual(digitWidth - 1e-9);
      }
    }
  });

  it("gives each column's bar room for its count at the switch point", () => {
    const fortnight = days(14, { opened: 120, merged: 0 });
    const { groups } = chartGeometry(fortnight, minColumnsWidth(fortnight));

    for (const { opened } of groups) {
      expect(opened.rect.width).toBeGreaterThanOrEqual(3 * digitWidth);
    }
  });
});

describe("chartGeometry in columns", () => {
  it("fills the width with a column per day, left to right", () => {
    const { layout, width, plot, groups } = chartGeometry(days(14), 800);

    expect(layout).toBe("columns");
    expect(width).toBe(800);
    expect(plot.x + plot.width).toBe(800);
    expect(groups).toHaveLength(14);
    const lefts = groups.map(({ opened }) => opened.rect.x);
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
    for (const { opened, merged } of groups) {
      expect(opened.rect.x).toBeGreaterThanOrEqual(plot.x);
      expect(merged.rect.x + merged.rect.width).toBeLessThanOrEqual(800);
      // Side by side, opened first.
      expect(opened.rect.x + opened.rect.width).toBeLessThanOrEqual(
        merged.rect.x,
      );
    }
  });

  it("scales the bars on one axis from zero, with their counts above", () => {
    const { plot, groups, ticks } = chartGeometry(
      [
        { opened: 4, merged: 2 },
        { opened: 0, merged: 1 },
      ],
      400,
    );
    const bottom = plot.y + plot.height;

    const [first, second] = groups as [DayGroup, DayGroup];
    expect(first.opened.rect).toMatchObject({ y: plot.y, height: plot.height });
    expect(first.merged.rect.height).toBeCloseTo(plot.height / 2);
    expect(first.merged.rect.y + first.merged.rect.height).toBeCloseTo(bottom);
    expect(second.opened.rect.height).toBe(0);
    expect(second.opened.rect.y).toBe(bottom);
    expect(second.merged.rect.height).toBeCloseTo(plot.height / 4);
    for (const { rect, count } of [first.opened, second.opened]) {
      expect(count.x).toBeCloseTo(rect.x + rect.width / 2);
      expect(count.y).toBeLessThan(rect.y);
      expect(count.y).toBeGreaterThan(0);
    }
    expect(ticks.map(({ value }) => value)).toEqual([0, 1, 2, 3, 4]);
    expect(ticks[0]?.line.y1).toBe(bottom);
    expect(ticks[4]?.line.y1).toBe(plot.y);
  });

  it("shares the plot's width out among the days", () => {
    for (const width of [600, 1000]) {
      const { plot, groups } = chartGeometry(days(14), width);
      // Each day's two bars take four fifths of its share.
      expect(groups[0]?.opened.rect.width).toBeCloseTo(
        ((plot.width / 14) * 0.8) / 2,
      );
    }
  });

  it("labels every day when the labels fit", () => {
    const { plot, groups } = chartGeometry(days(14), 1000);

    expect(plot.width / 14).toBeGreaterThanOrEqual(dayLabelWidth);
    expect(groups.every(({ label }) => label !== null)).toBe(true);
  });

  it("labels every other day, today included, when they do not fit", () => {
    const fortnight = days(14);
    const { groups } = chartGeometry(fortnight, minColumnsWidth(fortnight));

    expect(groups.map(({ label }) => label !== null).slice(-4)).toEqual([
      false,
      true,
      false,
      true,
    ]);
    expect(groups.filter(({ label }) => label !== null)).toHaveLength(7);
  });
});

describe("chartGeometry in rows", () => {
  it("has a labelled row per day, top to bottom, opened above merged", () => {
    const { layout, groups } = chartGeometry(days(14), 340);

    expect(layout).toBe("rows");
    expect(groups).toHaveLength(14);
    const tops = groups.map(({ opened }) => opened.rect.y);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    for (const { opened, merged, label } of groups) {
      expect(opened.rect.y + opened.rect.height).toBeLessThanOrEqual(
        merged.rect.y,
      );
      expect(label?.x).toBeLessThan(opened.rect.x);
      expect(label?.anchor).toBe("end");
    }
  });

  it("scales the bars on one axis, with their counts within the width", () => {
    const width = 340;
    const { plot, groups, ticks } = chartGeometry(
      [{ opened: 12, merged: 6 }, { opened: 0, merged: 3 }, ...days(12)],
      width,
    );

    const [first, second] = groups as [DayGroup, DayGroup];
    // The axis runs to 15 in steps of 5.
    expect(ticks.map(({ value }) => value)).toEqual([0, 5, 10, 15]);
    expect(first.opened.rect.x).toBe(plot.x);
    expect(first.opened.rect.width).toBeCloseTo((plot.width * 12) / 15);
    expect(first.merged.rect.width).toBeCloseTo((plot.width * 6) / 15);
    expect(second.opened.rect.width).toBe(0);
    expect(second.merged.rect.width).toBeCloseTo((plot.width * 3) / 15);
    // A count starts clear of its bar's focus ring (2px wide, 2px off the
    // bar), with a gap.
    const clearOfFocusRing = 2 + 2 + 1;
    for (const { rect, count } of [first.opened, first.merged, second.opened]) {
      expect(count.x).toBeGreaterThanOrEqual(
        rect.x + rect.width + clearOfFocusRing,
      );
      expect(count.anchor).toBe("start");
    }
    // The longest bar's count, two digits, still fits.
    expect(first.opened.count.x + 2 * digitWidth).toBeLessThanOrEqual(width);
    expect(ticks[3]?.line.x1).toBe(plot.x + plot.width);
  });
});
