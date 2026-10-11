---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
retries_remaining: 1
check_command: "make check && grep -rq 'S256' packages/ && ! grep -rqE --exclude='*handoff*' 'localStorage|sessionStorage' packages/apps/web/src packages/gateway"
assignee: null
branch: task/1010-1139-sign-in-with-github
created_at: 2026-10-10T11:39:01Z
updated_at: 2026-10-10T11:52:54Z
---

# feat(web): sign in with GitHub through the session API

## Overview

The app currently renders a placeholder heading. This task adds sign-in: the
user clicks "Sign in with GitHub", authorizes the GitHub App, and comes back
signed in, with their GitHub login shown on the page. The server side of this
flow already exists and is specified in `docs/design/session-api.md`; read
that document first, it is the contract this task implements against.

The flow is the OAuth web application flow with `state` and PKCE (S256):

1. **Start.** The app generates a random `state` and a PKCE `code_verifier`,
   derives the `code_challenge` with SHA-256 (Web Crypto), keeps both values
   where they survive the redirect (`sessionStorage` is the one allowed use
   of browser storage in this task, and only for these two short-lived
   values), and sends the browser to
   `https://github.com/login/oauth/authorize` with `client_id`,
   `redirect_uri`, `state`, `code_challenge`, and
   `code_challenge_method=S256`.
2. **Callback.** On `/callback`, the app reads `code` and `state` from the
   query, rejects a `state` that does not match the stored one, posts
   `{ code, code_verifier, redirect_uri }` to `POST /session` with
   `credentials: "include"`, keeps the returned access token **in memory
   only**, clears the stored `state` and verifier, and replaces the URL with
   `/` so the code never stays in the history.
3. **Reload.** When the app starts with no access token in memory, it calls
   `POST /session/refresh` once. `200` signs the user in silently; `401`
   means signed out, and the app shows the sign-in button. No other status
   is retried.
4. **Expiry.** The app tracks `expires_in` and refreshes before the token
   expires, or on the first `401` from the GitHub API, at most once per
   failure.
5. **Signed in.** The app calls `GET https://api.github.com/user` with
   `Authorization: Bearer <access token>` and shows `login` next to a
   "Sign out" button. Sign out calls `DELETE /session`, discards the token,
   and returns to the signed-out view.

Configuration comes from Vite env variables: `VITE_GITHUB_CLIENT_ID` and
`VITE_YAGURA_SESSION_API` (base URL of the session API, no trailing slash).
Add `packages/apps/web/.env.example` with both names and empty values, and
`packages/apps/web/.env.development` with `VITE_YAGURA_SESSION_API=http://localhost:8787`
and an empty `VITE_GITHUB_CLIENT_ID` (the developer fills the client id in a
gitignored `.env.local`). The `redirect_uri` is `window.location.origin +
"/callback"`; it is not configured separately.

Layout, following the workspace's layer rules (see `.dependency-cruiser.cjs`):

- `packages/gateway/session-api` (`@yagura/session-api`): the typed client
  for the three session endpoints. The only place that calls `fetch` for the
  session API. It takes `fetch` as a constructor argument so tests inject a
  fake. It turns non-`2xx` responses into a typed error carrying the
  `error` code from the response body.
- `packages/gateway/github-api` (`@yagura/github-api`): a typed client with
  just `getViewer(accessToken)` for now; the same `fetch`-injection shape.
  Later tasks add the GraphQL queries here.
- `packages/apps/web/src/features/session/`: the PKCE helpers (pure
  functions over Web Crypto, unit-tested with known vectors), the sign-in
  start, the callback handling, the in-memory token holder with expiry, and
  the React hook/context the page uses. Keep framework-free logic in plain
  modules and the React binding thin.
- `packages/apps/web/src/App.tsx` branches on `window.location.pathname`:
  `/callback` renders the callback handler, anything else the main view. No
  routing library yet; the organization screen task decides that.

Tests (Vitest): PKCE challenge derivation against a known verifier/challenge
pair; `state` mismatch is rejected and nothing is posted; a successful
callback stores the token in memory and clears `sessionStorage`; reload with
`401` from refresh shows the sign-in button; sign-out calls `DELETE /session`
and clears the token; the session-api client maps a `400 invalid_grant` body
to its typed error. Use injected `fetch` fakes, not MSW.

Do not store the access token or the refresh token anywhere but memory; the
refresh token is the server's cookie and the app never sees it. Do not add
`CLAUDE.md`. Keep `make check` as the single gate; register the two new
packages so `pnpm -r` and dependency-cruiser cover them.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes with the two new gateway packages included in
      build, typecheck, test, lint, format check, and dependency-cruiser.
- [x] PKCE uses S256 (`grep -rq 'S256' packages/` is appended to
      `check_command`) and the challenge derivation has a unit test with a
      known verifier/challenge pair.
- [x] Neither `localStorage` nor `sessionStorage` is referenced outside the
      PKCE/state handoff: the handoff lives in a module under
      `packages/apps/web/src/features/session/` whose file name contains
      `handoff`, and `! grep -rqE --exclude='*handoff*'
      'localStorage|sessionStorage' packages/apps/web/src packages/gateway`
      (appended to `check_command`) passes.
- [x] Tests cover: state mismatch, successful callback clearing the handoff,
      refresh `401` showing the sign-in button, sign-out, and the
      `invalid_grant` error mapping.

### Before merge (verified outside the check command)

- [x] With the backend from the companion repository running on
      `http://localhost:8787` and a real client id/secret, clicking
      "Sign in with GitHub" at `http://localhost:5173` completes the round
      trip and shows the GitHub login; reloading the page keeps the user
      signed in; "Sign out" returns to the button — needs a person: the
      backend's client secret is held by the maintainer.
- [x] The CI `check` job passes on the pull request.

## Out of scope

- Organization selection, pull-request queries, and charts.
- GitHub Pages deployment and the `/callback` fallback it needs (the SPA
  deployment task handles it).
- A routing library.
