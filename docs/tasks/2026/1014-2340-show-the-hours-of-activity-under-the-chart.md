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
branch: task/1014-2340-show-the-hours-of-activity-under-the-chart
created_at: 2026-10-14T14:40:18Z
updated_at: 2026-10-14T15:33:47Z
---

# feat(web): chart merged pull requests only, with the hours of the day they were merged under the bars

## Overview

The activity page's chart (`src/features/pull-requests/DailyChart.tsx`)
answers how many pull requests were opened and merged on each day. It does
not answer when in the day: whether work went on from morning to evening,
or bunched into a few hours. The viewer wants to see that on the same page,
at a glance, together with the chart and the list.

This task adds a heatmap of the hours under the bars, in the same card,
sharing the bars' day columns. The page then has three areas: the bars,
the heatmap, and the pull request list.

**Merged only.** What the viewer wants to know is how often changes landed,
which is what merges are. So the chart, both the bars and the heatmap,
counts merged pull requests only: one bar per day and one heatmap column
per day. Opened is no longer drawn or chosen in the chart. The list still
shows every pull request with activity in the period, as now, and the
members page still counts opened and merged.
The chart draws merged in the blue it used for opened, solid bars without
the hatching that only told the two apart, and the heatmap's steps in that
blue.

**The list's "open" badge turns green.** With the chart in blue, the
list's blue "open" badge would read as the chart's colour. The badge takes
green, as GitHub draws an open pull request, so that blue belongs to the
chart alone and "merged" stays purple. The chart's blue no longer depends
on the badge's token.

### What it should look like

- **One card, two parts.** The card headed "Pull requests" holds the bars
  and, directly under them, the heatmap. The heatmap's day columns line up
  with the bars' days. The legend (Opened, Merged) stays under both and
  covers both.
- **The heatmap's cells.** Each day has two narrow columns, Opened and
  Merged. Each sits directly under that day's Opened bar or Merged bar, so
  that position as well as colour tells them apart. There are 24 rows, one
  per hour from 0 to 23. Only 0, 6, 12 and 18 are labelled. A cell counts
  the pull requests opened (or merged) on that day within that hour. Hours
  are the browser's local hours, as days already are.
- **The colour scale.** An empty cell is drawn plainly, distinguishable
  from the card's background but quiet, for example with the subtle border
  colour. Non-empty cells take the Opened colour or the Merged colour in a
  few steps of strength, about four, scaled to the busiest cell in the
  period. Add tokens to `global.css` if the steps need them, for light and
  dark. Every step meets the non-text contrast the other chart marks meet,
  against the card in both themes. Add a small scale key next to the
  legend if the steps are not self-evident.
- **The chart's heading and legend.** With one measure, the legend's
  "Merged" item only repeated what the colour already says. Drop it, and
  head the card "Merged PRs" instead of "Pull requests", so that the
  heading says what is counted. Keep the heatmap's scale key of the blue
  steps (it says that strength is the count), without the "Merged" item
  next to it. The chart's and the heatmap's accessible names keep the
  full words ("Merged pull requests per day", …).
- **The dates between the bars and the heatmap.** In the column layout the
  day labels ("Oct 2", "Oct 3", …) head both the bars above and the
  heatmap below, so they sit centred between them: the space from the
  bars' axis line to the labels equals the space from the labels to the
  heatmap's first row, about 6–8px each. Today it is 4px above and 13px
  below, an accident of the bars' axis gap, the heatmap's top margin and
  the heatmap's own top padding adding up. Make the spacing deliberate and
  explain it in a comment.
- **The bars get shorter** to make room, to about two thirds of their
  height now. The counts above them stay.
- **Choosing a cell** narrows the list, as choosing a bar does: to the pull
  requests opened (or merged) on that day within that hour. The narrowing
  line reads, for example, "Merged on Oct 13, 14:00–15:00 · Show all".
  Choosing a bar or a cell replaces any earlier choice. "Show all" clears
  it. The chosen cell is marked the way a chosen bar is (not by colour
  alone). Empty cells cannot be chosen.
- **Keyboard and screen readers.** The heatmap must not add hundreds of tab
  stops. Use one tab stop for the heatmap and move between cells with the
  arrow keys (roving tabindex), with Enter or Space to choose. Each cell
  has an accessible name such as "Oct 13, 14:00 to 15:00: 2 merged". The
  heatmap as a whole has an accessible name, such as "Opened and merged
  pull requests per hour of each day".
- **Narrow widths.** Where the bars turn into one horizontal row per day
  (below 50rem today), the heatmap turns too: one row per day, with
  Opened and Merged as two thin rows, and 24 hour columns across. It sits
  under the bars in the same card. At 375px nothing scrolls sideways.
- **Fitting the window.** The activity page still fits the window when the
  window is tall and wide enough. The header, the chart card with the
  heatmap, the list's card and the footer are all in view, and only the
  list scrolls. Raise the height in the media query in `App.module.css`
  (48rem now) so that the list still shows about five rows at the
  smallest height that fits. Measure it and state the value you chose and
  why. Below it, the page scrolls as a whole, as now.
- **Mock data.** With `VITE_API_MOCK=1`, the heatmap must be worth looking
  at. The fixtures in `packages/testing/api-mocks/src/pull-requests.ts`
  are now bunched at a few times of day. Spread the opened and merged
  times across the day, morning to night, on several days, with a few
  hours busier than others. Keep the tests that rely on the fixtures
  meaningful. Adjust their expectations where the fixtures change, and
  do not weaken what they check.

### Constraints

- Count from the pull requests already loaded. No new requests, no change
  to what is fetched or cached.
- Keep the counting in the domain layer (`@yagura/activity`) if the
  per-day counting lives there, next to it and tested there. Keep the
  drawing in the web app. Follow the dependency-cruiser layer rules.
- Inline SVG or HTML with CSS Modules, as the chart is drawn now. No
  charting library, no new runtime dependencies, and no inline `style`
  attributes for what a class can do. Values that vary per cell, such as
  positions in an SVG, may be attributes.
- Comments are full-sentence English prose explaining intent, matching the
  existing files.
- Update `docs/design/activity-view.md` for the heatmap, the selection by
  cell, the narrow layout and the new fitting height.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including tests that:
  - count the pull requests per day and hour, opened and merged apart,
    across a day boundary, in the local time zone;
  - the activity page shows the heatmap under the bars, named as above,
    with a cell's accessible name giving the day, the hour, the count and
    the measure;
  - choosing a cell narrows the list to that day, hour and measure, and
    describes it ("Merged on …, 14:00–15:00"); "Show all" clears it;
    choosing a bar after a cell replaces the choice;
  - the heatmap is one tab stop, and the arrow keys move between cells;
  - empty cells cannot be chosen.

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, screenshots of the activity page at
      1440×900, at the smallest height that still fits, and at 375px, in
      light and dark, show the bars and the heatmap lined up by day, the
      list in view and scrolling inside its card when the page fits, and
      a chosen cell with the narrowed list.
- [x] The repository owner looks at it on the local mock dev server and
      approves the look before merge.

## Out of scope

- A heatmap per member, or on the members page.
- Weekday patterns (a punch card by weekday).
- Changing the period or the time zone.
