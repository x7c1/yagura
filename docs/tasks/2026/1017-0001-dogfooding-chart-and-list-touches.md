---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check"
assignee: null
branch: task/1017-0001-dogfooding-chart-and-list-touches
created_at: 2026-10-16T15:01:29Z
updated_at: 2026-10-16T15:34:00Z
---

# feat(web): rule the heatmap's hours, key it at the right and move the PR number to the repository column

## Overview

Three touches to the Activity page, from using it day to day. All three are in
`packages/apps/web/src/features/pull-requests/`.

### 1. Lines behind the heatmap at the labelled hours

The bar chart of merged PRs draws a line at each step of its axis
(`DailyChart.tsx`, `ticks.map`, styled `.gridLine` / `.baseline` in
`DailyChart.module.css`). The heatmap of hours under it (`HourlyHeatmap.tsx`,
laid out by `heatmap-geometry.ts`) has none, so its rows are hard to read
against the hour labels. Draw a line for each labelled hour, 0, 6, 12 and 18
(`labelledHours`), behind the cells, in the bar chart's grid-line style:

- **Columns layout** (hours run down): a horizontal line across the plot's
  width, at the vertical centre of the labelled hour's row, which is where its
  label sits. The line spans the same x range as the bar chart's grid lines
  (`chart.plot.x` to the plot's right edge), so that the two read as one
  ruled figure.
- **Rows layout** (hours run across): a vertical line at the horizontal centre
  of the labelled hour's column, from the top of the first day's row to the
  bottom of the last.

The lines are decoration: `aria-hidden`, not focusable, and they take no
clicks (a click between cells must behave as it does now). Put their
positions in the geometry (`HeatmapGeometry`), alongside `hourLabels`, so that
they are unit-tested there like the rest of the layout.

### 2. The heatmap's key at the right

The key under the chart, "Per hour: 1 ■■■■ N" (`HeatScale` in
`HourlyHeatmap.tsx`, `.legend` in `DailyChart.module.css`), sits at the left
of the card. Put it at the right edge instead, in both layouts. Its content
and order stay as they are.

### 3. The PR number in the Repository column

The list's Title cell starts with the number, "#304", in a muted colour
(`PullRequestNumber` in `PullRequestList.tsx`, `.table .title .number` in
`PullRequestList.module.css`, added in #28). Take it out of the Title cell and
write it in the Repository cell instead, on a second line under the
repository's name:

```
x7c1/coffret
#304
```

The number stays plain text read from the URL, as now (`pullRequestNumber`),
and is omitted when the URL has none. The Title cell then holds only the
title's link. The number keeps its tabular figures. Fetching and caching do
not change.

Update `docs/design/activity-view.md` where it describes these parts (the
title's number, the heatmap, the key), so that the spec says what the page
does.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `heatmapGeometry` returns a line for each of the hours 0, 6, 12 and 18
      in both layouts, horizontal across the plot under the columns and
      vertical across the days beside the rows, each through the centre of
      its hour's cells; a unit test asserts the positions for each layout
- [x] The heatmap renders those lines before its cells and hidden from
      assistive technology; a component test asserts there are four, inside
      an `aria-hidden` group
- [x] In the PR list, a test asserts that the Title cell holds only the
      title's link (no "#304"), and that the Repository cell holds the
      repository's name and, after it, "#304"; and that a URL with no number
      leaves the Repository cell with the name alone

### Before merge (verified outside the check command)

- [x] In the app with `VITE_API_MOCK=1`, at a desktop width (columns
      layout) and at 375px (rows layout): the lines show behind the heatmap
      at 0/6/12/18 and line up with their labels; the key sits at the card's
      right edge; the Repository cell shows the name and the number on two
      lines; clicking a heatmap cell and a bar still narrows the list.
      Seen in light and dark themes. Exception: in the rows layout the lines
      are drawn where their labels are, but show only in the 4px gaps between
      the days' rows, so they are hard to make out
