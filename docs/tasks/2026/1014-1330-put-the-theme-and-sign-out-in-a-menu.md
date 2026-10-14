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
branch: task/1014-1330-put-the-theme-and-sign-out-in-a-menu
created_at: 2026-10-14T04:30:32Z
updated_at: 2026-10-14T04:48:22Z
---

# feat(web): put the theme and Sign out in a menu at the header's right

## Overview

Signed in, the header bar shows `[avatar] org / login` and a "Sign out"
button at its right (`src/features/session/SessionStatus.tsx`), and the
footer shows "Powered by Yagura" and the theme control "Theme: System ·
Light · Dark" (`src/App.tsx`, `src/features/theme/ThemeControl.tsx`). The
sign-in screen shows the same theme control under its panel
(`src/features/session/SignInScreen.tsx`).

Neither Sign out nor the theme is used on every visit, so neither needs to
be in view all the time. This task moves both into one menu behind a
"more" (kebab, ⋮) button at the right end of the header, and drops the
theme control from the sign-in screen, where a visitor has no reason to
choose a theme.

### What it should look like

- **The header bar**: the tabs left, and at the right `[avatar] org /
  login` followed by the menu button. There is no "Sign out" button in the
  bar any more. The button shows a vertical ellipsis (⋮, drawn without an
  icon font or a new dependency, for example as text or inline SVG), is
  quiet like the rest of the bar, has an accessible name such as "Menu"
  and a visible focus ring, and its hit area is at least 32px square.
- **The menu** opens under the button, aligned to its right edge, on the
  surface colour with the card border and shadow already in `global.css`.
  It holds, from top to bottom:
  - the theme choice: a small "Theme" label and the three options System,
    Light and Dark, the current one marked (not by colour alone). Choosing
    one applies it at once, as the control does today, and stores it.
  - a separator, then "Sign out".
- **Behaviour**, following the WAI-ARIA menu button pattern: the button
  has `aria-haspopup` and `aria-expanded`; Enter, Space or a click opens
  the menu and moves focus into it; the arrow keys move between items;
  Escape closes it and returns focus to the button; a click outside or Tab
  away closes it. Choosing Sign out closes the menu and signs out. Choosing
  a theme may keep the menu open so the viewer can see the result, or
  close it; pick one and say which. A fitting structure is `role="menu"`
  with `menuitemradio` items for the themes (`aria-checked`) and a
  `menuitem` for Sign out, but any structure that is keyboard-operable and
  exposes the same names and states is fine.
- **Narrow widths**: at 375px the menu stays inside the viewport and
  nothing scrolls sideways. With Sign out gone from the bar, see whether
  the header now fits on one row at 375px (tabs left, identity and the
  button right, the identity shortened with an ellipsis as now). Use one
  row if it fits without cutting the organization and login down to a few
  characters; otherwise keep the current two rows. Say which.
- **The footer** shows only "Powered by Yagura".
- **The sign-in screen** has no theme control. The stored theme still
  applies there (the early script in `index.html` is unchanged).

### Constraints

- Keep the `ThemeController`, its storage key and the early script as they
  are; this task changes only where the choice is made.
- If `ThemeControl` has no remaining user, remove it and its styles rather
  than leaving it unused.
- Keep the names tests use where they still apply ("Sign out", "Theme",
  "System", "Light", "Dark"); update the tests that find Sign out as a
  button in the bar or the theme control in the footer or on the sign-in
  screen, so that they open the menu first.
- No new runtime dependencies, no web fonts, no inline `style` attributes
  for what a class can do. Comments are full-sentence English prose
  explaining intent, matching the existing files.
- Update `docs/design/activity-view.md` where it describes the header, the
  footer, the theme choice and the sign-in screen.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including tests that:
  - signed in, the header has a menu button and no visible "Sign out"
    button until the menu is opened;
  - opening the menu shows the theme options with the current one checked
    and "Sign out"; choosing Dark sets `data-theme="dark"` and stores it;
    choosing Sign out signs out and shows the sign-in screen;
  - Escape closes the menu and returns focus to the button;
  - the footer has no theme control, and the sign-in screen has none.

### Before merge (verified outside the check command)

- [ ] With `VITE_API_MOCK=1 make dev`, screenshots of the Activity page
      with the menu closed and open, at desktop width and at 375px, in
      light and dark, show the button at the header's right, the menu
      inside the viewport, and no horizontal scroll at 375px.
- [ ] Keyboard: Tab reaches the menu button with a visible focus ring;
      Enter opens the menu, the arrow keys move through the items, Enter
      chooses one, and Escape returns focus to the button.

## Out of scope

- Fitting the pull request list to the window's height (a separate task).
- Other menu items, or settings beyond the theme.
