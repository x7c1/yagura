import { dayKeyOf } from "@yagura/activity";
import { describe, expect, it } from "vitest";
import { chartGeometry, type Line, type Rect } from "./chart-geometry";
import { heatmapGeometry } from "./heatmap-geometry";
import { weekLines, weekStarts } from "./week-lines";

/** The day keys of the 14 days from October `first`, 2026. */
function fortnightFrom(first: number): string[] {
  return Array.from({ length: 14 }, (_, index) =>
    dayKeyOf(new Date(2026, 9, first + index)),
  );
}

/** The counts of `days`, as the chart draws them. */
function countsOf(days: readonly string[]) {
  return days.map((day, index) => ({
    day,
    merged: index % 3,
    pushed: index % 4,
  }));
}

const right = ({ x, width }: Rect) => x + width;
const bottom = ({ y, height }: Rect) => y + height;

// Sep 29 to Oct 12, 2026, Tuesday to Monday, with Sundays on Oct 4 and 11.
const tuesdayToMonday = fortnightFrom(-1);
// Oct 4 to Oct 17, 2026, Sunday to Saturday.
const sundayToSaturday = fortnightFrom(4);

describe("weekStarts", () => {
  it("finds each Sunday after the first day", () => {
    expect(tuesdayToMonday[0]).toBe("2026-09-29");
    expect(weekStarts(tuesdayToMonday)).toEqual([5, 12]);
  });

  it("starts no week at the first day, nor after the last, when the period starts on a Sunday and ends on a Saturday", () => {
    expect(sundayToSaturday[0]).toBe("2026-10-04");
    expect(sundayToSaturday[13]).toBe("2026-10-17");
    expect(weekStarts(sundayToSaturday)).toEqual([7]);
  });

  it("finds nothing for no days", () => {
    expect(weekStarts([])).toEqual([]);
  });
});

/** The bars' and the heatmap's geometry of `days` at `width`. */
function geometryOf(days: readonly string[], width: number) {
  const chart = chartGeometry(countsOf(days), width);
  const heatmap = heatmapGeometry(chart);
  return { chart, heatmap, lines: weekLines(chart, heatmap) };
}

const isVertical = ({ x1, x2 }: Line) => x1 === x2;
const isHorizontal = ({ y1, y2 }: Line) => y1 === y2;

describe("weekLines where the days are columns", () => {
  const { chart, heatmap, lines } = geometryOf(tuesdayToMonday, 1000);

  it("draws a line down the space between each Saturday's column and the Sunday's", () => {
    expect(chart.layout).toBe("columns");
    for (const part of [lines.bars, lines.heatmap, lines.pushRow]) {
      expect(part).toHaveLength(2);
      for (const [index, start] of [5, 12].entries()) {
        const line = part[index] as Line;
        const saturday = chart.groups[start - 1]?.bar.rect as Rect;
        const sunday = chart.groups[start]?.bar.rect as Rect;
        expect(isVertical(line)).toBe(true);
        expect(line.x1).toBeGreaterThan(right(saturday));
        expect(line.x1).toBeLessThan(sunday.x);
        expect(line.x1 - right(saturday)).toBeCloseTo(sunday.x - line.x1);
      }
    }
  });

  it("runs through the bars' plot, not the dates under it", () => {
    for (const line of lines.bars) {
      expect(line.y1).toBe(chart.plot.y);
      expect(line.y2).toBe(bottom(chart.plot));
    }
  });

  it("runs from the heatmap's first hour down to its foot, and on through the push circles", () => {
    const firstCell = heatmap.groups[0]?.cells[0] as Rect;
    const lastCell = heatmap.groups[0]?.cells[23] as Rect;
    for (const line of lines.heatmap) {
      expect(line.y1).toBe(firstCell.y);
      expect(line.y2).toBe(heatmap.height);
      expect(line.y2).toBeGreaterThanOrEqual(bottom(lastCell));
    }
    const push = chart.groups[0]?.push;
    for (const line of lines.pushRow) {
      expect(line.y1).toBe(0);
      expect(line.y2).toBe((push?.cy ?? 0) + (push?.r ?? 0));
    }
  });

  it("draws none at the ends of a period from a Sunday to a Saturday", () => {
    const { chart, lines } = geometryOf(sundayToSaturday, 1000);
    expect(lines.bars).toHaveLength(1);
    const between =
      (right(chart.groups[6]?.bar.rect as Rect) +
        (chart.groups[7]?.bar.rect as Rect).x) /
      2;
    expect(lines.bars[0]?.x1).toBeCloseTo(between);
    expect(lines.heatmap).toHaveLength(1);
    expect(lines.pushRow).toHaveLength(1);
  });
});

describe("weekLines where the days are rows", () => {
  const { chart, heatmap, lines } = geometryOf(tuesdayToMonday, 340);

  it("draws a line across, between each Saturday's row and the Sunday's, through the bars and the heatmap", () => {
    expect(chart.layout).toBe("rows");
    expect(lines.bars).toHaveLength(2);
    expect(lines.heatmap).toHaveLength(2);
    expect(lines.pushRow).toEqual([]);
    for (const [index, start] of [5, 12].entries()) {
      const bar = lines.bars[index] as Line;
      const saturday = chart.groups[start - 1]?.bar.rect as Rect;
      const sunday = chart.groups[start]?.bar.rect as Rect;
      expect(isHorizontal(bar)).toBe(true);
      expect(bar).toMatchObject({ x1: 0, x2: chart.width });
      expect(bar.y1).toBeGreaterThan(bottom(saturday));
      expect(bar.y1).toBeLessThan(sunday.y);
      // Clear of the push circles, which are taller than the bars.
      const circle = chart.groups[start]?.push;
      expect(bar.y1).toBeLessThan((circle?.cy ?? 0) - (circle?.r ?? 0));

      const cells = heatmap.groups[start]?.cells[0] as Rect;
      const above = heatmap.groups[start - 1]?.cells[0] as Rect;
      const row = lines.heatmap[index] as Line;
      expect(isHorizontal(row)).toBe(true);
      expect(row).toMatchObject({ x1: 0, x2: heatmap.width });
      expect(row.y1).toBeGreaterThan(bottom(above));
      expect(row.y1).toBeLessThan(cells.y);
    }
  });

  it("draws none at the ends of a period from a Sunday to a Saturday", () => {
    const { lines } = geometryOf(sundayToSaturday, 340);
    expect(lines.bars).toHaveLength(1);
    expect(lines.heatmap).toHaveLength(1);
  });
});
