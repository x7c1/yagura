---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && test -f docs/design/activity-api.md && ! grep -rq --exclude-dir=node_modules --exclude-dir=dist 'api.github.com' packages/apps/web/src packages/apps/web/content-security-policy.ts packages/domain && grep -rq --exclude-dir=node_modules --exclude-dir=dist 'Pushes' packages/apps/web/src"
assignee: null
branch: task/1027-0234-read-activity-from-the-api
created_at: 2026-10-26T17:34:10Z
updated_at: 2026-10-26T18:20:22Z
---

# feat(web): read activity from the Yagura API and show pushes, drafts and bot pull requests

## Overview

The web app reads pull requests straight from the GitHub API in the browser
(GraphQL `search` and `nodes`, with the per-day IndexedDB cache described in
`docs/design/activity-view.md`). The backend now collects the activity of the
allowed organizations from GitHub, stores it, and
serves it through a new API on the same host as the session API. This task
moves the app onto that API and changes the view so that it shows how much
work happened, not only what was merged: pushes to pull request branches,
drafts, and pull requests opened by bots such as Dependabot.

The app no longer calls `api.github.com` at all. The only remote it talks to
for data is the Yagura API (`VITE_YAGURA_SESSION_API` already holds its base
URL; the activity API lives on the same host). Remove what becomes unused
(the GitHub API gateway, the per-day search cache, the CSP `connect-src`
entry for `api.github.com`).

### The API (write it down as `docs/design/activity-api.md`)

Requests carry the session's access token as `Authorization: Bearer <token>`.
No cookies (do not send `credentials: "include"`). Every response has
`Cache-Control: no-store`. Errors use the session API's shape
`{ "error": "<code>", "error_description": "..." }`.

- `GET /activity/organizations` → `{ "organizations": [{ "id", "login", "avatarUrl" }] }`:
  the organizations the viewer can use.
- `GET /activity?organization=<id>&from=<ISO 8601>&to=<ISO 8601>` → the
  activity of that organization's members in `[from, to)`. `from`/`to` carry a
  zone (`Z` or `±hh:mm`); the range is at most 31 days and 1 hour (a local
  month with a DST change). Response:
  - `members`: `[{ "id", "login", "type": "User" | "Bot" }]` — the
    organization's current members (in login order, even with no activity)
    and the bots that opened a returned pull request.
  - `pullRequests`: `[{ "id", "repository": { "id", "ownerLogin", "name" },
    "number", "title", "state": "open" | "closed", "draft", "additions",
    "deletions", "authorId", "createdAt" }]` — pull requests that had any
    activity in the range, in the order of their first activity in it.
  - `activities`: `[{ "kind", "pullRequestId", "actorId", "occurredAt" }]`
    in time order; `kind` is one of `opened`, `pushed`, `ready_for_review`,
    `converted_to_draft`, `merged`, `closed`. `actorId` may name someone not
    in `members`.
  - Times are UTC ISO 8601 with milliseconds.
- Errors: `400 invalid_request` (missing/bad parameters, range too long),
  `401 invalid_token` (no/invalid token; the app treats it like an expired
  session), `403 forbidden` (organization not usable), `404 not_found`,
  `502 upstream_error`, `500 internal_error`.
- The server returns only rows from repositories the viewer can see on
  GitHub; a change of access shows within about five minutes.

`docs/design/session-api.md` stays the contract for the session; link the
two documents to each other.

### What the view shows (rewrite `docs/design/activity-view.md`)

The purpose stays: members see that development is moving and notice when it
stalls. Merges alone hide days spent iterating on a draft, so pushes count as
activity too. Keep everything in the current spec that the points below do not
change (pages, header, menu, theme, sign-in screen layout, failures, fitting
the window, accessibility rules).

**Chart.** The merged bars stay exactly as they are (axis, grid lines, counts
above bars), and now include merged bot pull requests. Above the bars, add one
row, labelled "Pushes" at its left: for each day, a small circle in a push
colour (distinct from the merged blue and the state badges) holding that day's
number of pushes by members; empty on a day with none. Where the days are
rows (narrow layout), the push circle sits next to the date. Choosing a bar
narrows the list to the pull requests merged that day, as now. Choosing a push
circle narrows it to the pull requests a member pushed to that day. Bots'
pushes (e.g. Dependabot rebasing its own branch) are not counted anywhere.
The card heading stays "Merged PRs". Pushes and merges are drawn differently on
purpose: they have different scales, and bars side by side or stacked would
invite comparing heights that mean nothing.

