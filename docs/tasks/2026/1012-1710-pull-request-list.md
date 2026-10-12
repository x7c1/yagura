---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && test -f packages/domain/activity/package.json && grep -rq 'graphql' packages/gateway/github-api/src/ && grep -rq 'graphql' packages/testing/api-mocks/src/ && grep -rqi 'pull request' packages/apps/web/src/features/"
assignee: null
branch: task/1012-1710-pull-request-list
created_at: 2026-10-12T08:10:03Z
updated_at: 2026-10-12T08:23:15Z
---

# feat(web): list the members' pull requests of the last 14 days

## Overview

The page shows the organization and its members after sign-in
(`packages/apps/web/src/features/members/`). This task adds the next piece of
the activity view described in `docs/design/activity-view.md`: the pull
requests the members opened or merged in the period, fetched with GraphQL
`search` and shown as a list. Read that document first; its "Period",
"Measures", "Screen" and "Fetching" sections are the specification. Caching,
the per-member summary, and the chart come in later tasks, so keep the
pieces they will build on separate and pure.

### 1. `packages/domain/activity` (new package, `@yagura/activity`)

The first package of the `domain` layer (it may import nothing from the
workspace; see "Workspace layout" in `docs/guides/development.md`). Set it
up like the gateway packages (`package.json` scripts, `tsconfig.json`, a
reference in the root `tsconfig.json`), with tests.

- `PullRequest`: `id` (GitHub's node id), `title`, `url`, `repository`
  (`owner/name`), `author` (login), `state` (`open` | `merged` | `closed`),
  `createdAt`, `mergedAt` (or `null`), `additions`, `deletions`. Times as
  `Date`.
- The period: a function that, given "now", returns the start of the period
  (local midnight 13 days before today, so 14 days including today) and its
  end ("now"). Days follow the runtime's local time zone, which is the
  browser's. Take "now" as an argument so tests do not depend on the clock.
- `wasOpened(pr, period)` / `wasMerged(pr, period)` following the
  "Measures" section, and a function that merges search results into one
  list without duplicates (by `id`; a pull request opened and merged in the
  period comes back from both searches), sorted newest first by its latest
  event in the period (merge time if merged in the period, else creation
  time).

### 2. `packages/gateway/github-api`

Add `searchPullRequests(accessToken, query)` to `GitHubApiClient`: `POST
https://api.github.com/graphql` with the `search` connection (`type:
ISSUE`, `first: 100`), following `pageInfo.endCursor` while `hasNextPage`,
and returning `PullRequest` values from `@yagura/activity` (the gateway
layer may import domain). Ask only for the fields `PullRequest` needs.
Derive `state` from GitHub's `state` (`OPEN` / `MERGED` / `CLOSED`). Treat
an `author` of `null` (a deleted account) as `ghost`, as GitHub does. A
GraphQL response with `errors` is a `GitHubApiError` like a non-2xx one,
with the first error's message; a `401` must still be recognized by
`isUnauthorized` so `withAccessToken` refreshes the token. Cover it in
`client.test.ts`: two pages, the field mapping, a GraphQL error, a 401.

### 3. Building the queries

Two searches per member, as "Fetching" says:

- opened: `is:pr author:<login> created:>=<start>`
- merged: `is:pr is:merged author:<login> merged:>=<start>`

`<start>` is the period start as an ISO 8601 timestamp with the local
offset (for example `2026-09-29T00:00:00+09:00`), which GitHub search
accepts, so the boundary is local midnight rather than UTC midnight. Put the
query building in `@yagura/activity` (pure, tested). Run the members'
searches with a small concurrency limit (4) rather than all at once, so a
large organization does not fire dozens of requests in parallel.

### 4. `packages/testing/api-mocks`

Make `ApiMock` answer `POST https://api.github.com/graphql` searches with
fixture pull requests for the mock members: a handful per member spread over
the last 14 days relative to the time the mock is created, covering open,
merged (including one created before the period and merged inside it) and
closed, across two or three repositories. Filter by the query's `author:`,
`is:merged`, `created:>=` and `merged:>=` qualifiers, so the app's own
queries select the right fixtures. Unknown tokens get `401`, as the other
GitHub handlers do. Update the class doc comment and the "Running without
the session API" section of `docs/guides/development.md`.

### 5. `packages/apps/web`

Under the selected organization, after its members load, show the pull
requests the members opened or merged in the period, one row per pull
request: title linking to GitHub (opens in a new tab), repository, author,
state, `+additions` / `−deletions`, and the date of its latest event in the
period. Show the period above the list (for example "Sep 29 – Oct 12").
Loading, failure with Retry, and an empty state ("No pull requests by
<org>'s members in the last 14 days.") follow the existing members view.
Keep the members list as it is for now; the summary table replaces it later.

Calls go through `SessionController.withAccessToken`. Keep the fetching
logic (members → queries → searches → merge) outside the React components,
in a framework-free function the components call, so the cache task can wrap
it.

Tests through the API mock: the list after sign-in shows the fixtures in the
expected order with a pull request opened and merged in the period listed
once; the empty state; a failed search shows the error and Retry recovers.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the new `@yagura/activity` tests for
      the period, the measures, the merge, and the queries.
- [x] The domain package exists, the gateway and the API mock speak
      GraphQL, and the web app has a pull-request feature (`test` / `grep`
      gates in `check_command`).

### Before merge (verified outside the check command)

- [ ] `VITE_API_MOCK=1 make dev`: after the mock sign-in, the list shows the
      mock pull requests with the period above it.
- [ ] Against the dev session API through the proxy, the list shows real
      pull requests by the organization's members, including ones in a
      member's personal public repository and in a private repository the
      App is installed on. The result is recorded in the "Fetching" section
      of `docs/design/activity-view.md`, replacing the sentence that says it
      is to be confirmed.

## Out of scope

- The browser cache, the per-member summary table, and the chart.
- Filtering bots: members of an organization are people.
