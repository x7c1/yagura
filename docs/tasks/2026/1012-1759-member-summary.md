---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -rq 'summarizeByMember' packages/domain/activity/src/ && grep -rq 'summarizeByMember' packages/apps/web/src/"
assignee: null
branch: task/1012-1759-member-summary
created_at: 2026-10-12T08:59:21Z
updated_at: 2026-10-12T09:08:55Z
---

# feat(web): summarize each member's pull requests in a table

## Overview

`docs/design/activity-view.md` ("The screen") calls for a summary table with
a row per member: opened, merged, additions, deletions. Today the page shows
a plain list of members (`features/members/OrganizationMembers.tsx`) and,
below it, the pull-request list (`features/pull-requests/`), whose data is
cached in IndexedDB. This task replaces the plain member list with the
summary table, computed from the same pull requests the list shows.

### 1. `@yagura/activity`: `summarizeByMember`

A pure function taking the members' logins, the pull requests (as the list
holds them: each once), and the period, and returning one row per login in
the given order: `opened` (count of `wasOpened`), `merged` (count of
`wasMerged`), `additions` and `deletions`. Lines are summed over the
member's pull requests in the list, each pull request counted once even when
it was both opened and merged in the period, so the table adds up to the
list. Also return the totals over all members. Members with no pull requests
get a row of zeros: a member with nothing in two weeks is exactly what the
view exists to show. Test it, including a pull request opened before the
period and merged inside it (merged only), one opened and merged inside it
(both), and a member with nothing.

### 2. `packages/apps/web`

Replace the `<ul aria-label="Members">` list with a table: one row per
member (avatar and login, opened, merged, `+additions`, `−deletions`) in
login order as the members arrive (the view does not rank members), and a
totals row at the bottom. Numbers are right-aligned. Show the period above
the table, as the list does now, and keep it in one place for both (the
table and the list cover the same period; do not repeat it).

The table needs the pull requests, which the pull-request feature loads.
Lift the loading so that one request feeds both the table and the list
rather than each fetching on its own: one component loads the members'
pull requests (through the existing cached fetch) and renders the table and
then the list from the result. Loading, failure with Retry, and the empty
state keep working as now; with no pull requests, the table still shows
every member with zeros above the "No pull requests…" message.

The "No members of <org> are visible to you." state stays as it is.

Tests through the API mock: the table's rows and totals for the mock
fixtures (compute the expected numbers from the fixtures in the test, not
by hand-copying the output), a member with no pull requests shows zeros,
and the table and the list come from one fetch (count the GraphQL searches
through the mock: two per member, not four).

### 3. Docs

In "The screen" of `docs/design/activity-view.md`, state that lines in the
summary are summed over each pull request once, that members with no pull
requests are listed with zeros, that rows follow the login order, and that
a totals row closes the table.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the `summarizeByMember` tests and the
      web tests listed above.
- [x] `summarizeByMember` exists in the domain package and the web app uses
      it (`grep` gates in `check_command`).

### Before merge (verified outside the check command)

- [x] `VITE_API_MOCK=1 make dev`: after the mock sign-in, the table shows
      the mock members with their counts and a totals row, above the list.
- [x] Against the dev session API through the proxy, the table's totals
      match the list: the opened and merged counts and the summed lines
      agree with what the list's rows add up to.

## Out of scope

- The chart and narrowing the list by day.
- Sorting the table by a column.
