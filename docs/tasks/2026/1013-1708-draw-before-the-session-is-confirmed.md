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
branch: task/1013-1708-draw-before-the-session-is-confirmed
created_at: 2026-10-13T08:08:08Z
updated_at: 2026-10-13T08:33:23Z
---

# feat(web): draw the last viewer's cached activity before the session is confirmed

## Overview

The view now draws from the browser cache first, but only after the session
is restored. On every page load it waits for `POST /session/refresh` (the
access token lives only in memory) and then `GET /user` (to learn which
viewer's cache to read). That is two requests in a row, about 0.9 seconds,
before anything appears, even when everything to show is already in this
browser.

This task remembers in the browser who signed in last, and which
organization they were looking at. On a page load it draws that viewer's
cached activity at once, while the session is still being restored behind
it. When the restore says the session has ended, the drawn data goes away
and the sign-in screen appears.

How the tokens are held does not change. What changes is the order: the
view no longer waits for the session to be confirmed before drawing. In
some cases the previous view shows for a moment until the confirmation
returns, for example after signing out on another device or when the
session has expired. The data is already in this browser's IndexedDB, so
nobody sees anything they could not already read from this browser. This
trade-off has been accepted.

Read `features/session/session-controller.ts`, `SessionStatus.tsx`,
`App.tsx`, `main.tsx`, `shared/viewer-cache.ts` and
`features/members/OrganizationMembers.tsx` first, and
`docs/design/session-api.md` and `docs/design/activity-view.md` for the
current contracts.

### Behaviour

1. **Remember the last viewer.** When a viewer is signed in (after the
   callback or a restore), store their login in the browser as "the last
   viewer". Sign-out removes it. Use the IndexedDB store (`JsonStore`), with
   a key that cannot collide with any viewer's prefix (logins contain only
   letters, digits and hyphens), or `localStorage` through a
   `KeyValueStore`. Pick one and say why in a comment. A failure to read or
   write it behaves as if nothing were remembered, as the cache does now.
2. **Draw before the session is confirmed.** On a page load with no token
   in memory and a remembered last viewer, the session state becomes
   signed-in as that login at once, marked as not yet confirmed. The views
   draw from the cache exactly as they do when signed in. Restoring the
   session (`POST /session/refresh`, then finding the login) runs behind it.
   - Confirmed as the same login: the state becomes confirmed. Nothing on
     screen is redrawn because of the confirmation alone.
   - Confirmed as a different login (another account signed in on this
     browser): the state switches to that login, and the views redraw from
     that login's cache.
   - `401` from the session API (the session has ended): the state becomes
     signed-out, the drawn data is removed, and the last viewer is
     forgotten, so the next load does not draw it again. The viewer's
     cache entries stay; they are removed on sign-out as now.
   - Any other failure (network, `5xx`): the state becomes signed-out with
     the error, as now. The last viewer stays remembered.
3. **Requests wait for the token.** While the session is not confirmed,
   `withAccessToken` waits for the restore in flight and then runs, or
   fails with "The session has ended" if the restore signed out. The views'
   fetches therefore start as soon as the token arrives, not after a second
   render.
4. **Writes to the cache.** A not-yet-confirmed viewer may read the cache
   but must not write to it. `ViewerCache`'s `isCurrent` should become true
   only once the session is confirmed as that login. Writes attempted
   before that are dropped, and the fetch that follows the confirmation
   writes. The point is that an ended session never writes into the cache.
5. **The session controls.** While not confirmed, the header shows the
   remembered login and "Sign out" as when signed in. Signing out then
   behaves as now: it clears the viewer's cache, forgets the last viewer,
   and calls `DELETE /session`.
6. **Remember the selected organization.** Store the organization the
   viewer selects in the viewer's cache, under its own key. On the next
   load, select it if the (stored or fetched) installation list still
   contains it, otherwise the first one, as now.

### Documents

- `docs/design/session-api.md`: next to the paragraph on why the access
  token stays in memory, add that the app draws the last viewer's cached
  data before the refresh answers. Say what a viewer may briefly see when
  the session has ended, and why that discloses nothing new.
- `docs/design/activity-view.md`: in "The browser cache" (or the
  drawing-first section), mention the remembered last viewer and selected
  organization, and that nothing is drawn from the cache for a viewer who
  is not the last one until the session is confirmed.

### Tests

Through the API mock with a memory store, an injected clock, and a way to
hold the session API's refresh answer:

- With a remembered last viewer and their cached activity, the summary
  table and list show while the refresh is held. After release, the same
  data stays on screen, then updates as now.
- The refresh answering `401` removes the drawn data, shows the sign-in
  button, and forgets the last viewer. A second load draws nothing before
  the refresh.
- The refresh confirming a different login draws that login's cache, not
  the remembered one's.
- No cache write happens before the confirmation. A failed refresh leaves
  the cache as it was.
- Sign-out while not yet confirmed clears the viewer's cache and forgets
  the last viewer.
- The selected organization is restored on the next load. When it is no
  longer installed, the first organization is selected.
- With no remembered viewer, loading behaves as before: nothing is drawn
  until the session is restored.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the tests listed under "Tests".

### Before merge (verified outside the check command)

- [x] Against the dev session API through the proxy, with the cache within
      its short life: on reload, the summary table and the list are on
      screen before `POST /session/refresh` answers (the time the table
      first appears compared with the refresh's resource timing).
- [x] Against the dev session API, after ending the session from the page
      (`DELETE /session` sent with `fetch`, which clears the cookie): on
      reload, the cached view may show briefly, then the sign-in button
      shows; a further reload shows no cached data before the sign-in
      button.

## Out of scope

- Returning the login from the session API (a separate change replaces the
  `GET /user` call).
- Changing where or how tokens are kept.
