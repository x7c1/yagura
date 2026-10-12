---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && test -f docs/design/activity-view.md && grep -rq '/user/installations' packages/gateway/github-api/src/ && grep -rq '/members' packages/gateway/github-api/src/ && grep -rq '/user/installations' packages/testing/api-mocks/src/"
assignee: null
branch: task/1012-1651-organization-members
created_at: 2026-10-12T07:51:43Z
updated_at: 2026-10-12T08:02:08Z
---

# feat(web): show the organization's members after sign-in

## Overview

yagura is about to grow its first real view: the pull requests that an
organization's members opened and merged over the last 14 days. This task
writes down what that view shows, and builds its first piece — finding the
organization and listing its members. Later tasks add the pull requests, a
browser cache, a per-member summary, and a chart, each against the design
document written here.

### 1. `docs/design/activity-view.md` (new)

The design of the activity view, in English, following the tone of
`docs/design/session-api.md`. It must cover the following, as decided by the
maintainers; write it as the product's design, not as a plan:

- **Purpose.** Members of an organization use it to see that development is
  moving and to notice when it stalls. It does not try to show imbalance
  between repositories or members.
- **Unit: members, not repositories.** The view covers pull requests whose
  author is a member of the organization, in any repository — the
  organization's own repositories and the members' personal ones alike.
  Pull requests by people outside the organization and by bots are not
  shown. Pull requests in repositories the signed-in user cannot see on
  GitHub are never shown.
- **Organization.** The organization is the one the GitHub App is installed
  on among those the signed-in user can access (`GET /user/installations`,
  account type `Organization`). With exactly one, it is chosen without
  asking. With several, a plain selector lets the user switch. With none,
  the view says the app is not installed on any of the user's organizations.
- **Period.** The last 14 days including today. Days are split in the
  browser's time zone.
- **Measures.** *Opened*: pull requests created within the period, whatever
  their state now. *Merged*: pull requests merged within the period, even if
  created before it. *Lines*: the additions and deletions GitHub reports;
  lockfiles and generated files are not excluded.
- **Screen.** One page with: a summary table per member (opened, merged,
  additions, deletions); a chart of the opened and merged counts per day; a
  list of pull requests (title, repository, author, state, additions,
  deletions, link to GitHub). Choosing a day's "opened" or "merged" in the
  chart narrows the list to that day's pull requests of that kind. Review
  counts and review latency are not shown.
- **Browser cache.** Results are kept in IndexedDB so that a reload does not
  fetch everything again. What cannot change is kept longer than what can:

  | Data | Changes? | Kept as |
  | --- | --- | --- |
  | A merged pull request | Not in practice (title edits are ignored) | Lasting, with expiry |
  | The set of pull requests merged on a past day | No | Lasting, with expiry; a fetched day is not fetched again |
  | The set of pull requests opened on a past day | No | Lasting, with expiry |
  | An unmerged pull request | State and lines change | Short-lived |
  | Today's pull requests | Grow | Short-lived |
  | The organization's member list | Changes | Short-lived |

  Lasting entries expire 7 days after they were stored, so that a pull
  request in a private repository the user can no longer see does not stay
  on screen for long; checking visibility on every display would defeat the
  purpose of the cache. Entries that fall out of the 14-day period are
  removed without waiting for expiry. The cache is kept per signed-in login
  and cleared on sign-out.
- **Fetching.** One GraphQL `search` per member and measure, with
  `author:<login>` and a date range. A search can page through at most 1,000
  results, which one member's 14 days stays well within. Requests count
  against the signed-in user's rate limit, which the cache keeps low. A
  GitHub App user token reaches only what both the user can see and the app
  is installed on; whether pull requests in a member's personal public
  repositories appear in search with such a token is to be confirmed when
  the pull-request list is built, and recorded here.

Link it from `README.md`'s Documentation list, and change README's
"broken down by member and by repository" bullet so it matches the unit
above.

### 2. `packages/gateway/github-api`

Add to `GitHubApiClient`, in the style of `getViewer` (same headers, a
`GitHubApiError` for a non-2xx response or a body of the wrong shape):

- `listOrganizationInstallations(accessToken)` — `GET /user/installations`,
  keeping installations whose `account.type` is `Organization`, returned as
  `{ login }` sorted by login. Follow pagination.
- `listOrganizationMembers(accessToken, org)` — `GET /orgs/{org}/members`,
  returned as `{ login, avatarUrl }` sorted by login. Follow pagination.

Pagination: request `per_page=100` and follow the `Link` header's
`rel="next"` until there is none. Write that once and share it between the
two methods. Cover both methods in `client.test.ts`, including a two-page
response and an error.

### 3. `packages/testing/api-mocks`

Extend `ApiMock` so the signed-in mock answers `GET /user/installations`
with one organization (`mock-org`) and `GET /orgs/mock-org/members` with a
few members including `mockLogin`, and `401` for a token it did not issue,
as `GET /user` does. Export the organization name and member logins so tests
can assert on them. `VITE_API_MOCK=1 make dev` must show the members after
the mock sign-in. Update the handler list in the class doc comment and the
"Running without the session API" section of `docs/guides/development.md`.

### 4. `packages/apps/web`

Add `src/features/members/` showing, once signed in, the organization's name
and its members (avatar and login). Call the API through
`SessionController.withAccessToken` so an expired token is refreshed. Show a
loading state, the "not installed" message, and an error message with a way
to retry when a request fails. With several organizations, show a `<select>`
of them. Render it in `App.tsx` below `SessionStatus`, only while signed in.
Nothing is cached yet.

Cover it in tests through the API mock, as `App.test.tsx` does: members
shown after sign-in; the not-installed message; an error shown when the
members request fails.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes.
- [x] `docs/design/activity-view.md` exists, the gateway calls
      `/user/installations` and `/orgs/{org}/members`, and the API mock
      answers `/user/installations` (`grep` gates in `check_command`).

### Before merge (verified outside the check command)

- [ ] `VITE_API_MOCK=1 make dev`: after the mock sign-in, the page shows
      `mock-org` and its members.
- [ ] Against the dev session API through the proxy
      (`docs/guides/development.md`, "Using a deployed session API"), signing
      in shows the real organization and its members.

## Out of scope

- Pull requests, caching, the summary table, and the chart.
- Any change to the session API or its contract.
