---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -q 'Sunday' docs/design/activity-view.md"
assignee: null
branch: task/1102-1829-mark-where-each-week-starts
created_at: 2026-11-02T09:29:51Z
updated_at: 2026-11-02T10:22:36Z
---

# feat(web): mark in the chart where each week starts

## Overview

The chart shows 14 days in a row without anything that tells the weeks
apart, so a reader counts days to find where a week began. This task draws
a line between each Saturday and the Sunday after it: a week runs from
Sunday to Saturday.

### Drawing

- Where the days are columns, a vertical line runs in the gap between a
  Saturday's column and the next Sunday's, through the bars' plot, the
  heatmap and the push row, so that it reads as one line through the
  figure even though they are drawn as separate SVGs. It does not cross
  the date labels' band, so it never runs through a date.
- Where the days are rows, the same line runs across, between the
  Saturday's row and the Sunday's, through the bar and the heatmap rows.
- The line is in the style of the bars' grid lines to begin with (colour
  and width), as quiet decoration. Its look is expected to be tuned by eye
  before this merges, so keep its colour and width in one place (a token
  or constants) where they are easy to change.
- No line before the first day or after the last; a period of 14 days has
  one or two lines depending on the weekday.
- Decoration only: hidden from assistive technology, and a click passes
  through it to the bar, cell or count under it. It does not move any bar,
  cell, count or label.
- The weekday follows the local day the chart already uses for each day
  (the day keys of `@yagura/activity`).

### Design doc

Describe the line in `docs/design/activity-view.md`, with the chart's
other rules and lines: a week runs from Sunday to Saturday, and the line
between Saturday and Sunday is drawn in both layouts.

### Tests

- The geometry places a line between each Saturday and Sunday, in both
  layouts, and none at the ends of the period
- A period starting on a Sunday and one ending on a Saturday
- The lines are hidden from assistive technology

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-view.md` describes the week's line, naming
      Sunday as the first day of the week (grep in the check)
- [x] The tests listed above pass (`make check`)

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, a line separates each Saturday from
      the next Sunday through the bars, the heatmap and the push row, in
      both layouts and both themes, without moving anything else
- [x] The line's look is approved by eye, adjusting its colour and width
      as needed — needs a person: whether it reads well is a judgement of
      taste, and the user asked to tune it on the screen before merging
