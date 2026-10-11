---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
retries_remaining: 1
check_command: "make check && grep -q 'YAGURA_SESSION_API_PROXY' packages/apps/web/vite.config.ts && grep -q 'YAGURA_SESSION_API_PROXY' packages/apps/web/.env.example && grep -q 'YAGURA_SESSION_API_PROXY' docs/guides/development.md"
assignee: null
branch: task/1011-1612-session-api-proxy
created_at: 2026-10-11T15:53:21Z
updated_at: 2026-10-11T16:00:21Z
---

# feat(web): proxy the session API through the dev server

## Overview

The dev server on `http://localhost:5173` can only sign in against a session
API that is same-site with it. The refresh token travels in a cookie set with
`SameSite=Lax` (see `docs/design/session-api.md`), so a session API on another
site, such as a deployed one, never receives it: the browser stores the cookie
for the API's origin and does not send it on a cross-site `fetch`, and sign-in
appears to succeed and then loses the session on reload. Today the only
same-site option is a session API running on `localhost:8787`.

Let the dev server proxy the session API instead. With the proxy, the app
calls `/session/*` on its own origin, Vite forwards the request to the
deployed API, and the cookie is stored for and sent to `localhost:5173`.
Browsers accept a `Secure` cookie from `http://localhost`, which they treat
as a secure context.

### 1. `packages/apps/web/vite.config.ts`

Read `YAGURA_SESSION_API_PROXY` with Vite's `loadEnv(mode, process.cwd(), "")`
(the third argument so that a variable without the `VITE_` prefix is loaded
from `.env.local` too). When it is set, configure `server.proxy` so that
requests under `/session` go to that URL with `changeOrigin: true`. Keep the
existing `port` and `strictPort` settings. Comment why the proxy exists (the
cookie is same-site only) and that the `Origin` header the API checks is left
as the browser sent it.

The variable has no `VITE_` prefix on purpose: the dev server reads it, the
app never does, and it must not end up in a build.

### 2. Environment files

- `packages/apps/web/.env.example`: list `YAGURA_SESSION_API_PROXY=` with a
  one-line comment saying it is read by the dev server only and that
  `VITE_YAGURA_SESSION_API` must then be `http://localhost:5173`.
- `packages/apps/web/.env.development` stays as it is; it keeps pointing the
  app at `localhost:8787`.

### 3. `docs/guides/development.md`

Add a section "Using a deployed session API" after "Running the app". Say why
a cross-site API cannot be used directly (the cookie, in two sentences), then
show the `.env.local` lines:

```sh
VITE_GITHUB_CLIENT_ID=<the client id of the GitHub App that API uses>
VITE_YAGURA_SESSION_API=http://localhost:5173
YAGURA_SESSION_API_PROXY=https://<host of the deployed session API>
```

Note that `.env.local` takes precedence over `.env.development` for
`VITE_YAGURA_SESSION_API` only when the value is set there, that the API
must allow the origin `http://localhost:5173`, and that the GitHub App the
API belongs to must list `http://localhost:5173/callback` as a callback URL.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes.
- [x] `vite.config.ts` reads `YAGURA_SESSION_API_PROXY`, `.env.example` lists it,
      and `docs/guides/development.md` documents it (`grep` gates in
      `check_command`).

### Before merge (verified outside the check command)

- [ ] With `YAGURA_SESSION_API_PROXY` pointing at a deployed session API whose
      GitHub App lists the localhost callback, `make dev` signs in, a reload
      keeps the session, and "Sign out" returns to the button.
- [ ] Without the variable, `make dev` still talks to `localhost:8787` directly
      (no proxy entry in the dev server's startup output).

## Out of scope

- Changing the cookie attributes or the session API contract.
- The production build; the proxy exists only in the dev server.
