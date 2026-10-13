---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check"
assignee: null
branch: task/1013-1817-take-the-login-from-the-session-api
created_at: 2026-10-13T09:17:15Z
updated_at: 2026-10-13T09:26:19Z
---

# feat(web): take the viewer's login from the session API instead of GET /user

## Overview

After every `POST /session` (sign-in) and `POST /session/refresh`, the app
calls `GET https://api.github.com/user` only to learn the signed-in login.
The two requests run one after the other, so a page load waits about 0.3–0.4
seconds longer to confirm the session than it needs to.

The deployed session API now returns the login itself. Both
`POST /session` and `POST /session/refresh` answer with a `login` field next
to the token. The server reads the login from GitHub once at sign-in, keeps
it in the encrypted refresh cookie, and returns it on every refresh without
calling GitHub again. A cookie issued before this change has no login in it.
For such a cookie, the server looks the login up once on the next refresh
and rewrites the cookie.

This task updates the contract document to say so and makes the app use the
returned login instead of `GET /user`.

### Contract (`docs/design/session-api.md`)

- Add `"login": "octocat"` to the `POST /session` response example. Say it
  is the GitHub login of the user the token belongs to. The
  `POST /session/refresh` response has the same shape, so add a sentence
  there saying that `login` is included as well.
- Say where the login comes from: the server asks GitHub once at sign-in and
  keeps it in the encrypted cookie. A cookie issued before `login` was added
  is upgraded on its next refresh. A login renamed on GitHub shows its old
  name until the user signs in again.
- `POST /session` can now also fail with `502 upstream_error` when GitHub's
  user lookup fails after the code exchange. No cookie is set in that case.
  Update the error table if it lists when `502` occurs.
- Update the cookie table's "Value" row to say that the cookie also holds the
  login.
- Update the paragraph near the top that says the app draws while "the
  refresh, and then the lookup of the login, run behind it". There is no
  separate lookup any more.

### App

1. `packages/gateway/session-api`: `SessionTokens` (or whatever the client
   returns for both endpoints) gains `login: string`. A response without a
   string `login` is an unexpected response, handled the same way as a
   response that lacks `access_token`.
2. `SessionController`: take the login from the session API's response on
   both the callback and the restore, and stop calling
   `githubApi.getViewer`. Everything else about the restore stays as it is:
   the remembered last viewer, the unconfirmed state, a confirmation for a
   different login, a `401`, and sign-out.
3. `getViewer` in `packages/gateway/github-api`: remove it, with its tests,
   if nothing else uses it.
4. `packages/testing/api-mocks`: the mock session API answers with `login`
   (the mock user's login). Drop the mock `GET /user` handler if nothing
   uses it any more. Update `docs/guides/development.md`, which lists the
   mocked endpoints.

### Tests

- The session API client parses `login` and rejects a response without it.
- Sign-in and restore make no `GET /user` request: count requests through
  the API mock. Existing tests that relied on `GET /user` are updated, not
  deleted, unless what they check no longer exists.
- Restore confirming a different login than the remembered one still
  switches to it.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including the tests listed under "Tests".
- [x] No source under `packages/apps/web/src` calls `getViewer` (a `grep`
      gate in `check_command` is not needed; the removal is checked by the
      type check once `getViewer` is gone).

### Before merge (verified outside the check command)

- [x] Against the dev session API through the proxy: a reload signs in with
      no request to `api.github.com/user`, and the header shows the right
      login.

## Out of scope

- Server changes. The deployed session API already returns `login`.
