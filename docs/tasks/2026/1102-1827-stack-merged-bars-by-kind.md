---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -q 'Conventional Commits' docs/design/activity-view.md && ! grep -q 'Each bar is solid' docs/design/activity-view.md && grep -rq --exclude-dir=node_modules --exclude-dir=dist 'Kinds of merged pull requests' packages/apps/web/src/"
assignee: null
branch: task/1102-1827-stack-merged-bars-by-kind
created_at: 2026-11-02T09:27:51Z
updated_at: 2026-11-02T09:56:58Z
---

# feat(web): split each merged bar by the kind of pull request

## Overview

The "Merged PRs" chart draws each day's bar in one solid blue
(`packages/apps/web/src/features/pull-requests/DailyChart.tsx`, described
under "Each bar is solid" in `docs/design/activity-view.md`). It tells how
many pull requests landed, but not what kind of change they were. This task
stacks each bar by the kind of its pull requests, so that a day of fixes
reads differently from a day of features.

### The kind of a pull request

- The kind is the type of the pull request's title in the
  [Conventional Commits](https://www.conventionalcommits.org/) form: the
  word before an optional `(scope)`, an optional `!` and the `:` at the
  start of the title (`feat(web): …` → `feat`, `fix!: …` → `fix`). Compare
  it in lower case. A title without that form has no kind.
- Work it out in `packages/domain/activity` from `PullRequest.title`, which
  the view already has; the API and the server do not change.

### Four groups, chosen over the period

- The bars use four groups: `feat`, `fix`, a third kind, and `other`.
- The third kind is chosen once for the whole period shown (not per day):
  the kind, other than `feat` and `fix`, with the most merges in the
  period; a tie goes to the name that sorts first. A pull request without a
  kind is never a candidate. If no such kind has a merge in the period,
  there is no third group.
- `other` takes every merge not in the first three groups, those without a
  kind included.
- As merges arrive while the page is open, the third kind may change (from
  `docs` to `ci`, say); the bars and the legend follow it on the next
  count, as everything else in the chart does.

### Drawing

- Each day's bar is a stack of its groups' segments, its total height (or
  length, where the days are rows) the day's merged count as now, so the
  axis, the count past its end and the layouts do not change.
- Order from the end of the bar toward the axis: `feat`, `fix`, the third
  kind, `other`. Where the days are columns, `feat` is on top and `other`
  sits on the axis; where they are rows, `feat` is at the right end and
  `other` at the axis. A group with no merges that day takes no space.
- Each group has a colour of its own, the same in every bar, and the third
  group's colour does not depend on which kind it is. Add the four colours
  as tokens in `packages/apps/web/src/global.css`, with light and dark
  values that each have 3:1 contrast against the card, that are told apart
  by people with the common colour vision deficiencies, and that stay apart
  from the list's state badge colours. `other` takes the quietest of the
  four.
- The counts written past the bars' ends and the push counts under the
  heatmap are written in the text colour (`--color-text`), not the chart's
  blue: `feat` takes a blue, and a day's total written in that blue right
  above its `feat` segment reads as a count of features. Update the design
  doc's sentences that say these counts are written in the chart's blue.
- A thin gap in the card's colour between segments keeps adjacent segments
  apart without relying on hue alone.
- The bar stays one button, as now: a segment is not chosen on its own, and
  choosing it still narrows the list to that day's merges. The pressed and
  dimmed styles apply to the whole stack.
- The bar's accessible name and title add the breakdown, groups with
  nothing left out, in the drawing order: "Oct 13, merged: 7 (feat 3, fix
  2, docs 1, other 1)". A day with none stays "Oct 12, merged: 0".

### Legend

- A legend shows each group with its colour and name, in the drawing
  order, only the groups that have a merge in the period. It sits in the
  chart's card above the bars and is named "Kinds of merged pull requests"
  for assistive technology. With no merges in the period, no legend is
  drawn.
- The legend wraps on a narrow screen rather than widening the page.

### Mock data

The API mock (`packages/testing/api-mocks/src/activity.ts`) gives titles
without a type today. Give its titles types so that, in the mock, the
period has `feat`, `fix`, a third kind with more merges than any other
kind but those two, at least one more kind that falls into `other`, and a
title with no type; keep Dependabot's titles in the `build(deps): bump …`
form Dependabot writes them in. Update tests that assert those
titles.

### Design doc

Rewrite the "Each bar is solid" paragraph of `docs/design/activity-view.md`
to describe the kinds, the four groups, how the third is chosen, the
order, the colours, the legend and the accessible names, citing
Conventional Commits. Adjust the sentence "No legend names what is
counted" so that it no longer contradicts the legend of kinds (the heading
still says what is counted).

### Tests

- The kind of a title: with and without a scope, with `!`, upper case,
  and titles without a type (no colon, a space before the colon, empty)
- The third kind: the most merged other than `feat` and `fix`, the tie
  going to the first name, none when only `feat`, `fix` and titles without
  a kind are merged, and chosen over the period, not per day
- Each day's segments add up to its merged count
- The bar's accessible name carries the breakdown in the drawing order
- The legend shows only the groups with merges, in order, and is absent
  without merges

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-view.md` describes the kinds after Conventional
      Commits and no longer says each bar is solid (grep in the check)
- [x] The chart has a legend named "Kinds of merged pull requests" (grep in
      the check)
- [x] The tests listed above pass (`make check`)

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, the chart's bars are stacked in four
      colours with the legend above them, in both the column and the row
      layout, in the light and the dark theme, and choosing a bar still
      narrows the list to that day's merges
