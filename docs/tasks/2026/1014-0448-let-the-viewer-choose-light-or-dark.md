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
branch: task/1014-0448-let-the-viewer-choose-light-or-dark
created_at: 2026-10-13T19:48:16Z
updated_at: 2026-10-13T20:01:52Z
---

# feat(web): let the viewer choose light, dark or the system theme

## Overview

The app follows the operating system's colour scheme and nothing else.
`packages/apps/web/src/global.css` defines the light tokens on `:root`
and overrides them under `@media (prefers-color-scheme: dark)`. A viewer
who wants the other theme has no way to choose it in the app, and no way
to learn that it follows the OS at all.

This task adds a theme choice: System (the default, as today), Light or
Dark.

### Approach

- **Where the control is.** The control goes in the footer, after
  "Powered by Yagura", as a small labelled group: "Theme: System · Light ·
  Dark". It does not go in the header, which already takes two rows at
  375px and is kept for what is used on every visit. On the sign-in
  screen, which has no footer, the same control sits under the panel,
  quietly.
- **The control** is a group of three options with the current one
  marked, for example a radio group or three toggle buttons with
  `aria-pressed`. It is reachable and operable by keyboard, with a visible
  focus ring. Its accessible name is "Theme", and the options are named
  "System", "Light" and "Dark". It stays small and muted, in the footer's
  style.
- **How the theme applies.** The choice is set as `data-theme="light"` or
  `data-theme="dark"` on the root element. System removes the attribute.
  `global.css` keeps the media query for System and adds the same dark
  values under `:root[data-theme="dark"]`. An explicit Light also wins
  over a dark OS setting, so restructure the selectors to give that
  result without copying the dark token block twice by hand, if CSS
  allows it cleanly (for example
  `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }`
  together with `:root[data-theme="dark"] { … }`). `color-scheme` must
  follow too, so that native controls and scrollbars match.
- **Persistence.** Store the choice in `localStorage`, through the
  existing `KeyValueStore` / `WebStorageStore` gateway in
  `@yagura/browser`, under its own key. The theme is a preference of the
  browser, not of the signed-in viewer, so signing out keeps it (the
  viewer cache cleared on sign-out must not hold it).
- **No flash on load.** A viewer who chose Dark on a light OS must not see
  a light page flash before the app starts. Apply the stored choice
  before the first paint, for example with a small inline script in
  `index.html` that reads the same key and sets the attribute. Keep that
  script minimal, and make it tolerate a missing or blocked
  `localStorage`. Document the key in one place, so that the script and
  the gateway code cannot drift apart silently: a test that reads the key
  from both is enough.
- **Charts and badges** already read their colours from the tokens, so
  they follow. Check that nothing reads `prefers-color-scheme` directly
  in TypeScript.

### Constraints

- No new runtime dependencies, no web fonts, no inline `style`
  attributes for what a class can do. Comments are full-sentence English
  prose explaining intent, matching the existing files. The app's name is
  "Yagura" where it is shown as a name.
- Keep the roles and names existing tests use.
- Update `docs/design/activity-view.md` (or the design doc that describes
  the page frame) with the theme choice and where it lives.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including tests that:
  - the footer and the sign-in screen show a "Theme" control with System,
    Light and Dark, with System selected by default;
  - choosing Light or Dark sets `data-theme` on the root element and
    stores the choice, and choosing System removes the attribute and the
    stored choice;
  - a stored choice is applied on start;
  - signing out keeps the stored choice;
  - the key used by `index.html`'s early script is the same as the one
    the app uses.

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, screenshots show the control in the
      footer of the Activity page and under the sign-in panel, in light
      and dark, at desktop width and at 375px. Choosing Dark on a light OS
      setting turns the page dark, and reloading keeps it dark without a
      light flash. Choosing Light on a dark OS setting does the opposite.
      There is no horizontal scroll at 375px.
- [x] Keyboard: the theme options are reachable by Tab (or by arrow keys
      within the group) and show a visible focus ring.

## Out of scope

- More themes than light and dark, or a high-contrast theme.
- Moving other controls into a settings menu.
