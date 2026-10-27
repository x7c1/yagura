import { describe, expect, it } from "vitest";
import {
  chartGeometry,
  chartLayout,
  dayLabelWidth,
  digitWidth,
  minColumnsWidth,
  pushDiameter,
  yAxis,
  type DayGroup,
} from "./chart-geometry";

const days = (n: number, merged = 0, pushed = 0) =>
  Array.from({ length: n }, () => ({ merged, pushed }));

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
    const fortnight = days(14, 7);
    const switchAt = minColumnsWidth(fortnight);

    expect(chartLayout(fortnight, switchAt)).toBe("columns");
    expect(chartLayout(fortnight, switchAt - 1)).toBe("rows");
    // A desktop's content width fits the columns, a phone's does not.
    expect(chartLayout(fortnight, 1000)).toBe("columns");
    expect(chartLayout(fortnight, 340)).toBe("rows");
  });

  it("needs wider columns for counts with more digits", () => {
    const small = days(14, 9);
    const large = days(14, 120);

    expect(minColumnsWidth(large)).toBeGreaterThan(minColumnsWidth(small));
    expect(chartLayout(large, minColumnsWidth(small))).toBe("rows");
  });

  it("keeps a digit's width between neighbouring days at the switch point", () => {
    for (const merged of [3, 120]) {
      const fortnight = days(14, merged);
      const { groups } = chartGeometry(fortnight, minColumnsWidth(fortnight));

      for (const [index, { bar }] of groups.slice(0, -1).entries()) {
        const next = groups[index + 1] as DayGroup;
        const space = next.bar.rect.x - (bar.rect.x + bar.rect.width);
        expect(space).toBeGreaterThanOrEqual(digitWidth - 1e-9);
      }
    }
  });

  it("gives each column's bar room for its count at the switch point", () => {
    const fortnight = days(14, 120);
    const { groups } = chartGeometry(fortnight, minColumnsWidth(fortnight));

    for (const { bar } of groups) {
      expect(bar.rect.width).toBeGreaterThanOrEqual(3 * digitWidth);
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
    const lefts = groups.map(({ bar }) => bar.rect.x);
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
    for (const { bar } of groups) {
      expect(bar.rect.x).toBeGreaterThanOrEqual(plot.x);
      expect(bar.rect.x + bar.rect.width).toBeLessThanOrEqual(800);
    }
  });

  it("scales the bars on one axis from zero, with their counts above", () => {
    const { plot, groups, ticks } = chartGeometry(
      [
        { merged: 4, pushed: 0 },
        { merged: 0, pushed: 0 },
        { merged: 1, pushed: 0 },
      ],
      400,
    );
    const bottom = plot.y + plot.height;

    const [first, second, third] = groups as [DayGroup, DayGroup, DayGroup];
    expect(first.bar.rect).toMatchObject({ y: plot.y, height: plot.height });
    expect(second.bar.rect.height).toBe(0);
    expect(second.bar.rect.y).toBe(bottom);
    expect(third.bar.rect.height).toBeCloseTo(plot.height / 4);
    expect(third.bar.rect.y + third.bar.rect.height).toBeCloseTo(bottom);
    for (const { rect, count } of [first.bar, third.bar]) {
      expect(count.x).toBeCloseTo(rect.x + rect.width / 2);
      expect(count.y).toBeLessThan(rect.y);
      expect(count.y).toBeGreaterThan(0);
    }
    expect(ticks.map(({ value }) => value)).toEqual([0, 1, 2, 3, 4]);
    expect(ticks[0]?.line.y1).toBe(bottom);
    expect(ticks[4]?.line.y1).toBe(plot.y);
  });

  it("shares the plot's width out among the days, a bar centred in each", () => {
    for (const width of [600, 1000]) {
      const { plot, groups } = chartGeometry(days(14), width);
      const share = plot.width / 14;
      // Each day's bar takes three fifths of its share.
      expect(groups[0]?.bar.rect.width).toBeCloseTo(share * 0.6);
      expect(
        (groups[0]?.bar.rect.x ?? 0) + (groups[0]?.bar.rect.width ?? 0) / 2,
      ).toBeCloseTo(plot.x + share / 2);
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
  it("has a labelled row per day, top to bottom", () => {
    const { layout, groups } = chartGeometry(days(14), 340);

    expect(layout).toBe("rows");
    expect(groups).toHaveLength(14);
    const tops = groups.map(({ bar }) => bar.rect.y);
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    for (const [index, { bar, label }] of groups.entries()) {
      const next = groups[index + 1];
      if (next !== undefined) {
        expect(bar.rect.y + bar.rect.height).toBeLessThan(next.bar.rect.y);
      }
      expect(label?.x).toBeLessThan(bar.rect.x);
      expect(label?.anchor).toBe("end");
      expect(label?.y).toBeCloseTo(bar.rect.y + bar.rect.height / 2);
    }
  });

  it("scales the bars on one axis, with their counts within the width", () => {
    const width = 340;
    const { plot, groups, ticks } = chartGeometry(
      [
        { merged: 12, pushed: 0 },
        { merged: 0, pushed: 0 },
        { merged: 3, pushed: 0 },
        ...days(11),
      ],
      width,
    );

    const [first, second, third] = groups as [DayGroup, DayGroup, DayGroup];
    // The axis runs to 15 in steps of 5.
    expect(ticks.map(({ value }) => value)).toEqual([0, 5, 10, 15]);
    expect(first.bar.rect.x).toBe(plot.x);
    expect(first.bar.rect.width).toBeCloseTo((plot.width * 12) / 15);
    expect(second.bar.rect.width).toBe(0);
    expect(third.bar.rect.width).toBeCloseTo((plot.width * 3) / 15);
    // A count starts clear of its bar's focus ring (2px wide, 2px off the
    // bar), with a gap.
    const clearOfFocusRing = 2 + 2 + 1;
    for (const { rect, count } of [first.bar, second.bar, third.bar]) {
      expect(count.x).toBeGreaterThanOrEqual(
        rect.x + rect.width + clearOfFocusRing,
      );
      expect(count.anchor).toBe("start");
    }
    // The longest bar's count, two digits, still fits.
    expect(first.bar.count.x + 2 * digitWidth).toBeLessThanOrEqual(width);
    expect(ticks[3]?.line.x1).toBe(plot.x + plot.width);
  });
});

describe("the push circles", () => {
  it("are all one size, with room for the largest count", () => {
    expect(pushDiameter(days(14, 0, 3))).toBe(16);
    expect(pushDiameter(days(14, 0, 120))).toBeGreaterThanOrEqual(
      3 * digitWidth,
    );
    const { groups } = chartGeometry(
      [...days(13, 1, 2), { merged: 0, pushed: 45 }],
      1000,
    );
    expect(new Set(groups.map(({ push }) => push.r)).size).toBe(1);
  });

  it("sit in a row above the plot, centred over their days, labelled at its left", () => {
    const { plot, groups, pushLabel } = chartGeometry(days(14, 4, 9), 1000);

    for (const { bar, push } of groups) {
      expect(push.cx).toBeCloseTo(bar.rect.x + bar.rect.width / 2);
      expect(push.cy).toBe(groups[0]?.push.cy);
      // Above the counts of the tallest bars, and inside the chart.
      expect(push.cy + push.r).toBeLessThan(bar.count.y);
      expect(push.cy - push.r).toBeGreaterThan(0);
    }
    expect(pushLabel).toMatchObject({ anchor: "end", y: groups[0]?.push.cy });
    expect(pushLabel.x).toBeLessThanOrEqual(plot.x);
    // The label, "Pushes", fits left of the plot.
    expect(pushLabel.x).toBeGreaterThanOrEqual(44);
  });

  it("leave a gap between neighbouring days at the switch point", () => {
    const fortnight = days(14, 1, 120);
    const { groups } = chartGeometry(fortnight, minColumnsWidth(fortnight));

    for (const [index, { push }] of groups.slice(0, -1).entries()) {
      const next = (groups[index + 1] as DayGroup).push;
      expect(next.cx - next.r - (push.cx + push.r)).toBeGreaterThan(0);
    }
  });

  it("sit next to the dates where the days are rows, labelled above them", () => {
    const { plot, groups, pushLabel } = chartGeometry(days(14, 2, 30), 340);

    for (const { bar, push, label } of groups) {
      expect(label?.x).toBeLessThan(push.cx - push.r);
      expect(push.cx + push.r).toBeLessThan(bar.rect.x);
      expect(push.cy).toBeCloseTo(bar.rect.y + bar.rect.height / 2);
      expect(label?.y).toBeCloseTo(push.cy);
    }
    for (const [index, { push }] of groups.slice(0, -1).entries()) {
      const next = (groups[index + 1] as DayGroup).push;
      expect(next.cy - next.r).toBeGreaterThan(push.cy + push.r);
    }
    expect(pushLabel).toMatchObject({
      x: groups[0]?.push.cx,
      anchor: "middle",
    });
    expect(pushLabel.y).toBeLessThan(plot.y);
  });
});
