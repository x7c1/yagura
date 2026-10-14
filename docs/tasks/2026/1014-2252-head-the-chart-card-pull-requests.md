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
branch: task/1014-2252-head-the-chart-card-pull-requests
created_at: 2026-10-14T13:52:49Z
updated_at: 2026-10-14T14:14:32Z
---

# feat(web): drop the headings the pages no longer need, and quiet the footer link and the list's scroll bar

## Overview

The activity page has two cards: the chart, headed "Per day", and the list
of pull requests below it, headed "Pull requests"
(`src/features/pull-requests/DailyActivity.tsx`). "Per day" was named as
the counterpart of "Per member" when the chart and the members' table
shared one page. Since the members' table moved to its own page, "Per day"
has nothing to stand against, and on its own it does not say what is
counted per day.

The page is about pull requests: the chart counts them per day and the
list shows them. So the first card is headed "Pull requests", and the
second card, the list, has no heading of its own; it reads as the detail
of what the chart above counts.

The members page has one card, headed "Per member", the other half of the
same old pair. Its tab already says "Members" and the table is the page's
only content, so the heading says nothing the page does not; it goes too,
leaving the period ("Last 14 days · Oct 1 – Oct 14") and the "Updating…"
note at the card's top.

The footer's "Powered by Yagura" links "Yagura" with an underline, which
draws more attention than a credit line should. The underline shows only
on hover (and with keyboard focus).

Where the platform draws classic scroll bars (Chrome on Linux and
Windows, for example), the pull request list's scroll bar, inside its card
when the page fits the window, is always in view and heavier than the rest
of the card. It becomes thin and shows only while the pointer is over the
list or focus is inside it.

### What it should look like

- **The chart's card** is headed "Pull requests", with the "Updating…"
  note at its right as now.
- **The list's card** has no heading. It starts with the narrowing's line
  ("… · Show all") when the chart narrows the list, otherwise directly
  with the table. Its notes ("Loading pull requests…", a failure, or that
  there is nothing to show) stay as they are.
- **While the page loads** (`src/features/pull-requests/MembersActivity.tsx`,
  the activity page's loading cards), the cards are headed the same way:
  "Pull requests" on the first card and no heading on the second.
- **The members page's card** has no heading. Its top row holds the
  period, in the muted text it has now, and the "Updating…" note, in the
  room kept for it as now so that its coming and going moves nothing.
  Place them so that the row reads naturally without a heading (for
  example the period at the left and the note at the right) and say which.
  The members page's loading state follows the same shape.
- **The footer's "Yagura" link** (`src/App.tsx`, `.footerLink` in
  `src/App.module.css`) has no underline at rest. On hover it is
  underlined (it already takes the link colour on hover; keep that), and
  with keyboard focus it shows the focus ring and the underline.
- **The list's scroll bar** (the list's scrolling area, in
  `PullRequestList.module.css` or wherever its `overflow: auto` lives) is
  `scrollbar-width: thin`. At rest its thumb and track are transparent
  through `scrollbar-color`; on `:hover` and `:focus-within` the thumb
  takes a quiet colour from the tokens in `global.css` (add a token for
  light and dark if none fits) and the track stays transparent. The room
  for the bar is kept either way, so nothing moves when it shows. This
  applies to both the vertical and the horizontal bar of that area, and
  only to that area. Browsers without `scrollbar-color` (Safari) keep
  their own bars; that is fine, as Safari on macOS already shows them
  only while scrolling.
- **Fitting the window** (PR #25) is unchanged: the list's card still takes
  the remaining height and only the list scrolls. Check that the list's
  card, without a heading, does not look cut off or misaligned at its top
  against the chart's card; adjust its top spacing only if it does.

### Constraints

- The table keeps its accessible name "Pull requests" (its `aria-label` in
  `PullRequestList.tsx`), and the chart keeps "Opened and merged pull
  requests per day". The page then has one heading named "Pull requests"
  and one table named "Pull requests"; that is fine, as they are different
  roles.
- The members' table keeps its accessible name "Members".
- Update tests that find the "Per day" or "Per member" heading or the
  list's heading (for example the test that names the period beside the
  members' heading), and
  add a test that the activity page has exactly one level-2 heading,
  "Pull requests", above the chart, and none in the list's card.
- No new runtime dependencies; no inline `style` attributes for what a
  class can do. Comments are full-sentence English prose explaining intent,
  matching the existing files.
- Update `docs/design/activity-view.md` wherever it names the "Per day"
  heading, the "Per member" heading or the list's heading (the period and
  "Updating…" paragraph, and the fitting-the-window paragraph) and where it
  describes the footer, and any CSS comment that mentions these headings.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including tests that:
  - the activity page's first card is headed "Pull requests" and there is
    no "Per day" heading, loaded and while loading;
  - the list's card has no heading, and the table is still found by the
    name "Pull requests";
  - the members page has no heading in its card, shows the period, and
    its table is still found by the name "Members".

### Before merge (verified outside the check command)

- [ ] With `VITE_API_MOCK=1 make dev`, screenshots of the activity page at
      1280×800 and at 375px, in light and dark, with and without a day
      selected, show the chart's card headed "Pull requests", the list's
      card without a heading and starting cleanly at its top, and (at
      1280×800) the list still scrolling inside its card with the footer in
      view. Screenshots of the members page at 1280 and 375 show its card
      without a heading, the period and the room for "Updating…" at its
      top. The footer's "Yagura" has no underline at rest and is
      underlined on hover and with keyboard focus. In Chromium at 1280×800,
      the list's scroll bar is thin and not visible at rest, and visible
      while the pointer is over the list, in light and dark.

## Out of scope

- Merging the two cards into one.
- The tabs' names and the page titles.
- Scroll bars anywhere but the pull request list, and showing the bar
  only while scrolling (which would need a script).
