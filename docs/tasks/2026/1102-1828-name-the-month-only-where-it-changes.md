---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -qF 'Oct 30, 31, Nov 1, 2' docs/design/activity-view.md"
assignee: null
branch: task/1102-1828-name-the-month-only-where-it-changes
created_at: 2026-11-02T09:28:51Z
updated_at: 2026-11-02T10:08:49Z
---

# feat(web): write the month in the chart's dates only where it changes

## Overview

The chart labels every day with its month and day ("Oct 20", "Oct 21",
"Oct 22", …), using `formatDay` in
`packages/apps/web/src/features/pull-requests/format.ts`. The month repeats
on almost every label and crowds the dates. This task writes the month only
where it is new, as a calendar does: "Oct 30, 31, Nov 1, 2".

### The rule

- Of the labels drawn, the first one, and each one whose month differs from
  the previous label drawn, are written with the month ("Oct 20",
  "Nov 2"); every other one is the day alone ("21").
- "Drawn" matters: where the labels do not all fit, only every other day
  (or fewer) is labelled, counting back from today (`labelEvery` in
  `chart-geometry.ts`). If the 1st of a month has no label, the first
  label drawn in that month carries the month instead.
- The rule applies to every visible date label of the chart: the dates
  under the columns (drawn with the heatmap, `HourlyHeatmap.tsx`) and the
  dates of the rows where the days are rows (`DailyChart.tsx` and
  `HourlyHeatmap.tsx`).
- Accessible names, titles and other text read on their own keep the full
  date, as each is read without its neighbours: the bars ("Oct 21, merged:
  3"), the push counts, the heatmap's cells, the narrowing's description
  and the period ("Last 14 days · Oct 20 – Nov 2") do not change.
- The spacing of the labels does not change: `dayLabelWidth` still makes
  room for a label with its month, since any label may carry one.

### Design doc

State the rule in `docs/design/activity-view.md`, where the chart's dates
are described, with the example "Oct 30, 31, Nov 1, 2", and that the
accessible names keep the full date.

### Tests

- Labels within one month: only the first carries the month
- Labels crossing into a new month: the first label of the new month
  carries it, both when the 1st is labelled and when it is skipped by
  `labelEvery`
- Both layouts (columns and rows) follow the rule
- The bars' and cells' accessible names keep the full date

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-view.md` states the rule with the example
      "Oct 30, 31, Nov 1, 2" (grep in the check)
- [x] The tests listed above pass (`make check`)

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, in both the column and the row
      layout, the dates show the month only on the first label and where
      it changes, and no label overlaps another
