---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -q 'importedAt' docs/design/activity-api.md && grep -q 'imported' docs/design/activity-api.md && grep -rq --exclude-dir=node_modules --exclude-dir=dist 'Importing the last 14 days' packages/apps/web/src/ && grep -q 'Importing the last 14 days' docs/design/activity-view.md"
assignee: null
branch: task/1027-1704-show-that-an-organization-is-being-imported
created_at: 2026-10-27T08:04:50Z
updated_at: 2026-10-27T08:19:16Z
---

# feat(web): say that an organization is still being imported instead of showing no members

## Overview

When the server starts serving an organization (the app was just installed,
or the server's store was just created), it takes a few minutes to import the
organization's members and the last 14 days of activity. Until then the
activity page draws an empty chart and says "No members of <org> are visible
to you.", which reads as a permission problem. The server now tells the app
whether an organization's import has finished, and signals open pages when it
does. This task documents that in the API contract and makes the page say
that the organization is being imported.

### The server side (write it into `docs/design/activity-api.md`)

- **`importedAt`** — `GET /activity` carries a top-level `importedAt`, and
  each organization in `GET /activity/organizations` carries one too. It is
  the time (UTC ISO 8601) the server last finished importing that
  organization's members and last 14 days, or `null` when it has not
  finished yet. It only moves forward. Once set it stays set; the server
  refreshes it every day.
- **`imported` signal** — when the server finishes importing an organization,
  it publishes `{ "kind": "imported", "organizationId": "<id>" }` on the
  channel of every viewer who can use that organization (and whose access it
  checked within the last five minutes). The existing activity signals keep
  their shape `{ "repositoryId", "pullRequestId", "kind" }`. Document the
  signal as a second kind next to the existing one.

### Behaviour (write it into `docs/design/activity-view.md`)

- While `importedAt` is `null`, the page shows a notice in place of "No
  members of <org> are visible to you.":
  "Importing the last 14 days of <org>. This can take a few minutes."
  Whatever data has already arrived is still drawn below the notice (the
  import fills the store one repository at a time).
- When `importedAt` is set, the page behaves as now (including "No members of
  <org> are visible to you." when there really are none).
- An `imported` signal for the organization on screen fetches again through
  the existing live-update path, so the notice goes away on its own. A signal
  for another organization does not fetch. Check how the live-update module
  reads a signal today: if it ignores or rejects payloads it does not know,
  make it accept the `imported` shape.
- The browser cache keeps `importedAt` with the rest of the response, so a
  page drawn from the cache shows the notice too until the fresh response
  says otherwise.
- The organization picker does not need to show the import state.

### Mocks

`VITE_API_MOCK=1 make dev` returns `importedAt` in both responses. Make it
possible to see the notice in mock mode (for example an organization in the
mock data whose `importedAt` is `null`), and say how in the mock's
documentation if there is any.

### Tests

- The notice shows while `importedAt` is `null`, with and without data
  already drawn, and replaces the "No members" message
- The page is unchanged when `importedAt` is set, including the real "No
  members" case
- An `imported` signal for the organization on screen fetches once; one for
  another organization does not; activity signals still fetch as before
- A response without `importedAt` (an older server) is treated as imported,
  so the page does not get stuck on the notice
- The cache round-trips `importedAt`

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-api.md` documents `importedAt` and the `imported`
      signal, and `docs/design/activity-view.md` documents the notice (grep in
      the check)
- [x] The web app shows "Importing the last 14 days of <org>…" (grep in the
      check)
- [x] Tests cover: the notice while `importedAt` is `null` and its absence
      when set; an `imported` signal for the organization on screen fetching
      once and one for another organization not fetching; a response without
      `importedAt` treated as imported; the cache keeping `importedAt`
      (`make check`)

### Before merge (verified outside the check command)

- [x] Built with the development settings and deployed to the development
      site. With the organization's import record removed on the development
      server, a signed-in page shows the notice. When the import runs again,
      the open page drops the notice within seconds without reloading

## Out of scope

- Showing the import state in the organization picker
- Showing progress (how many repositories are done)
</content>
</invoke>
