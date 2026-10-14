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
branch: task/1015-0150-sign-out-every-tab
created_at: 2026-10-14T16:50:01Z
updated_at: 2026-10-14T17:14:48Z
---

# fix(web): sign out every tab of the browser, at once, and keep late answers from storing anything again

## Overview

Signing out today ends the session only in the tab where "Sign out" was
chosen. The flag and the access token live inside that tab's
`SessionController` (`src/features/session/session-controller.ts`), and no
other tab hears of it. Another tab of the same browser stays signed in: it
keeps its access token, keeps showing the private pull requests already
drawn, and a load still in flight there can write the browser cache
(`src/shared/viewer-cache.ts`) again after the signing-out tab cleared it.
On a shared computer this leaves the data the person meant to remove.

Sign-out also waits for `DELETE /session` before the page changes. The
server now also revokes the session's tokens at GitHub during that request,
which can take a few seconds more, so the page would sit unchanged after
the person chose "Sign out".

This task makes a sign-out end the session in every tab of the browser, at
once, and keeps answers that arrive later from storing anything.

### What it should do

- **At once, in the signing-out tab**: choosing "Sign out" forgets the
  access token, the last viewer and the viewer's cache entries as now, and
  shows the sign-in screen without waiting for `DELETE /session`. The
  request still goes out (after a refresh in flight has answered, as now,
  so that the refresh's cookie cannot outlive the deletion), and the tab
  keeps waiting for it in the background.
- **If `DELETE /session` fails** (the server could not be reached, or did
  not answer 2xx), the cookie may still be there, so the next load would
  sign the person in again. Say so on the sign-in screen, as the
  "Signed out locally, but …" note does now, in words a person
  understands (for example, that signing out could not reach the server and
  to try again). A failure of the server to revoke the token at GitHub is
  not reported to the page: the server answers 204 either way and records it.
- **In every other tab of the same browser**: the sign-out reaches it within
  a moment, through a browser gateway in `@yagura/browser` (a
  `BroadcastChannel`, with a memory version for tests, named and shaped like
  the other gateways). That tab forgets its access token, stops its timers
  (the refresh before expiry, the periodic update), drops what it shows,
  and shows the sign-in screen. It does not send `DELETE /session` again;
  the signing-out tab does that for the shared cookie. The one exception: if
  that tab had its own refresh in flight when the sign-out arrived, the
  refresh's answer can set the cookie again after the deletion (with the
  token GitHub rotated to). Such a tab waits for its refresh to settle and,
  if the refresh succeeded, sends `DELETE /session` itself, so that the
  rotated token is revoked and the cookie cleared too.
- **Late answers store nothing**: in every tab, a load or a refresh that was
  in flight when the sign-out arrived does not write the cache, the last
  viewer, or the tokens when it answers. Today a count of sign-outs
  (`#signOuts`) guards this inside one tab; the sign-out arriving from
  another tab must count the same way.
- **A tab that missed the message** (asleep, or opened in a browser without
  `BroadcastChannel`) still ends up signed out the next time it refreshes:
  the cookie is gone, so the refresh answers `401 invalid_session`, which
  already signs out. Check that this path also clears that tab's view.
- **Signing in again** in one tab after a sign-out works as now. Other tabs
  that are on the sign-in screen may stay there until reloaded; they do not
  need to follow a sign-in.

### Constraints

- Browser access goes through `@yagura/browser` gateways, as the dependency
  rules require. Add the channel there with a memory implementation for
  tests.
- Keep the session controller's existing guarantees and tests: the order of
  `DELETE /session` after a refresh in flight, the sign-out count, and the
  rule that a restore in flight no longer signs anyone in.
- No new runtime dependencies. Comments are full-sentence English prose
  explaining intent, matching the existing files.
- Update `docs/design/session-api.md` where it describes signing out, and
  `docs/design/activity-view.md` where it describes the sign-out and the
  browser cache, to say what a sign-out now ends (this tab, every tab of
  the browser, the session's tokens at GitHub) and what it does not (other
  devices).

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including tests that:
  - choosing "Sign out" shows the sign-in screen before `DELETE /session`
    answers, and `DELETE /session` is still sent after a refresh in flight
    has answered;
  - a failing `DELETE /session` shows a note on the sign-in screen;
  - with two controllers sharing a memory channel, cache and last-viewer
    store, signing out in one signs out the other: its access token is
    gone, its state is signed out, it sends no `DELETE /session`, and a
    load or refresh that answers afterwards writes nothing to the cache or
    the last viewer;
  - a tab that hears of a sign-out while its own refresh is in flight sends
    `DELETE /session` once that refresh has succeeded, and sends nothing
    when the refresh failed;
  - a tab whose refresh answers `401` after another tab signed out shows the
    sign-in screen and keeps nothing.

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, in a real browser with two tabs of the
      app signed in: signing out in one tab shows the sign-in screen at once,
      and the other tab shows it within a moment without a reload; the
      browser cache holds no entries of the viewer afterwards.

## Out of scope

- Revoking the token at GitHub (the server does it in `DELETE /session`).
- Ending sessions on other devices.
- Following a sign-in from another tab.
