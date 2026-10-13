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
branch: task/1013-1958-split-activity-and-members-pages
created_at: 2026-10-13T10:58:47Z
updated_at: 2026-10-13T11:18:57Z
---

# feat(web): put the chart and the member summary on separate pages

## Overview

One long page shows the per-member summary table, the per-day chart and the
pull request list. The chart and the list answer the question the app is
opened for most often: what happened on which day. The per-member table
answers another question: who has been quiet. Splitting them gives each
question its own page. The page that opens first is the chart page.

### Pages

- **Activity, at `/`:** the per-day chart and the pull request list below
  it. Choosing a bar narrows the list, exactly as now. This is the page
  that opens when yagura is opened.
- **Members, at `/members`:** the per-member summary table with its total
  row.
- **Both pages** keep the organization name (and the selector when there are
  several), the period line, and the "Updating…" note or the failure with
  Retry.
- **An unknown path**, other than `/callback`, which keeps working as now,
  shows the Activity page and replaces the address with `/` without adding
  a history entry.

### Navigation

- While signed in, the header shows two tabs next to "yagura": "Activity"
  and "Members". They are links (`<a href="/">`, `<a href="/members">`), so
  that opening one in a new tab, copying it or bookmarking it works. A
  plain click switches the page in place with `history.pushState`, without
  a reload. The current tab has `aria-current="page"` and a visible
  selected style that uses the existing tokens.
- The browser's back and forward buttons switch between the pages
  (`popstate`).
- While signed out, no tabs are shown. A direct load of `/members` while
  signed out shows the signed-out page as `/` does, and after sign-in the
  callback returns to `/` as now.
- At 375px the header still fits without horizontal scroll. The tabs may
  sit on their own row below the title if needed.

### Data

- Switching pages must not fetch again or reset what is shown. Keep the
  members' activity loading above the page switch: one load serves both
  pages, so going to Members and back shows the same data at once, with no
  new requests within the short life.
- The chart's selected bar may reset when leaving the Activity page. Keeping
  it is not required.

### Where things go

- `packages/gateway/browser`: give `PageLocation` what navigation needs:
  - a `push(url)` that adds a history entry without loading;
  - a way to subscribe to `popstate`, returning an unsubscribe.

  Implement both in `WindowLocation` and `MemoryLocation`. `MemoryLocation`
  keeps a history stack, so tests can go back and forward.
- `packages/apps/web`: a small page model (which page a pathname is, and
  the paths) and the tabs component. Restructure the members' activity view
  so that the data load sits above the two page bodies. No router library.
- Leftover to fix in the same change: the two table CSS Modules use
  cross-file `composes`, which makes Vite print "A PostCSS plugin did not
  pass the `from` option". Replace `composes` with applying both class names
  in the JSX (the shared table class plus the module's own), and confirm the
  warning is gone from `make check`'s output.
- Update `docs/design/activity-view.md` where it describes the layout of the
  view, to describe the two pages and the tabs.

### Tests

Through the API mock and `MemoryLocation`:

- Opening `/` shows the chart and the list and no summary table; opening
  `/members` shows the summary table and no chart.
- Clicking the Members tab pushes `/members` and shows the table. Going back
  shows the chart again. No GraphQL or members request is made by switching.
- The current tab has `aria-current="page"`.
- An unknown path shows Activity and replaces the address with `/`.
- Signed out, no tabs are shown, on `/` or `/members`.
- `/callback` still completes sign-in and lands on `/`.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the tests listed under "Tests".

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, at desktop width and 375px:
  - the first page after sign-in is Activity, and the tabs switch pages
    without a reload;
  - back and forward work;
  - a reload on `/members` opens the Members page;
  - nothing scrolls horizontally.

  Screenshots of both pages are attached to the PR.
- [x] `make check`'s output no longer contains "did not pass the `from`
      option".

## Out of scope

- Showing the per-day counts on the chart, and rebuilding the chart to fill
  the width (the next task).
- A per-member view of the chart.
