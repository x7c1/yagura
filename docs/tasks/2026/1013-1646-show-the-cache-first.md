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
branch: task/1013-1646-show-the-cache-first
created_at: 2026-10-13T07:46:44Z
updated_at: 2026-10-13T08:03:03Z
---

# feat(web): show the cached activity at once and bring it up to date behind it

## Overview

When the cache holds a member's activity, a reload still shows "Loading…"
until every request of the visit has answered. The installations, the
member list, today's searches and the refresh of unmerged pull requests all
run before anything is drawn. That costs about 1.5 seconds within the
10-minute short life and about 3 seconds after it, measured on a reload for
one member. The data on screen would be the same as the cached data except
for what changed in the last few minutes.

This task draws what the cache holds first and brings it up to date behind
it (stale-while-revalidate). It also caches the installations the way the
member list is cached. When the cache is empty, it shows the member table
while the pull requests load instead of a bare "Loading…".

Read `docs/design/activity-view.md` ("Fetching", "The browser cache"),
`packages/apps/web/src/features/members/OrganizationMembers.tsx`,
`load-members.ts`, `features/pull-requests/MembersActivity.tsx`,
`fetch-pull-requests.ts` and `shared/use-request.ts` first.

### Behaviour

1. **Pull requests: the cache first, then the fetch.** When the view
   mounts, it reads the members' stored activity, pruned to the period as
   now, and draws the period, the summary table, the chart and the list
   from it at once. It then runs the fetch exactly as now, and when the
   fetch returns, the view replaces what it drew with the fetched result.
   "The cache holds something" means at least one of the members has stored
   activity in the period. Partial data, such as a day not fetched yet, is
   drawn as it is; the fetch fills it in.
2. **Showing that an update is running.** While the fetch runs behind
   cached data, a short "Updating…" note sits next to the period line. It
   must not move the layout when it appears or goes away: reserve its space,
   or place it where its presence does not reflow the table, the chart or
   the list. When nothing is fetched (all within the short life), no note
   appears.
3. **Failure behind cached data.** If the fetch fails while cached data is
   shown, the cached data stays on screen. The failure message and Retry
   (the existing `Failure` component) appear next to the period line in
   place of the "Updating…" note. Retry runs the fetch again without
   clearing the screen.
4. **No cache.** When the cache holds nothing for these members, the view
   shows the summary table at once with a row per member (the names, as
   now), the number cells showing a placeholder. The chart and the list say
   they are loading. On failure, the table with its placeholders stays and
   the failure with Retry is shown below it. The view no longer replaces
   the whole section with "Loading pull requests…".
5. **Installations cached like the members.** Store the installation list
   in the viewer's cache under its own key, with the member list's 10-minute
   short life. Use the same pattern as the members: within the short life,
   no request is made.
6. **Installations and members: stored lists shown past the short life
   too.** When a stored installation or member list is past its short life,
   draw from it at once and fetch it again behind it. When the fetched list
   differs, draw again with it. If that fetch fails, keep what is drawn and
   show the failure with Retry next to it. Without a stored list, behave as
   now (loading, then the list or a failure). This way a reload past the
   short life waits on no request before the pull requests' cached data is
   drawn.
7. **Sign-out and other viewers are unchanged.** All new entries are in the
   viewer's cache (`controller.viewerCache()`), so sign-out removes them and
   other viewers never read them.

The fetched result and what is shown after the fetch must be the same as
before this task. The task changes when things are drawn, not what is
drawn.

### Where things go

- A small hook in `packages/apps/web/src/shared` for "draw the stored value
  first, then the fetched one" is likely to serve all three lists
  (installations, members, pull requests). Name it for what it does, and
  keep `useRequest` for the call sites that have no cached value, or fold
  it in if that reads better. A result that arrives after the inputs changed
  or the component unmounted is dropped, as `useRequest` does now.
- Split `fetchMembersPullRequests` so that reading what the cache holds can
  be called on its own, without any request. The domain functions it uses
  stay in `@yagura/activity`.
- The installations' cache read and write go beside `load-members.ts` (for
  example, generalize it to a short-lived list loader, or add a sibling).
- `MemberSummaryTable` gets a way to show its rows with placeholders.

### Documents

- `docs/design/activity-view.md`, "The browser cache":
  - Add the installations to the table as short-lived.
  - Drop the sentence that says the installations are not cached.
  - Describe that the view draws from the cache first and updates behind
    it, what the "Updating…" note and a failure behind cached data look
    like, and that stored lists past their short life are drawn and then
    fetched again.
- `docs/design/session-api.md`: the introduction says the access token
  "lives only in the page's memory" but gives no reason. Add a short
  section, or a paragraph in the introduction, explaining:
  - it keeps a script that runs in the page (cross-site scripting, a
    compromised dependency) from reading the token out of storage and using
    it elsewhere for its 8-hour life; the refresh token is in an `HttpOnly`
    cookie that scripts cannot read;
  - it does not stop such a script from calling the API while the page is
    open;
  - the cost is that every page load needs one `POST /session/refresh`
    before the first API call.

### Tests

Through the API mock with a memory store, an injected clock and
`holdGraphql` (and an equivalent way to hold the REST answers, if needed):

- With activity stored and past the short life, the summary table, chart
  and list show the cached pull requests while the searches are held, with
  "Updating…" shown. After they are released, the fetched result replaces
  them and the note goes away.
- With activity stored within the short life, the view shows it with no
  GraphQL request and no "Updating…" note.
- A fetch failing behind cached data keeps the cached rows on screen and
  shows the failure with Retry. Retry fetches again and, on success, shows
  the result.
- With an empty cache, the summary table lists every member with
  placeholders while the searches are held. On failure, the rows stay and
  the failure with Retry is shown.
- Installations stored within the short life make no
  `GET /user/installations` request. Stored installations and members past
  the short life are drawn before their requests answer, and are fetched
  again.
- Sign-out removes the installations entry along with the others.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the tests listed under "Tests".

### Before merge (verified outside the check command)

- [x] Against the dev session API through the proxy, with the cache's
      stored times moved back 11 minutes: on reload, the summary table and
      the list are on screen while GraphQL responses are still pending
      (shown by comparing the time the table first appears with the
      requests' resource timing), "Updating…" shows and goes away without
      moving the layout, and the final list matches the one on `main`.
- [x] Against the dev session API, a reload within 10 minutes makes no
      request to `/user/installations`, the members endpoint or GraphQL.
- [x] With `VITE_API_MOCK=1` and the cache cleared, the member table with
      placeholders shows before the pull requests arrive.

## Out of scope

- Drawing before the session is restored (`POST /session/refresh` and
  `GET /user` still run first; a later task removes that wait).
- Changing what is fetched or how (done in the previous task).
