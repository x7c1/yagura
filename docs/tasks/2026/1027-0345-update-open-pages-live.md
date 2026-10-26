---
status: completed
pipeline_phase: null
plan: null
base_ref: task/1027-0234-read-activity-from-the-api
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -q 'signal-token' docs/design/activity-api.md && grep -rq --exclude-dir=node_modules --exclude-dir=dist 'VITE_YAGURA_SIGNAL_REALTIME_HOST' packages/apps/web/ && grep -q 'VITE_YAGURA_SIGNAL_REALTIME_HOST' docs/guides/deployment.md"
assignee: null
branch: task/1027-0345-update-open-pages-live
created_at: 2026-10-26T18:45:00Z
updated_at: 2026-10-26T18:59:09Z
---

# feat(web): update an open page within seconds when new activity arrives

## Overview

The app reads activity from the Yagura API (`docs/design/activity-api.md`) and
only fetches it when the page loads. The backend now sends a signal to each
viewer whenever it records new activity in a repository that viewer can see,
over AWS AppSync Events (a managed WebSocket pub/sub). This task makes an open
page subscribe to the viewer's signals and fetch again when one arrives, so a
pull request that is opened, pushed to or merged shows up within seconds
without reloading.

### The server side (write it into `docs/design/activity-api.md`)

- **`POST /activity/signal-token`** (`Authorization: Bearer <token>`, no
  body, same CORS, `Cache-Control: no-store` and error shape as the other
  `/activity` endpoints; `401 invalid_token` is treated like an expired
  session) → `{ "token": "...", "expiresAt": "<UTC ISO 8601>", "channel":
  "/viewers/<user id>" }`. The token is opaque to the app, valid for 15
  minutes, and only good for connecting and subscribing to that one channel.
- **Signals.** The server publishes to `channel` when it records activity in
  a repository the viewer can see (and whose access it checked within the
  last five minutes). A signal carries ids only:
  `{ "repositoryId", "pullRequestId", "kind" }`. Nothing is kept: a signal
  sent while the page is not connected is lost, which is why the page fetches
  again after reconnecting and when it becomes visible.
- **Connecting.** The realtime endpoint is
  `wss://<realtime host>/event/realtime`. The connection and each
  subscription carry an authorization object `{ "host": "<HTTP host>",
  "Authorization": "<signal token>" }` as AppSync Events specifies for Lambda
  authorization (the connection sends it base64url-encoded in a
  `header-…` subprotocol alongside `aws-appsync-event-ws`). Check the exact
  message shapes (`connection_init`, `subscribe`, `data`, `ka`, errors)
  against the AppSync Events WebSocket documentation rather than guessing,
  and write down what the app relies on.
- A connection stays open for up to 24 hours even after its token expires;
  a new token is needed only to connect or subscribe again.

### Configuration

Two new build-time variables carry the AppSync Events hosts:
`VITE_YAGURA_SIGNAL_HTTP_HOST` and `VITE_YAGURA_SIGNAL_REALTIME_HOST` (plain
host names, no scheme). Both are optional: when either is missing the app
works as now and simply does not update live (so a build without them, and
the mock mode, keep working). The Content Security Policy allows
`connect-src wss://<realtime host>` only when the variable is set. Document
both in `docs/guides/deployment.md` next to the existing variables.

### Behaviour (add a "Live updates" section to `docs/design/activity-view.md`)

- Once the activity page has a signed-in viewer, get a signal token, connect,
  and subscribe to the returned channel. One connection per tab.
- On a signal, fetch the current organization and period again through the
  existing "Updating…" path and replace what is drawn in place. Collapse a
  burst of signals into one fetch (a push often arrives with several events),
  and never run two fetches for the same view at once. Do not highlight new
  rows; keep the list's scroll position and the chart's selection.
- When the connection drops (network, the 24-hour limit, a server close),
  reconnect with backoff and a fresh token, then fetch once. When the tab
  becomes visible again after being hidden, fetch once (and reconnect if the
  connection is gone). Do not show the connection state to the person.
- Signing out, the session ending, or switching to a view without a viewer
  closes the connection. A failed token request or connection is retried
  with backoff and never shown as an error; the page keeps working as a
  non-live page.
- Keep the WebSocket protocol behind a small module with a fake for tests
  (the app does not depend on an AppSync client library).

### Mocks

`VITE_API_MOCK=1 make dev` serves `POST /activity/signal-token`. Live
updates in mock mode are optional; if the mock does not provide a realtime
endpoint the page simply stays non-live.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-api.md` documents `POST /activity/signal-token`,
      the signal payload and the connection (grep in the check)
- [x] The web app reads `VITE_YAGURA_SIGNAL_REALTIME_HOST`, and
      `docs/guides/deployment.md` documents it (grep in the check)
- [x] Tests cover: the token request (bearer header, 401 → expired session);
      the connection and subscription messages, including the authorization
      object; a signal triggering one fetch, a burst collapsing into one, no
      overlapping fetches; reconnecting with a fresh token and fetching after
      it; fetching when the tab becomes visible; closing on sign-out; no live
      updates and no CSP entry when the variables are missing; the CSP
      allowing exactly the realtime host when set (`make check`)

### Before merge (verified outside the check command)

- [ ] Built with the development hosts and deployed to the development site,
      a signed-in page updates within seconds when a pull request in an
      allowed organization is pushed to — needs a person: signing in to
      GitHub is not done on the person's behalf

## Out of scope

- Fetching only what changed since the last response (the whole period is
  fetched again).
- Showing the connection state.