**Heatmap.** Counts members' pushes and merges together, so a day's hours add
up to that day's merges plus pushes. Each cell's accessible name gives the
breakdown, e.g. "Oct 13, 14:00 to 15:00: 5 pushes, 1 merged".

**List.** One row per pull request, as now. It holds the pull requests opened
or merged in the period and those a member pushed to in the period.
- State gains a "draft" badge (GitHub's grey) for open drafts.
- Date is the latest activity of the row in the period, with its kind in
  words ("Pushed 2026-10-13 14:05", "Merged …", "Opened …").
- A "Pushes" column gives the number of members' pushes to that pull request in
  the period.
- A bot's pull request shows only the bot as its author (no "merged by").
- Bot pull requests are hidden by default. A toggle above the list shows them
  and says how many are hidden ("Show 12 bot pull requests"); the choice is
  remembered per browser in `localStorage`. When the chart narrows the list,
  the narrowed view also says how many bot pull requests it hides.

**Members page.** Add a "Pushed" column (members' pushes in the period).
Merged still counts pull requests the member authored; merging someone else's
or a bot's pull request does not count for the merger. After the members, one
row per bot that opened a pull request in the period, marked as a bot:
Opened, Merged, Additions and Deletions counted like a member's, Pushed shown
as "—". The totals row includes the bot rows, so its Merged equals the chart's
merged total.

**Loading and the browser cache.** Replace the per-day search cache. Keep the
behaviour the current spec describes as "Drawing from the cache first": store
the last API response per signed-in login and organization in IndexedDB, draw
it at once (also before the session is confirmed, as now), and replace it when
the API answers, with the "Updating…" note while that runs. Keep the 7-day
expiry and the per-login separation and deletion on sign-out. A failed
update keeps what is drawn and shows the failure with Retry, in the same
words-for-people style as now.

**Sign-in screen and README.** The note under the sign-in button and the
README's "Nothing to hand over" no longer hold: the server now stores the pull
request activity of the organizations that use it, and returns to each viewer
only what that viewer can see on GitHub. Say that instead, plainly.

### Mocks

Update `packages/testing/api-mocks` so that `VITE_API_MOCK=1 make dev` serves
the new API (organizations, members including a bot, pull requests with
drafts, pushes, merges and a bot pull request) and the app can be exercised
without any backend.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-api.md` exists and documents the endpoints, the
      bearer token, the errors and the visibility rule (`test -f` in the check)
- [x] The app source, its CSP and the domain package no longer reference
      `api.github.com` (grep in the check)
- [x] Tests cover: the API client (bearer header, no cookies, error mapping,
      401 → expired session); the daily merged counts including bot merges;
      the per-day push counts counting members only; the heatmap adding pushes
      and merges with the per-cell breakdown; the list's inclusion rule, draft
      state, latest-activity date with its kind and the Pushes column; hiding
      bot pull requests by default with the hidden count, including when the
      chart narrows the list; narrowing by a push circle; the members table's
      Pushed column, bot rows with "—" and totals including bots; drawing the
      cached response first and replacing it (`make check`)
- [x] The view renders the "Pushes" row (grep in the check)

### Before merge (verified outside the check command)

- [ ] With `VITE_API_MOCK=1 make dev`, the activity page shows the merged bars
      with the push circles above them, the heatmap, and the list with a draft
      badge, the Pushes column, the latest-activity dates and the bot toggle;
      the members page shows the Pushed column and a bot row with "—";
      narrowing by a bar and by a push circle works (checked in a browser by
      the merging session, with screenshots in the PR)
- [ ] The same build, deployed to the development host with the development
      API, signs in and shows real data — needs a person: signing in to GitHub
      is not done on the person's behalf

## Out of scope

- Updating an open page live when new activity arrives (a later change will
  add it; leave the "Updating…" path reusable for it).
- Showing reviews or comments.
