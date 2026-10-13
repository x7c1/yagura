---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check"
assignee: null
branch: task/1013-1624-search-ids-then-fetch-details
created_at: 2026-10-13T07:24:10Z
updated_at: 2026-10-13T07:39:15Z
---

# perf(web): search for ids only and fetch the details of the pull requests the cache lacks

## Overview

A reload after the 10-minute short life waits about 4.5 seconds for data,
measured in production for one member with about 230 pull requests in 14
days:

- today's two searches (opened, merged; in parallel) take about 2.5 seconds
  for 15–20 results, because each search asks GitHub for `additions` and
  `deletions`, which GitHub computes per pull request, and it does so also
  for pull requests merged earlier today that the cache already holds;
- the refresh of the stored unmerged pull requests by id (`nodes(ids:)`,
  about 2 seconds) starts only after every search has finished, although
  which ids to refresh is known from the cache before any search runs.

This task changes how activity is fetched so that searches are light and
nothing waits that does not need to. It does not change what is shown, nor
when the view renders (showing the cache before the fetch returns is a
later task).

Read `docs/design/activity-view.md` ("Fetching", "The browser cache") and
`packages/apps/web/src/features/pull-requests/fetch-pull-requests.ts` first.

### Behaviour

1. **Searches return only what places a pull request on a day.** The
   GraphQL search asks only for each pull request's node id, `state`,
   `createdAt` and `mergedAt` (non-pull-request nodes are still skipped).
   Its results are recorded per day exactly as now — the day keys, the
   empty days, the completeness rules of `isDayComplete` and `planSearch`
   do not change. The same light search is used for every span, past days
   included, so there is one fetch path.
2. **Details are fetched by id, only for what the cache lacks.** After a
   search, the full `PullRequest` (title, url, repository, author, lines…)
   is fetched with `nodes(ids:)` (at most 100 ids per request, as now) for
   each found id that
   - is not stored, or
   - is stored but not merged (its state or lines may have changed), unless
     it was stored within the short life and the search reports the same
     state.

   A stored merged pull request is final and is not fetched again; its
   stored record is kept (its `storedAt` is not renewed by being found).
   An id whose lookup answers `null` is dropped from the days that list it,
   as `recordRefresh` does today.
3. **The stale refresh does not wait for the searches.** The stored
   unmerged pull requests past the short life (`staleUnmergedIds`) are
   computed from the cache before the searches start, and their lookup is
   sent at the same time as the searches. Each search's detail lookup is
   sent as soon as that search returns, not after all searches.
4. **Each id is fetched at most once per load.** An id that a search finds
   while the stale refresh already covers it (sent or answered) is not
   looked up again; the search's light result and the lookup's full result
   are combined, and when they disagree on `state` or `mergedAt`, the
   lookup's answer wins (it is the full, later read). Write this rule down
   in the code where it is decided.
5. **Failure handling stays as now.** A failure stops further requests;
   what was fetched before it is still stored, so a retry does not repeat
   it; the error is rethrown after storing. A day whose search succeeded but
   whose detail lookup failed must not be stored as complete with ids
   whose details are missing — either store the day only with its details,
   or not at all.
6. **Concurrency stays bounded.** Searches and lookups together respect a
   small cap (the existing `searchConcurrency` of 4, or one shared limit),
   so a large organization does not fire dozens of requests at once.
7. **The stored shape may change.** If the cache's stored shape has to
   change, an entry in the old shape is read as missing and fetched again
   (`decodeMemberActivity` already returns `undefined` for an unknown
   shape); do not write a migration.

The rendered list must stay the same as before: the same pull requests with
the same fields, merged without duplicates and sorted as
`mergeSearchResults` does.

### Where things go

- **`@yagura/activity`** (domain, pure): the light search result type, the
  rule for which found ids need details (taking the stored activity, the
  search results and `now`), and recording a search whose details arrive
  separately. Tested with explicit times.
- **`packages/gateway/github-api`**: a light search
  (`searchPullRequestIds` or similar, returning the light results, paging
  as now) beside `getPullRequests`. Remove the full search if nothing uses
  it any more.
- **`packages/apps/web`**: the orchestration in `fetch-pull-requests.ts`
  (`PullRequestsApi` changes accordingly).
- **`packages/testing/api-mocks`**: answer the light search from the
  fixtures, and let tests observe the order and timing of GraphQL requests
  (for example, hold a search's response until the test releases it).
- **`docs/design/activity-view.md`**: update "Fetching" to describe the
  light search, the detail lookup by id, and that the stale refresh runs
  alongside the searches.

### Tests

Through the API mock with a memory store and an injected clock:

- A first load shows the same list as before (same ids and fields), and the
  number of `nodes(ids:)` requests is the found ids divided by 100, rounded
  up, per batch of lookups.
- A reload after 10 minutes on the same day, with pull requests merged
  earlier today already stored: those ids are not looked up; new ids and
  stored unmerged ids are, each once.
- The stale refresh request is sent while a search is still held (it does
  not wait for the search to answer).
- An id both stale and found by today's search is looked up once, and the
  stored record is the lookup's.
- A lookup failing after a successful search leaves no day stored as
  complete with ids lacking details; the next load fetches them.
- An old-shaped stored entry (if the shape changed) is fetched again.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the tests listed under "Tests" and the
      domain tests for the detail rule.

### Before merge (verified outside the check command)

- [ ] Against the dev session API through the proxy, with the cache
      cleared: the first load shows the same number of pull requests as
      `gh search prs` for the same member and period, and the time to the
      list is recorded in the PR next to the time on `main`.
- [ ] Against the dev session API, a reload more than 10 minutes after the
      previous load: in the network panel, the `nodes(ids:)` refresh starts
      before today's searches finish, no lookup carries an id merged before
      the previous load, and the time until the last GraphQL response is
      recorded in the PR next to the time on `main`.

## Out of scope

- Showing the cache before the fetch returns, and caching the
  installations (a later task).
- Changing the session API or how the viewer's login is found.
