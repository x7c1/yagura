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
branch: task/1013-2326-show-times-and-band-days-in-the-list
created_at: 2026-10-13T14:26:53Z
updated_at: 2026-10-13T14:42:41Z
---

# feat(web): show times in the pull request list and band its rows by day

## Overview

The pull request list on the Activity page ends with a column headed
"Opened or merged". Each row shows the day of the pull request's latest
event in the period (`latestEventIn`): when it was merged if it was merged
in the period, otherwise when it was opened. The value is the month and
day only, for example "Oct 13".

Three problems:

- The heading is long for what it says. The State badge already tells
  whether the pull request was merged, so the heading does not need to.
- The time of day is missing. Within one day the rows are ordered newest
  first, but nothing shows when each one happened.
- The list is ordered newest first, so each day's rows are together, but
  nothing marks where one day ends and the next begins. A reader has to
  compare the dates row by row.

This task changes how the list shows dates. The data, the ordering, the
narrowing by the chart and the other columns do not change.

### Heading

- Rename the column to "Date". It keeps meaning the time of the latest
  event in the period, as now.

### Date and time

- Show the month, the day and the time, in the viewer's local time zone,
  in 24-hour form, for example "Oct 13 14:05". Days are already counted in
  local time (`dayKeyOf`), so a row's date and the chart's day agree.
- Keep the value in tabular figures and keep it from wrapping, so the time
  stays on the same line as the date at every width, including 375px
  (where the list scrolls inside its own container, as now).
- Wrap the value in a `<time>` element whose `dateTime` is the ISO
  timestamp, so the exact instant is in the markup.
- Add the formatter to `features/pull-requests/format.ts` next to
  `dayFormat`. `dayFormat` stays as it is for the chart and the period line.

### Bands by day

- Give the rows of alternate days a different background: the rows of the
  newest day in the list on the page background, the rows of the day before
  that on a tinted background, and so on, alternating each time the local
  day changes from one row to the next. All rows of one day share one
  background.
- The tint comes from a token (the existing `--color-surface` or a new
  token defined for both themes) and works in light and in dark. Text on
  the tinted rows, including the muted text, the additions and deletions,
  the badges and the links, keeps WCAG AA contrast.
- The existing row separators stay. Hovering a row, if it is styled today,
  stays visible on both backgrounds.
- The banding is computed from the rows as given (by the local day of
  `latestEventIn`), in a pure function with unit tests, not in CSS
  `nth-child`, because a day can have any number of rows. Expose it to
  assistive technology in no other way than the dates themselves: no
  extra roles or labels.
- The bands follow the dates shown, also when the chart narrows the list.
  Narrowed to the merged pull requests of a day, all rows share the first
  band. Narrowed to the opened ones, a pull request merged on a later day
  shows that later date and sits on that day's band.
- The band background is its own token (`--color-band`), a little lighter
  than the page in dark, and the list's first and last columns keep their
  inner padding, so that the text does not touch a band's edge.

### Documents

- Update `docs/design/activity-view.md` where it describes the list's
  columns, to name the "Date" column, its time, and the day banding.

### Tests

- The formatter renders a given instant as "Oct 13 14:05" in the test's
  time zone (fix the time zone in the test or build the instant from local
  fields so the test does not depend on the machine).
- The banding function: rows of one day share a band; the band alternates
  when the day changes; an empty list and a single day work.
- The list: the column heading is "Date"; a row's date cell contains a
  `<time>` with the ISO `dateTime`; rows of two consecutive days carry
  different band classes (or a data attribute), rows of the same day the
  same.
- Existing tests that query by "Opened or merged" are updated.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the tests listed under "Tests".

### Before merge (verified outside the check command)

- [ ] With `VITE_API_MOCK=1 make dev`, screenshots of the Activity page's
      list at 1280px and at 375px, in light and dark:
  - the heading reads "Date" and each value shows date and time on one
    line;
  - the day bands alternate where the day changes and are visible in both
    themes;
  - nothing on the page scrolls horizontally outside the list's own
    container.

  The screenshots are shown to the user, and the user approves the look
  before merge.

## Out of scope

- Grouping the list under day headings or sticky day rows.
- Changing the ordering or which event's time is shown.
- Showing times in the chart or the period line.
