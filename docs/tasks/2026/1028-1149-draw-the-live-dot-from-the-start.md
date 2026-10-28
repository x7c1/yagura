---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -q 'Starting' docs/design/activity-view.md && ! grep -q 'until then no dot is drawn' docs/design/activity-view.md && grep -rq --exclude-dir=node_modules --exclude-dir=dist 'aria-describedby' packages/apps/web/src/features/live-updates/ && grep -rq --exclude-dir=node_modules --exclude-dir=dist -- '--color-starting' packages/apps/web/src/"
assignee: null
branch: task/1028-1149-draw-the-live-dot-from-the-start
created_at: 2026-10-28T02:49:22Z
updated_at: 2026-10-28T03:05:15Z
---

# fix(web): draw the live dot from the start so the header does not shift

## Overview

The header's live dot (see "Whether the page is live" in
`docs/design/activity-view.md`) draws nothing for the first 3 seconds of a
connection, and appears once subscribing finishes, about a second after a
load. On a narrow screen the dot sits at the left end of the session's row,
so its arrival pushes the organization's name and the login right by the
dot's width on every load. This task draws a quiet dot from the start
instead, so the row never moves, and settles two small gaps of the same
dot.

### A fourth look: Starting

- While the page is connecting and no other state is shown yet (the first
  3 seconds of the first connection, as now), the dot is drawn as
  **Starting**: filled, pale grey. It takes the place nothing took before;
  "Connecting" (amber ring) still shows only when subscribing has not
  finished after 3 seconds, so a load on a working network goes from the
  pale dot straight to the green one, the same shape changing colour.
- Its explanation is the same as Connecting's, "Connecting…", and its
  accessible name is "Connection: Connecting". It is a placeholder for a
  state not known yet, not a separate meaning for the viewer.
- Add a colour token `--color-starting` in `global.css`, with light and
  dark values, visibly paler than `--color-not-live` and still at least
  3:1 against the header's background in both themes.
- Starting shares Live's shape and differs from it by colour; say so in
  the design and why that is acceptable (it lasts a moment, and its name
  and explanation differ).
- No change where there is no dot: signed out, a build without the signal
  hosts, and the API mock draw none, from the start, as now. Stopping
  (signing out) removes the dot as now.

### The explanation reaches screen readers

The dot's accessible name carries the state, but the explanation's
sentence ("Reload to update." and so on) is not tied to the button. Tie it
with `aria-describedby` so that a screen reader reads the sentence too,
without announcing state changes on its own (keep that rule).

### Escape in the design

Escape also closes an explanation opened by pointing or focus (focus then
stays where it is; only after a press does it return to the dot). The
design mentions Escape only for a tap or click. Say both.

### Update `docs/design/activity-view.md`

In "Whether the page is live": add Starting to the table, replace "until
then no dot is drawn" with the pale dot, say that the row never shifts
because the dot is drawn from the start, and add the two points above.

### Tests

- Before the first status: the dot is drawn as Starting (with signal hosts),
  and none is drawn without signal hosts, with the API mock, or signed out
- Starting → Live when subscribing within 3 seconds, never showing
  Connecting; Starting → Connecting after 3 seconds; then as now
- The explanation is the button's description (`aria-describedby`) in each
  state
- Escape closes an explanation opened by pointing or focus without moving
  focus; after a press it returns focus to the dot (as now)

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `docs/design/activity-view.md` documents Starting and no longer says
      no dot is drawn at first (grep in the check)
- [x] The web app has the `--color-starting` token and ties the
      explanation with `aria-describedby` (grep in the check)
- [x] The tests listed above pass (`make check`)

### Before merge (verified outside the check command)

- [x] With `make dev` and the API mock, the header shows no dot and nothing
      else in it moves, at a wide and at a 390px width
