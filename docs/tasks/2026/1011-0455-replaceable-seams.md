---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
retries_remaining: 1
check_command: "make check && test -d packages/testing/api-mocks && ! grep -rqE \"from ['\\\"](vitest|@testing-library)\" packages/testing && ! grep -rqE 'window\\.|sessionStorage|localStorage|setTimeout' packages/apps/web/src --exclude=main.tsx && grep -rq '\"msw\"' packages/apps/web/package.json packages/testing"
assignee: null
branch: task/1011-0455-replaceable-seams
created_at: 2026-10-11T04:55:49Z
updated_at: 2026-10-11T05:12:19Z
---

# refactor(web): make the network, storage, and browser seams replaceable

## Overview

The sign-in feature works, but every place it touches the outside world is
wired so that only a Vitest test can replace it. The network is faked by
injecting `fetch` (`packages/apps/web/src/testing/fake-fetch.ts`), and that
fake imports `vi` from Vitest, so it cannot run in the browser; there is no
way to start the app without the session API server. The PKCE handoff
(`packages/apps/web/src/features/session/handoff.ts`) calls the global
`sessionStorage` directly, so a storage failure cannot be driven from a
test. `App.tsx`, `CallbackHandler.tsx`, and `main.tsx` read
`window.location` and `window.history` directly, so the callback screen
cannot be rendered on its own, and `token-holder.ts` uses the global
`setTimeout`. This task rearranges those seams so that the app can run
against mocks in the browser, and tests can drive failures through
interfaces instead of global patches. Behavior visible to the user does not
change.

Three rules drive the layout:

1. **The network is replaced at the network layer, with MSW.** The gateway
   clients (`@yagura/session-api`, `@yagura/github-api`) keep calling the
   real `fetch`; Mock Service Worker intercepts it. Add
   `packages/testing/api-mocks` (`@yagura/api-mocks`) holding the MSW
   handlers for the three session endpoints and `GET /user`, with enough
   in-memory state that the sign-in flow completes: `POST /session` with any
   code marks the mock session signed in and returns tokens, refresh answers
   `200` while signed in and `401` otherwise, delete signs out, `GET /user`
   answers a fixed login for the mock token and `401` for any other. The
   same package exports a helper that stands in for the GitHub authorize
   page: given the authorize URL the app built, it returns the callback URL
   with a mock `code` and the `state` taken from that URL. Vitest uses the
   same handlers through `msw/node` (`onUnhandledRequest: "error"` replaces
   today's 599 route). The browser uses them through `msw/browser` when
   `VITE_API_MOCK=1`: `main.tsx` imports `@yagura/api-mocks` dynamically
   only in that mode, starts the worker, and uses the authorize stand-in as
   `navigate`. Commit the generated `mockServiceWorker.js` under
   `packages/apps/web/public/`. `@yagura/api-mocks` is a devDependency of
   `@yagura/web` and must not end up in the production bundle. Delete
   `packages/apps/web/src/testing/` once nothing uses it.
2. **Packages under `packages/testing/` do not import a test runner or a
   test-only library** (no `vitest`, no `@testing-library/*`), because dev
   mode and tests share them. Runner-specific wrappers such as `vi.fn` stay
   in test files.
3. **Only a gateway reads browser APIs.** Add `packages/gateway/browser`
   (`@yagura/browser`) and move every direct use of `window`,
   `sessionStorage`, and `setTimeout` behind interfaces defined there, with
   the browser implementation next to each and an in-memory implementation
   for tests and mock mode:
   - a string key-value store (the handoff's storage), with a
     `sessionStorage` implementation and a memory implementation;
   - the page location and history (origin, pathname, search, assign to a
     URL, replace the current entry), with a `window` implementation and a
     memory implementation;
   - a timer (schedule and cancel a callback after a delay), with the global
     implementation and a manual implementation that fires on demand.
   `SessionController` receives all three through its options.
   `CallbackHandler` and `App` get the location from the controller or
   from props; they no longer read `window`. `main.tsx` is the one place
   that touches `window`, to construct the browser implementations.

Tests to add or rewrite (Vitest, MSW handlers from `@yagura/api-mocks`):

- the existing controller and App scenarios (state mismatch, successful
  callback, refresh `401`, sign-out, `invalid_grant`) pass with MSW instead
  of the `fetch` fake, asserting request bodies through the handlers;
- a store whose write throws makes `signIn` end signed out with an error
  message and nothing navigated;
- a store whose read throws makes the callback end signed out with an error
  message and nothing posted to `POST /session`;
- the callback screen renders with a memory location set to
  `/callback?code=...&state=...`, without touching `window`;
- the token refresh fires when the manual timer is advanced, without fake
  timers.

Documentation: in `docs/guides/development.md`, add a "Running without the
session API" section for `VITE_API_MOCK=1 make dev`, and state under
"Running the app" that `http://localhost:5173/callback` must be registered
as a callback URL of the GitHub App. Add `VITE_API_MOCK` to
`packages/apps/web/.env.example`. Add the two new packages' layers to the
"Workspace layout" table only if the table changes.

Keep `make check` as the single gate and register the two new packages so
`pnpm -r` and dependency-cruiser cover them. The dependency rules in
`.dependency-cruiser.cjs` already allow `apps` to import `testing` and
`testing` to import `gateway`; do not loosen them. Do not add `CLAUDE.md`.
Do not store tokens anywhere but memory; the refresh token stays the server's
cookie.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes with `@yagura/api-mocks` and `@yagura/browser`
      included in build, typecheck, test, lint, format check, and
      dependency-cruiser.
- [x] `packages/testing/api-mocks` exists and depends on `msw`, and nothing
      under `packages/testing` imports `vitest` or `@testing-library/*`
      (`test -d`, `grep '"msw"'`, and the negative `grep` are appended to
      `check_command`).
- [x] Outside `main.tsx`, nothing under `packages/apps/web/src` references
      `window.`, `sessionStorage`, `localStorage`, or `setTimeout` (the
      negative `grep` with `--exclude=main.tsx` is appended to
      `check_command`).
- [x] Tests cover: the five existing sign-in scenarios on MSW, a throwing
      store write during sign-in, a throwing store read during the callback,
      the callback screen rendered from a memory location, and the refresh
      fired by the manual timer.

### Before merge (verified outside the check command)

- [ ] With no session API server running, `VITE_API_MOCK=1 make dev` serves
      an app where "Sign in with GitHub" completes without leaving
      localhost and shows the mock login; reloading keeps it signed in;
      "Sign out" returns to the button.
- [ ] With the session API server on `http://localhost:8787` and the real
      client id/secret, the real round trip still works: sign in shows the
      GitHub login, a reload keeps it, sign out returns to the button —
      needs a person: the server's client secret is held by the maintainer.
- [ ] The CI `check` job passes on the pull request.

## Out of scope

- Validating `VITE_YAGURA_SESSION_API` at startup (the production build
  workflow decides how configuration errors surface).
- Storybook, a routing library, and GitHub Pages deployment.
- Organization selection, pull-request queries, and charts.
