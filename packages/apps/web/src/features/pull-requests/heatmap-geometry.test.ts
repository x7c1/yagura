import { describe, expect, it } from "vitest";
import {
  capitals,
  chartGeometry,
  dayLabelSpace,
  type Rect,
  type TextSpot,
} from "./chart-geometry";
import {
  heatmapGeometry,
  heatStep,
  heatSteps,
  labelledHours,
} from "./heatmap-geometry";

const fortnight = Array.from({ length: 14 }, (_, index) => ({
  merged: index % 3,
}));

const bottom = ({ y, height }: Rect) => y + height;
const right = ({ x, width }: Rect) => x + width;

describe("heatStep", () => {
  it("leaves an empty hour at 0", () => {
    expect(heatStep(0, 5)).toBe(0);
    expect(heatStep(0, 0)).toBe(0);
  });

  it("gives the busiest hour the strongest step and shares out the rest", () => {
    expect(heatStep(8, 8)).toBe(heatSteps);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map((count) => heatStep(count, 8))).toEqual(
      [1, 1, 2, 2, 3, 3, 4, 4],
    );
  });

  it("gives any hour with something at least the weakest step", () => {
    expect(heatStep(1, 100)).toBe(1);
    expect(heatStep(1, 1)).toBe(heatSteps);
  });
});

describe("heatmapGeometry under the columns", () => {
  const chart = chartGeometry(fortnight, 1000);
  const heatmap = heatmapGeometry(chart);

  it("puts each day's cells under its bar, as wide as it, a row per hour", () => {
    expect(heatmap.layout).toBe("columns");
    expect(heatmap.groups).toHaveLength(14);
    for (const [index, { cells }] of heatmap.groups.entries()) {
      const bar = chart.groups[index]?.bar.rect as Rect;
      expect(cells).toHaveLength(24);
      for (const cell of cells) {
        expect(cell.x).toBe(bar.x);
        expect(cell.width).toBe(bar.width);
      }
      // Hour after hour, top to bottom, without overlapping.
      for (const [hour, cell] of cells.slice(1).entries()) {
        expect(cell.y).toBeGreaterThan(bottom(cells[hour] as Rect));
      }
    }
  });

  it("labels 0, 6, 12 and 18 left of the plot, at their rows, within the height", () => {
    expect(heatmap.hourLabels.map(({ hour }) => hour)).toEqual(labelledHours);
    const cells = heatmap.groups[0]?.cells ?? [];
    for (const { hour, spot } of heatmap.hourLabels) {
      const cell = cells[hour] as Rect;
      expect(spot.x).toBeLessThan(chart.plot.x);
      expect(spot.anchor).toBe("end");
      expect(spot.y).toBeCloseTo(cell.y + cell.height / 2);
    }
    expect(bottom(cells[23] as Rect)).toBeLessThanOrEqual(heatmap.height);
  });

  it("centres the bars' day labels between the axis and the first row of cells", () => {
    const label = chart.groups.at(-1)?.label as TextSpot;
    const capitalsTop = label.y - capitals.rise - capitals.height / 2;
    const capitalsFoot = capitalsTop + capitals.height;
    // The heatmap is drawn right under the chart.
    const firstRow = chart.height + (heatmap.groups[0]?.cells[0] as Rect).y;
    const above = capitalsTop - bottom(chart.plot);
    expect(above).toBe(dayLabelSpace);
    expect(firstRow - capitalsFoot).toBe(above);
  });
});

describe("heatmapGeometry beside the rows", () => {
  const width = 340;
  const chart = chartGeometry(fortnight, width);
  const heatmap = heatmapGeometry(chart);

  it("gives each day a labelled thin row, and an hour per column within the width", () => {
    expect(heatmap.layout).toBe("rows");
    expect(heatmap.groups).toHaveLength(14);
    for (const [index, { cells, label }] of heatmap.groups.entries()) {
      const next = heatmap.groups[index + 1];
      if (next !== undefined) {
        expect(bottom(cells[0] as Rect)).toBeLessThan(next.cells[0]?.y ?? -1);
      }
      expect(label?.x).toBeLessThan(cells[0]?.x ?? -1);
      for (const [hour, cell] of cells.slice(1).entries()) {
        expect(cell.x).toBeGreaterThan(right(cells[hour] as Rect));
      }
      expect(right(cells[23] as Rect)).toBeLessThanOrEqual(width);
    }
    const last = heatmap.groups[13]?.cells[0] as Rect;
    expect(bottom(last)).toBeLessThanOrEqual(heatmap.height);
  });

  it("labels the hours above the rows, at their columns", () => {
    const cells = heatmap.groups[0]?.cells ?? [];
    for (const { hour, spot } of heatmap.hourLabels) {
      const cell = cells[hour] as Rect;
      expect(spot.x).toBeCloseTo(cell.x + cell.width / 2);
      expect(spot.y).toBeLessThan(cell.y);
    }
  });
});
