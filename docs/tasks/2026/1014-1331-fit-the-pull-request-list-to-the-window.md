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
branch: task/1014-1331-fit-the-pull-request-list-to-the-window
created_at: 2026-10-14T04:31:00Z
updated_at: 2026-10-14T05:02:35Z
---

# feat(web): fit the activity page to the window, scrolling the pull request list inside

## Overview

The Activity page (`src/features/pull-requests/DailyActivity.tsx`) shows
the header, the "Per day" card with the chart, the "Pull requests" card
with the list (`PullRequestList.tsx`), and the footer, one under another.
With two weeks of pull requests the list is long, so the whole page
scrolls: the chart and the header leave the view while the viewer reads
the list, and the footer is far below.

This task makes the Activity page fit the window's height when the window
is tall enough: the header, the "Per day" card, the "Pull requests" card
and the footer are always in view, and only the list scrolls, inside its
card.

### What it should look like

- **The frame** takes exactly the viewport's height (use `dvh`, with a
  fallback, so that mobile browser bars do not cut it off): header, then
  the page's cards, then the footer. The "Per day" card keeps its natural
  height. The "Pull requests" card takes the rest of the height, and its
  heading and the "Show all" selection line stay at its top.
- **The list** scrolls vertically inside the card. Its column headings
  (the table's `thead`) stay at the top of the scrolling area while the
  rows scroll under them, on an opaque background so rows do not show
  through. The table keeps its horizontal scroll inside the same
  container when it is wider than the card. Only one scroll container
  for the list, so that a trackpad or wheel scrolls it naturally.
- **When the window is too short** to show a useful list this way, the
  page falls back to today's layout, with the whole page scrolling. Pick
  the threshold so that the list gets room for about five rows at least
  in fitted mode, base it on a `min-height` media query (or an equivalent
  that needs no script), and say what value was chosen and why. A phone
  in portrait at 375×667 will likely fall back; at desktop sizes such as
  1280×800 the fitted layout applies.
- **Choosing a day in the chart** narrows the list as today; the list's
  scroll position returns to the top when the narrowing changes, so that
  the viewer is not left looking at an empty area or the middle of a new
  list.
- **Members page** is unchanged: it keeps the normal page scroll. Only the
  Activity page fits the window. Keep the page frame code simple: for
  example a class or data attribute on the frame chosen by the page, not
  two copies of the frame.
- **Empty and loading states** (no pull requests, the first load, a
  failure) look as they do today and do not leave a large blank card
  stretched to the bottom in a way that looks broken; a card that holds
  only a short note may keep its natural height.

### Constraints

- Keep the sticky column headings accessible: the table stays one table
  with its caption or name, rows and headers as tests use them.
- No new runtime dependencies, no inline `style` attributes for what a
  class can do, no script measuring heights where CSS can do it. Comments
  are full-sentence English prose explaining intent, matching the
  existing files.
- Update `docs/design/activity-view.md` with how the Activity page fits
  the window and when it falls back.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes. Layout is CSS and jsdom cannot measure it, so
      tests only need to cover what is observable there: for example that
      the Activity page marks its frame as fitted and the Members page does
      not, and that changing the day selection resets the list's scroll
      position, if that is done in script.

### Before merge (verified outside the check command)

- [ ] With `VITE_API_MOCK=1 make dev`, screenshots at 1280×800 in light
      and dark show the header, "Per day", "Pull requests" with its column
      headings and the footer all in view, and, after scrolling the list,
      the headings still at its top with rows scrolled under them and the
      footer still in view.
- [ ] A screenshot at 375×667 shows the fallback layout with no horizontal
      page scroll, and one at a short desktop window (for example
      1280×500) shows the fallback too.
- [ ] The Members page at 1280×800 scrolls as before.

## Out of scope

- Fitting the Members page to the window.
