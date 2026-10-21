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
branch: task/1022-0341-explain-failures-in-the-users-terms
created_at: 2026-10-21T18:41:00Z
updated_at: 2026-10-21T19:42:35Z
---

# fix(web): explain sign-in, sign-out and loading failures in terms of what happened to the person

## Overview

Several failures reach the screen as developer-facing text:

- `features/session/callback.ts` shows "The callback state does not match this
  sign-in" when the state check fails (for example, a stale or reused callback
  URL, or a sign-in started in another tab)
- a network failure shows the browser's bare "Failed to fetch"
- a failed refresh of the data shows "GitHub API responded 500 to POST /graphql"
- `features/session/SignInScreen.tsx` shows the same "Something went wrong."
  for a failed sign-in and a failed sign-out

Rewrite these so the person learns what happened and what they can do, in the
situations they are actually in: they cancelled on GitHub, the sign-in link was
stale or used twice, the network is down, GitHub or Yagura is failing, the
sign-out may not have ended the session.

- Keep the technical detail out of the visible text, but keep it in the
  console (`console.warn`) or the error's `cause`, so it is still available
  when debugging
- Give the session state the kind of the error (a small discriminated union,
  not a string), and let `SignInScreen` choose the message from the kind, so a
  failed sign-in and a failed sign-out read differently
- The data-loading failures (pull requests, members) say whether the shown
  data is stale and that the person can retry or reload, without naming HTTP
  methods, status codes or endpoints
- Where an action helps (try signing in again, reload), say it; do not add new
  buttons beyond what the screen already offers
- The UI stays in English. Keep messages short, one or two sentences
- List every old and new message in a table in the PR description (the PR body
  is written from the run reports, so state the table in the final report)
- Update the tests that assert on the old text

## Acceptance criteria

### Automated (pipeline-verified)

- [x] No visible text contains "callback state", "Failed to fetch", "responded", "POST /graphql" or an HTTP status code, covered by tests asserting the new messages
- [x] A failed sign-in and a failed sign-out show different messages on the sign-in screen, covered by a test
- [x] Cancelling on GitHub (`error=access_denied` on the callback) shows a message saying the sign-in was cancelled, covered by a test
- [x] `make check` passes
