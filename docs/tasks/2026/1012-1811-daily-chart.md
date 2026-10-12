---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -rq 'countByDay' packages/domain/activity/src/ && grep -rq 'countByDay' packages/apps/web/src/"
assignee: null
branch: task/1012-1811-daily-chart
created_at: 2026-10-12T09:11:20Z
updated_at: 2026-10-12T09:22:08Z
---

# feat(web): chart the opened and merged pull requests per day and narrow the list by day

## Overview

`docs/design/activity-view.md` ("The screen") calls for a chart of the
opened and merged counts per day, and says that choosing a day's "opened" or
"merged" in the chart narrows the list to that day's pull requests of that
kind. The page now shows the period, the member summary table, and the list
(`packages/apps/web/src/features/pull-requests/MembersActivity.tsx`), all
from one cached fetch. This task adds the chart between the table and the
list, and the narrowing.

### 1. `@yagura/activity`: `countByDay`

A pure function taking the pull requests and the period, returning one entry
per day of the period, oldest first, each with its day key (as `dayKeyOf`
in `days.ts` produces), the number of pull requests opened that day
(`createdAt` on that day and `wasOpened`) and the number merged that day
(`mergedAt` on that day and `wasMerged`). Every day of the period is present,
including days with nothing. Days follow the local time zone, like the rest
of the package. Also a function that, given a day key and a measure
(`opened` / `merged`), selects the matching pull requests from a list, so
the chart and the narrowing use one definition. Test both, including a pull
request opened on one day and merged on another (it counts on each day for
its own measure), and a day with nothing.

### 2. The chart in `packages/apps/web`

A small bar chart drawn with inline SVG, no chart library: one group per
day, two bars per group (opened and merged), a shared y axis starting at
zero, the day labels under the groups (short, such as "Oct 3"; label every
day if it fits, otherwise every other day), and a legend for the two kinds.
The two kinds are told apart by more than colour (for example a solid and a
hatched or outlined bar, or labels), and the colours come from CSS custom
properties so a later theme can change them.

Each bar is a control: a `<button>` (or an SVG element with `role="button"`,
`tabIndex=0` and Enter/Space handling) whose accessible name says the day,
the kind and the count, for example "Oct 3: 4 merged". Choosing a bar
narrows the list below to that day's pull requests of that kind, marks the
chosen bar as pressed (`aria-pressed`), and shows above the list what it is
narrowed to with a way to clear it ("Merged on Oct 3 · Show all"). Choosing
the same bar again, or "Show all", clears it. Bars with a count of zero are
not selectable. The narrowing does not change the summary table: the table
always covers the whole period.

The chart and the narrowing live with the other activity components in
`features/pull-requests/`; keep the SVG geometry (scales, bar positions) in
a small framework-free helper with its own tests, so the component stays
readable.

Tests through the API mock: the chart shows one group per day of the period
with counts matching `countByDay` over the fixtures (compute the expected
counts in the test from the fixtures); choosing a bar narrows the list to
the pull requests the domain selector picks, and choosing it again or "Show
all" restores the full list; a zero bar cannot be chosen.

### 3. Docs

In "The screen" of `docs/design/activity-view.md`, state that every day of
the period has a group even when empty, that the narrowing applies only to
the list (not the summary table), and how it is cleared.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the `countByDay` and selector tests,
      the geometry helper's tests, and the web tests listed above.
- [x] `countByDay` exists in the domain package and the web app uses it
      (`grep` gates in `check_command`).

### Before merge (verified outside the check command)

- [ ] `VITE_API_MOCK=1 make dev`: the chart shows 14 day groups with the
      mock counts; clicking a bar narrows the list and "Show all" restores
      it; the bars can be reached and chosen with the keyboard.
- [ ] Against the dev session API through the proxy, the chart's counts for
      a few days match the list narrowed to those days.

## Out of scope

- Per-member charts, line counts in the chart, and choosing a range of days.
- Dark mode and theming beyond exposing the colours as custom properties.
