import { startOfDay } from "@yagura/activity";
import type { ChartGeometry, Counts, Line, Rect } from "./chart-geometry";
import type { HeatmapGeometry } from "./heatmap-geometry";

/*
 * The lines that tell the weeks of the chart apart. A week runs from Sunday
 * to Saturday, so a line is drawn between each Saturday and the Sunday
 * after it, through the bars, the hours' heatmap and the push row, which
 * are drawn as separate SVGs and each get their own part of the line.
 */

/** The counts of a day, with the day they are of, as a day key. */
type DayOf = Counts & { readonly day: string };

/** Sunday, as `Date.getDay` counts the weekdays. */
const sunday = 0;

/**
 * The indices of the days of `days` (day keys, oldest first, one after
 * another) that start a week after another day of them: each Sunday but a
 * first one, since nothing comes before it.
 */
export function weekStarts(days: readonly string[]): number[] {
  return days.flatMap((day, index) =>
    index > 0 && startOfDay(day).getDay() === sunday ? [index] : [],
  );
}

/**
 * The parts of the week lines, each in the coordinates of the SVG it is
 * drawn in: the bars' chart, the hours' heatmap, and the push row drawn
 * under the heatmap where the days are columns (none where they are rows,
 * as the push circles are then in the bars' chart).
 */
export interface WeekLines {
  readonly bars: readonly Line[];
  readonly heatmap: readonly Line[];
  readonly pushRow: readonly Line[];
}

const right = ({ x, width }: Rect) => x + width;
const bottom = ({ y, height }: Rect) => y + height;

/**
 * Where the week lines go in the chart laid out as `chart`, with the hours'
 * heatmap laid out as `heatmap` under it. Where the days are columns, each
 * line runs down the middle of the space between a Saturday's column and
 * the Sunday's: through the bars' plot, and, under the dates, which it
 * leaves clear, through the heatmap's cells and on down to the foot of the
 * push circles. Where the days are rows, it runs across the whole width in
 * the space between the Saturday's row and the Sunday's, both in the bars'
 * chart and in the heatmap.
 */
export function weekLines<T extends DayOf>(
  chart: ChartGeometry<T>,
  heatmap: HeatmapGeometry<T>,
): WeekLines {
  // Each Sunday's group and the Saturday's before it, in the chart and in
  // the heatmap, where only their first hour's cells are needed.
  const pairs = weekStarts(chart.groups.map((group) => group.day.day)).flatMap(
    (index) => {
      const before = chart.groups[index - 1];
      const after = chart.groups[index];
      const cellBefore = heatmap.groups[index - 1]?.cells[0];
      const cellAfter = heatmap.groups[index]?.cells[0];
      return before && after && cellBefore && cellAfter
        ? [{ before, after, cellBefore, cellAfter }]
        : [];
    },
  );
  // Where the days are columns, the middle of the space between them.
  const between = ({ before, after }: (typeof pairs)[number]) =>
    (right(before.bar.rect) + after.bar.rect.x) / 2;

  if (chart.layout === "columns") {
    const { plot } = chart;
    return {
      bars: pairs.map((pair) => {
        const x = between(pair);
        return { x1: x, x2: x, y1: plot.y, y2: bottom(plot) };
      }),
      // From the first hour's cells down to the heatmap's foot, to meet the
      // part in the push row.
      heatmap: pairs.map((pair) => {
        const x = between(pair);
        return { x1: x, x2: x, y1: pair.cellAfter.y, y2: heatmap.height };
      }),
      pushRow: pairs.map((pair) => {
        const x = between(pair);
        const { cy, r } = pair.after.push;
        return { x1: x, x2: x, y1: 0, y2: cy + r };
      }),
    };
  }
  return {
    bars: pairs.map(({ before, after }) => {
      const y = (bottom(before.bar.rect) + after.bar.rect.y) / 2;
      return { x1: 0, x2: chart.width, y1: y, y2: y };
    }),
    heatmap: pairs.map(({ cellBefore, cellAfter }) => {
      const y = (bottom(cellBefore) + cellAfter.y) / 2;
      return { x1: 0, x2: heatmap.width, y1: y, y2: y };
    }),
    pushRow: [],
  };
}
