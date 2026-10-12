---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -rq 'indexedDB' packages/gateway/browser/src/ && grep -rq 'nodes(ids' packages/gateway/github-api/src/ && grep -rq 'nodes(ids' packages/testing/api-mocks/src/"
assignee: null
branch: task/1012-1735-browser-cache
created_at: 2026-10-12T08:35:00Z
updated_at: 2026-10-12T08:56:35Z
---

# feat(web): keep fetched activity in the browser so a reload does not fetch it again

## Overview

The pull-request list fetches everything on every load: two searches per
member over the whole 14-day period. Against real data one member with a
couple of hundred pull requests takes a few seconds per search page, so each
visit waits ten seconds or more for data that, for past days, cannot have
changed. `docs/design/activity-view.md` ("The browser cache") specifies a
cache in IndexedDB that keeps what cannot change for longer than what can.
This task builds it. Read that section first; it is the specification, and
the behaviours below make it concrete.

### Behaviour

"Short-lived" means 10 minutes. "Lasting" means until 7 days after it was
stored. Both are constants in one place.

1. **Past days are fetched once.** For each member and measure (opened,
   merged), a day before today whose results were fetched after that day had
   ended, and less than 7 days ago, is complete and is not searched again.
   Missing past days are fetched with one search per member and measure over
   the range from the earliest missing day to the start of today (a range
   query, `created:<from>..<to>` / `merged:<from>..<to>` with local-offset
   timestamps, like the existing queries), and the results are stored per
   day — including days with no pull requests, so that an empty day counts
   as fetched. A day that was "today" when fetched is not complete; it is
   fetched again as a past day once it has ended.
2. **Today is short-lived.** Today's opened and merged searches run again
   when the stored result is older than 10 minutes.
3. **Unmerged pull requests are short-lived.** A stored pull request that is
   open or closed (not merged) may have changed state or lines. When its
   record is older than 10 minutes, refresh it by node id rather than by
   searching again: add `getPullRequests(accessToken, ids)` to
   `GitHubApiClient` using GraphQL `nodes(ids: [...])` (at most 100 ids per
   request), returning the same `PullRequest` values as the search. An id
   that comes back `null` (deleted, or no longer visible) is dropped. A pull
   request that is now merged becomes lasting.
4. **The member list is short-lived.** Keep it for 10 minutes. The
   installations request stays uncached; it is one cheap call.
5. **Expiry and pruning.** Lasting entries older than 7 days are treated as
   missing (and refetched). Entries for days that fell out of the period are
   deleted when the view loads, without waiting for expiry.
6. **Per viewer, cleared on sign-out.** Everything is keyed by the signed-in
   login, and `SessionController.signOut` clears that login's entries. One
   viewer never reads another's entries.
7. **Storage is optional.** When IndexedDB is unavailable or an operation on
   it fails (private browsing, blocked storage, quota), the view still works
   and fetches everything, as now. A cache failure is never shown as a
   failure of the view.

The rendered list must be the same as without the cache: the same pull
requests, merged without duplicates and sorted as `mergeSearchResults` does.

### Where things go

- **Pure planning in `@yagura/activity`** (domain, no I/O): the day keys of
  the period, which days of a member and measure are complete given what is
  stored and "now", the range to fetch for the missing ones, splitting
  search results into days, and the expiry checks. Tested with explicit
  times.
- **An async store in `packages/gateway/browser`**: a small interface for
  JSON values by string key (get, set, delete, delete by key prefix), an
  IndexedDB implementation (`indexedDB`, one database, one object store),
  and a memory implementation for tests. Test the IndexedDB one with
  `fake-indexeddb` as a dev dependency.
- **The orchestration in `packages/apps/web`**: wrap
  `fetchMembersPullRequests` (`features/pull-requests/fetch-pull-requests.ts`)
  so it reads and writes the store as above, and give the members request
  the same treatment. Construct the IndexedDB store in `main.tsx`, the
  composition root, and pass it down the way the session controller and the
  key-value store are passed; tests use the memory store.
- **`packages/testing/api-mocks`**: answer `nodes(ids:)` from the fixtures,
  and record GraphQL requests so tests can count searches.
- Update the "Fetching" and "The browser cache" sections of
  `docs/design/activity-view.md` where the implementation fixes something
  the document left open (the 10-minute short life, the range searches, the
  refresh by node id).

### Tests

Through the API mock with a memory store and an injected clock:

- A second load within 10 minutes makes no GraphQL request and no members
  request, and shows the same list.
- A second load after 10 minutes on the same day searches only today (two
  searches per member) and refreshes stored unmerged pull requests by id; no
  past day is searched.
- The next day, the previous day is searched once as a past day; the days
  before it are not.
- A stored lasting entry older than 7 days is searched again; an entry for a
  day outside the period is deleted.
- Sign-out clears the viewer's entries; a second viewer's entries survive.
- A store whose every operation throws still yields the full list.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the tests listed under "Tests" and the
      planning tests in `@yagura/activity`.
- [x] The browser gateway uses IndexedDB, and the GitHub gateway and the API
      mock support `nodes(ids:)` (`grep` gates in `check_command`).

### Before merge (verified outside the check command)

- [ ] Against the dev session API through the proxy: the first load fetches
      as before; a reload within 10 minutes shows the list without any
      request to `api.github.com/graphql`; the list is identical.
- [ ] In the browser's IndexedDB, the entries are keyed by the signed-in
      login, and signing out removes them.

## Out of scope

- The per-member summary table and the chart.
- A manual "refresh" control; reloading after 10 minutes is enough for now.
