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
branch: task/1022-0342-fit-tables-and-share-theme-across-tabs
created_at: 2026-10-21T18:42:00Z
updated_at: 2026-10-21T19:22:40Z
---

# fix(web): drop the heatmap legend, wrap the tables instead of scrolling them sideways, and follow the theme chosen in another tab

## Overview

Four touches to `packages/apps/web/`.

### Drop the heatmap legend

`features/pull-requests/HourlyHeatmap.tsx` draws a legend (`HeatScale`) whose
shades are evident from the cells themselves, and it also lists steps no cell
uses. Remove the legend and its styles. Keep the figure's description for
screen readers.

### Wrap the tables instead of scrolling them sideways

Both tables sit in a horizontally scrolling `.scroll` container. Its scrollbar
looks unlike the rest of the page, and nothing tells the person that the table
continues to the side.

- Members (`MemberSummaryTable`): let the login wrap and remove `.scroll`
- Pull requests (`PullRequestList`): let Repository and Author wrap as well as
  Title, and remove the sideways scroll. If at 375px wide the rows still do not
  read well, switch only the narrow width to a row layout (each pull request
  as a stacked block), as the chart already does for narrow widths
- The page must not scroll sideways at 375px, in either theme
- Keep the column headers, the date stripes and the sticky header behaviour of
  the pull request list in the window-fitting layout

### Follow the theme chosen in another tab

`features/theme/theme-controller.ts` reads the stored choice (`yagura.theme`)
only at load. Subscribe to the browser's `storage` event through the browser
gateway (`packages/gateway/browser`, not `window` directly), and when
`yagura.theme` changes, read it again and apply it. Unsubscribe on teardown.

### Show the organization selector with several organizations

`features/members/OrganizationMembers.tsx` portals an `Organization` selector
into the header when the app is installed on more than one organization. The
mocks (`packages/testing/api-mocks`) support several organizations, but only
tests use that. Make the development mock setup (the one `make dev` uses with
MSW) offer at least two organizations, so the selector can be seen and used
without a backend. Fix anything in the selector's layout that breaks in the
header at 375px and at desktop width.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] The heatmap renders no legend and still has its accessible description, covered by a test
- [x] Neither table is wrapped in a horizontally scrolling container, covered by a test
- [x] A `storage` event for `yagura.theme` applies the new theme, covered by a test through the gateway
- [x] The development mocks offer two or more organizations
- [x] `make check` passes

### Before merge (verified outside the check command)

- [x] With `make dev` (MSW), screenshots at 375px and at 1280px, light and dark, show the Members table and the pull request list without sideways scrolling, and the organization selector in the header
