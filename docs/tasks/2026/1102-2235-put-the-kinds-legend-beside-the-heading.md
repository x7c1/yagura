---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && tr '\\n' ' ' < docs/design/activity-view.md | grep -q 'legend[^.]*beside the \"Merged PRs\" heading' && ! tr '\\n' ' ' < docs/design/activity-view.md | grep -q 'Above the bars, in the same card'"
assignee: null
branch: task/1102-2235-put-the-kinds-legend-beside-the-heading
created_at: 2026-11-02T13:35:27Z
updated_at: 2026-11-02T14:01:25Z
---

# feat(web): put the legend of kinds beside the heading and narrow the gaps in the bars

## Overview

Two adjustments to the "Merged PRs" card
(`packages/apps/web/src/features/pull-requests/`).

### The gap between a bar's segments

The gap between two segments of a bar is a 2px line in the card's colour
(`.segmentGap` in `DailyChart.module.css`, `stroke-width:
var(--border-width-strong)`), while the cells of the hours' heatmap right
under the bars are 1px apart (`cellGap` in `heatmap-geometry.ts`). In the
same card the bars' gaps read as wider than the heatmap's. Draw the gap
between segments 1px wide (`var(--border-width)`), the same as the
heatmap's, in both the column and the row layout. Keep it a line in the
card's colour, so that it still parts neighbouring segments by more than
their colour; check that a 1px line is still drawn crisp (not blurred over
two pixels) at a device pixel ratio of 1 and 2, and if it is not, place it
so that it is.

### Where the legend sits

The legend of kinds ("Kinds of merged pull requests") sits today in the
chart's figure, on a line of its own between the "Merged PRs" heading and
the bars (`KindLegend` in `DailyChart.tsx`). Move it into the heading's
row, at its right end, on the heading's line:

```
Merged PRs                          ■ feat  ■ fix  ■ docs  ■ other
```

- The heading's row is `SectionHeading` (`SectionHeading.tsx`), whose
  `aside` already holds the "Updating…" note at the right. The note keeps
  its place at the right of the row's other content: put it just left of
  the legend, so that its coming and going still moves nothing (its room is
  kept while it is absent, as now), and the legend stays flush with the
  card's right edge.
- The legend's items align with the heading's text (the row aligns on the
  baseline today).
- Where the heading and the legend do not fit on one line, the legend wraps
  under the heading as the row's `aside` does today, and its items wrap
  onto more lines rather than widening the page. Keep the space between
  the wrapped legend and the bars no larger than the gap the row leaves
  below it now.
- The legend stays out of the heading itself (the `h2` names the card,
  "Merged PRs", alone) and keeps its accessible name, its order, and its
  rule of showing only the groups with merges in the period, with none
  drawn when the period has no merges.
- The chart still receives the kinds it draws from; work out the legend's
  groups once for both the legend and the bars, so that the two cannot
  disagree. While the chart is loading (`MembersActivity.tsx` shows
  "Loading…" under the same heading), no legend is drawn.

### Design doc

In `docs/design/activity-view.md`, rewrite the sentence that places the
legend "Above the bars, in the same card" to place it at the right of the
card's top row, beside the "Merged PRs" heading, wrapping under it on a
narrow screen. Update the sentence on where the "Updating…" note sits to
say it sits just left of the legend. Where the doc describes the gap
between segments, say it is 1px, as the heatmap's cells are apart.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] The design doc places the legend beside the "Merged PRs" heading
      (grep in the check)
- [x] Tests assert that the legend is in the heading's row of the "Merged
      PRs" card and not inside the chart's figure, that its groups and
      order are unchanged, and that no legend is drawn while loading or
      with no merges (`make check`)

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, in the light and the dark theme and
      in the column and the row layout, the legend is at the right of the
      "Merged PRs" heading on its line, the "Updating…" note's room does
      not push it out of place, and on a narrow window the legend wraps
      under the heading without widening the page
- [x] The gaps between a bar's segments look as wide as the gaps between
      the heatmap's cells (a person confirms on the screen before merge)
