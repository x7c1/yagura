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
branch: task/1022-0340-share-sign-out-failures-across-tabs
created_at: 2026-10-21T18:40:00Z
updated_at: 2026-10-21T18:53:45Z
---

# fix(web): tell every tab when a sign-out could not end the session, and never skip the DELETE a frozen tab owes

## Overview

Two gaps in how tabs of one browser share a sign-out, both in
`packages/apps/web/src/features/session/session-controller.ts`.

### Share a failed sign-out with the other tabs

Tabs only broadcast `"signed-out"`. When `DELETE /session` fails in the tab
that signed out, that tab shows the sign-in screen with the note that the
session may not have ended (`signOutUnconfirmedNote`), but every other tab
shows the plain sign-in screen. The refresh cookie may still be set, so the
next load of any of those tabs silently signs the person back in, with nothing
having told them in that tab.

- When `#endSession` fails for the sign-out that is still the latest one,
  broadcast that outcome over the same tabs channel, as a message distinct
  from `"signed-out"`
- A tab receiving it shows the same note on its sign-in screen as the tab that
  signed out, unless a later sign-out (here or elsewhere) has its own outcome,
  the same rule `#endSession` already applies locally
- A tab that receives the failure before the `"signed-out"` message (or
  without it) still ends up signed out with the note, not signed in
- Keep the message set small and typed; update the doc comments of `signOut`,
  `#signedOutElsewhere` and `#endSession` to describe the new message

### Never skip the DELETE that a frozen tab owes

`#signedOutElsewhere` sends `DELETE /session` when this tab's own refresh was
in flight and was answered with new tokens (`#refreshRenewed`). The `finally`
that clears `#refreshRenewed` can run before the `"signed-out"` message is
handled when the tab was frozen (a background tab whose tasks resume in a
different order), so the tab finds no refresh in flight and sends nothing,
leaving the rotated token's cookie in place.

- Keep the knowledge "a refresh answered with new tokens after the latest
  sign-out began" until it has been consumed by the sign-out handling, instead
  of dropping it in `finally`. For example, record the sign-out count at which
  the refresh started, and let `#signedOutElsewhere` decide from that whether
  a renewal happened since, rather than from whether a promise is still
  pending
- Cover the reordered case with a test: the refresh resolves with new tokens
  and its `finally` runs before the `"signed-out"` message is delivered; the
  tab must still send `DELETE /session`

## Acceptance criteria

### Automated (pipeline-verified)

- [x] A failed `DELETE /session` in one tab makes the other tabs show the sign-out-unconfirmed note, covered by a test
- [x] A later sign-out supersedes an earlier failure's note in every tab, covered by a test
- [x] A refresh renewed before the `"signed-out"` message is handled still leads to `DELETE /session`, even when the refresh's settle runs first, covered by a test
- [x] `make check` passes

### Before merge (verified outside the check command)

- [ ] On the development deployment, with two tabs open, signing out in one shows the sign-in screen in both (a person signs in for this)
