---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check"
assignee: null
branch: task/1013-2024-show-the-daily-counts-on-the-chart
created_at: 2026-10-13T11:24:09Z
updated_at: 2026-10-13T11:49:59Z
---

# feat(web): show each day's opened and merged counts on a chart that fills the page

## Overview

The per-day chart on the Activity page draws an opened bar and a merged bar
for each of the 14 days. It does not show the numbers. Reading a count means
estimating a bar's height against the y axis, which is hard beyond 2 or 3.

The chart also has a fixed size. Its SVG `viewBox` is 640 wide, and the SVG
is scaled down to fit. On a desktop it uses about half of the content width.
At 375px the whole SVG shrinks to about 0.54 of its size, so the day labels
come out near 6px and cannot be read.

This task does two things:

- it writes each day's opened and merged counts next to their bars;
- it rebuilds the chart so that it fills the content width at its natural
  size: text stays at the design's type sizes at every width, and nothing is
  scaled.

The data, the selection behaviour and what the list shows do not change.

### Counts

- Each bar gets its count written next to it: above the bar in the vertical
  layout, at the end of the bar in the horizontal layout (see below). The
  count uses the measure's colour token, or the text colour if that reads
  better, in tabular figures, at a small but legible size (no smaller than
  the existing small type token).
- A zero count is shown too, in the muted text colour, so that a quiet day
  reads as "0", not as missing.
- The counts are part of each bar's accessible name. Today a bar is a
  button for its day and kind, so the name says, for example,
  "Oct 13, opened: 7". Screen readers then get the same numbers.

### Layout that fills the width

- Draw at the real width of the chart's container: measure it, for example
  with a `ResizeObserver` reached through the browser gateway (the app must
  not read `window` directly), and compute the geometry in CSS pixels. Or
  build the chart from HTML and CSS (grid or flex) instead of SVG, if that
  is simpler. Either way, font sizes come from the tokens and are never
  scaled.
- **Wide (vertical columns):** when each day has room for its two bars and
  their counts side by side, keep today's form, with one column per day,
  the two bars next to each other, the counts above them and the date
  below. Show every day's date if it fits, otherwise every other one.
- **Narrow (horizontal rows):** when the columns would be too narrow for
  two counts (as at 375px), switch to one row per day. Each row has the
  date on the left, then the opened bar with its count and the merged bar
  with its count, stacked or side by side, bars growing to the right.
  Newest last, matching the vertical order. Choose the switch point by the
  width the counts actually need, not by a device width.
- Keep the y axis (or, in rows, a shared scale) consistent within a layout,
  so that bar lengths compare across days.
- Keep the legend (Opened solid, Merged hatched).

### Behaviour kept as is

- Choosing a bar narrows the list to that day and kind; choosing it again
  clears it; "Show all" clears it.
- The keyboard behaviour stays as it is today: the bars that can be chosen
  are reachable and operable with the keyboard, the focused bar shows the
  focus ring, and the chosen bar is marked. The other bars dim to the
  opacity decided in the previous change (0.75).
- Bars for a zero count stay not choosable, as today, if that is the
  current behaviour. Check the code and keep it.
- Light and dark themes keep working through the tokens.

### Where things go

- `chart-geometry.ts` keeps its pure, tested geometry. It now takes the
  available width (and the layout) as input instead of a fixed size. Unit
  tests cover:
  - the switch point;
  - the label thinning;
  - the bar lengths at a given width.
- `DailyChart.tsx` and its CSS Module draw it.
- A resize source in `packages/gateway/browser` if one is needed, with a
  memory or fake version for tests.
- Update `docs/design/activity-view.md` where it describes the chart.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the geometry tests above and the
      existing chart tests (selection, keyboard, accessible names updated
      to include the counts).

### Before merge (verified outside the check command)

- [ ] With `VITE_API_MOCK=1 make dev`, screenshots of the Activity page at
      1280px, 768px and 375px, in light and dark:
  - every bar's count is readable;
  - the date labels are at the design's type size, not scaled down;
  - the chart fills the content width;
  - nothing scrolls horizontally.

  The screenshots are shown to the user, and the user approves the look
  before merge.
- [ ] Choosing a bar with the mouse and with the keyboard narrows the list,
      in both layouts.

## Out of scope

- A per-member chart.
- Changing the period or what counts as opened or merged.
