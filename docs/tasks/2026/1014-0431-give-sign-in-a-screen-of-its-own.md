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
branch: task/1014-0431-give-sign-in-a-screen-of-its-own
created_at: 2026-10-13T19:31:17Z
updated_at: 2026-10-13T20:10:00Z
---

# feat(web): give sign-in a screen of its own

## Overview

Signed out, the app shows the same page frame as signed in, only empty.
The header bar holds a lone "Sign in with GitHub" button at its right
(`src/features/session/SessionStatus.tsx`), `<main>` is blank, and the
footer says "Powered by Yagura". The app's name is only a visually hidden
`h1` (`src/App.tsx`). A first-time visitor cannot tell what the page is or
why they should sign in.

This task gives the signed-out state a screen of its own, built for
signing in. The signed-in pages stay as they are.

### What it should look like

- **No page frame.** Signed out, there is no header bar and no tabs. The
  screen centres one panel, horizontally and vertically, in the viewport.
  The footer may stay under it or be dropped on this screen. Pick what
  looks better and say which.
- **The panel**, from top to bottom:
  - The app's name, "Yagura", as the visible `h1`, large: the one heading
    on this screen.
  - One line saying what it is: "See your organization's development
    activity on GitHub at a glance." This is the README's first line, and
    the two must say the same thing.
  - The primary "Sign in with GitHub" button, prominent.
  - A short muted note under the button that answers "what does signing
    in give it?": it sees only what you can already see on GitHub, reads
    and never writes, and the server stores nothing. Base it on the
    README's bullets and keep it to one or two short lines. Do not claim
    anything the README does not.
  - A sign-in failure (`state.error`, today a `role="alert"` paragraph
    beside the button) shows inside the panel, above the button, styled as
    an error with text, not colour alone.
- **The other states before the pages are drawn** use the same centred
  layout, so the screen does not jump between them:
  - `pending` (the session is being restored, with no last viewer to draw
    optimistically): the name and the line, with a muted "Loading…" in the
    button's place. It must not flash the button before a restored session
    replaces it.
  - The sign-in callback (`/callback`, `CallbackHandler`): the name and the
    line, with "Signing in…" in the button's place.
- **Signed in, nothing changes**: the header with the tabs and
  `[avatar] org / login  Sign out`, the cards, the footer, and the visually
  hidden `h1` "Yagura". Signing out returns to the sign-in screen.
- **Themes and widths:** light and dark from the tokens in `global.css`,
  adding tokens if needed, with both values. At 375px the panel fits with
  the usual side gutter and nothing scrolls sideways. The panel may sit on
  the surface colour with the card border and shadow already used for
  sections, or on the page background. Keep it quiet, in the same style as
  the rest of the app.

### Constraints

- Keep the roles and names that tests use: the "Sign in with GitHub"
  button, the `alert` for a sign-in error, and a heading named "Yagura"
  (now visible on this screen). Update tests that assumed the header holds
  the sign-in button, and add tests for the states above: signed out shows
  the name, the line and the button, and no `banner` or tabs; a sign-in
  error shows in the panel; pending shows "Loading…" and no button; the
  callback shows "Signing in…".
- Update `docs/design/activity-view.md` where it describes the signed-out
  page.
- No inline `style` attributes, no new dependencies, no web fonts.
  Comments are full-sentence English prose explaining intent, matching
  the existing files.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including tests that the signed-out screen shows
      the "Yagura" heading, the one-line description and the "Sign in with
      GitHub" button with no header banner or page tabs, that a sign-in
      error is shown as an alert on that screen, that the pending state
      shows "Loading…" without the button, and that the callback shows
      "Signing in…".

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, screenshots of the signed-out screen
      in light and dark at desktop width and in light at 375px show the
      panel centred, the name, the line, the button and the note, and no
      horizontal scroll at 375px. Signing in from it reaches the activity
      page, and signing out returns to it.
- [x] Keyboard: the "Sign in with GitHub" button is reachable by Tab and
      shows a visible focus ring.

## Out of scope

- A theme switch (a separate task).
- Changing the sign-in flow itself, the session API, or the signed-in
  pages.
