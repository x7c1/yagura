---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -rq --exclude-dir=node_modules --exclude-dir=dist 'Updates appear within seconds' packages/apps/web/src/ && grep -rq --exclude-dir=node_modules --exclude-dir=dist 'Reload to update' packages/apps/web/src/ && grep -q 'Updates appear within seconds' docs/design/activity-view.md && ! grep -q 'The page never shows whether it is connected' docs/design/activity-view.md && grep -rqE --exclude-dir=node_modules --exclude-dir=dist '[\"'\\'']online[\"'\\'']' packages/apps/web/src/features/live-updates/"
assignee: null
branch: task/1028-0655-show-whether-the-page-is-live
created_at: 2026-10-27T21:55:00Z
updated_at: 2026-10-27T22:09:42Z
---

# feat(web): show in the header whether the page is live

## Overview

The page keeps itself up to date through a connection to the server's
signals (see "Live updates" in `docs/design/activity-view.md`), but it never
shows whether that connection is up: the design says "The page never shows
whether it is connected". A viewer, on a phone especially, cannot tell
whether an open page will show new activity within seconds or needs a
reload. This task replaces that rule with a small status dot in the header,
and makes the connection come back sooner after a phone has let it lapse.

### The dot (write it into `docs/design/activity-view.md`)

- **Where.** While signed in, the header shows the dot on the right, just
  before the organization's avatar and name. On a narrow screen, where the
  session takes a row of its own, the dot sits at the left end of that row.
  The signed-out screen has no dot.
- **States.** Three, told apart by shape as well as colour (never by colour
  alone):

  | State | Dot | Explanation | When |
  |---|---|---|---|
  | Live | filled, green | "Live. Updates appear within seconds." | subscribed to the viewer's channel |
  | Connecting | ring, amber | "Connecting…" | from asking for a signal token until subscribed, the first time and on reconnecting |
  | Not live | ring, grey | "Not live. Reload to update." | waiting to connect again after a failure or a dropped connection |

  Use the colour tokens of `global.css` (add tokens if none fit, with light
  and dark values that pass contrast against the header's background).
- **No flicker on load.** "Connecting" shows only when subscribing has not
  finished 3 seconds after connecting began; until then no dot is drawn. A
  connection normally subscribes within about a second.
- **No motion.** The dot does not blink or pulse.
- **Not live by build.** A build without the signal hosts and the
  development mode with the API mock show no dot, since they never connect.
- **The explanation.** The dot shows only itself; its explanation is a short
  toggletip:
  - pointing at the dot or focusing it with the keyboard opens it, and it
    closes when the pointer or focus leaves;
  - a tap or click opens it; tapping outside, Escape, or tapping the dot
    again closes it; Escape returns focus to the dot. This matches the
    header's menu button.
  - The dot has an accessible name that includes the state, and a change of
    state is not announced on its own (it would be noise).

### Coming back sooner

A phone may suspend a hidden tab's network without the socket ever
reporting that it closed, so the page would keep showing "Live" until the
keep-alive times out (5 minutes by default). To shorten that:

- When the tab becomes visible after being hidden for 1 minute or more, the
  page drops its connection and connects again at once (the dot goes
  through "Connecting"), besides fetching once as it does now. After a
  shorter absence it keeps the connection, as now.
- When the browser fires `online`, the page connects again at once if it is
  waiting to retry, without waiting out the back-off.

Update the "Losing the connection", "Being shown again" and "Failures"
bullets of "Live updates" to match, and remove the sentence that the page
never shows whether it is connected.

### Tests

- The dot's state follows the connection: none before 3 seconds, then
  "Connecting", "Live" once subscribed, "Not live" while waiting to retry,
  and back through "Connecting" to "Live"
- Subscribing within 3 seconds shows "Live" without ever showing
  "Connecting"
- No dot when signed out, without the signal hosts, or with the API mock
- The toggletip opens and closes on hover, focus, tap, tapping outside,
  Escape (focus returns to the dot) and a second tap
- Shown again after 1 minute or more hidden: the connection is replaced; after
  less, it is kept
- `online` while waiting to retry connects at once; `online` while connected
  does nothing

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-view.md` documents the dot and its three states,
      and no longer says the page never shows whether it is connected (grep
      in the check)
- [x] The web app has the dot's explanations (grep in the check) and reacts
      to `online` (grep in the check)
- [x] The tests listed above pass (`make check`)

### Before merge (verified outside the check command)

- [ ] With `make dev` against a backend that has no signal hosts, or with
      the API mock, the header shows no dot and nothing else in the header
      moves; the narrow layout keeps the names and the menu button in place
