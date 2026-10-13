---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && test -n \"$(find packages/apps/web/src -name '*.module.css' | head -1)\""
assignee: null
branch: task/1013-1913-give-the-app-a-visual-design
created_at: 2026-10-13T10:13:08Z
updated_at: 2026-10-13T10:41:29Z
---

# feat(web): give the app a visual design with light and dark themes

## Overview

The app has no CSS at all. The header, the organization selector, the
summary table, the chart and the pull request list render in the browser's
default styles. That makes the page hard to scan, and scanning is what the
page is for: noticing at a glance who has been quiet and on which days work
stalled.

This task gives the app a consistent visual design. It changes no behaviour
and no data. Everything that shows today keeps showing, in the same order,
with the same text.

### Approach (decided)

- **CSS Modules plus design tokens.** One global stylesheet defines the
  tokens as CSS custom properties on `:root`: colour, spacing, type scale,
  radius and border. It also holds a minimal base (box-sizing, body font
  and background, link colour, focus ring). Each component that needs
  styling gets its own `*.module.css` next to it. Components use only token
  values, never raw colours or sizes.
- **No new runtime dependencies.** No CSS framework, no component library,
  no web fonts: use the system font stack, so nothing is requested from a
  third party. Vite already supports CSS Modules.
- **Light and dark from the OS.** `prefers-color-scheme: dark` switches the
  token values. Nothing else needs to know the theme.
- **The chart reads its colours from the tokens.** The SVG bars use
  `var(--…)` fills (or classes), so they follow the theme. Opened and merged
  each have their own colour token, used in the chart and anywhere else the
  two measures are told apart.

### What it should look like

Aim for a quiet, dense, readable dashboard, not a marketing page.

- **Header bar:** "yagura" on the left; the signed-in login and "Sign out"
  on the right. Signed out, the "Sign in with GitHub" button stands
  out as the one thing to do.
- **Page width:** the content is centred with a sensible maximum width (for
  example around 1100px) and comfortable side padding. At a phone width
  (375px) nothing scrolls horizontally except, if needed, the pull request
  list table inside its own scroll container.
- **Sections:** the organization name (and selector when there are several),
  the period line with its "Updating…" note or failure, the summary table,
  the chart, and the list. Each is set apart by consistent spacing and a
  clear section heading, without heavy boxes.
- **Tables:**
  - numbers right-aligned in tabular figures;
  - the total row distinguished;
  - row separators subtle;
  - the placeholder "…" cells styled consistently with numbers.
- **Pull request list:**
  - state shown as a small coloured badge (open, merged, closed), with
    colours that also work in dark mode;
  - additions in green and deletions in red, in tabular figures;
  - long titles wrap rather than stretching the table.
- **Chart:**
  - the existing layout and interaction stay as they are;
  - colours come from the tokens;
  - the selected bar is clearly marked;
  - the keyboard focus on a bar is visible.
- **Buttons and controls:** one button style (and a quieter variant for
  "Show all" and "Retry"). The `<select>` follows the theme.
- **Notices:**
  - the "Updating…" note is muted;
  - failures are clearly marked as errors (colour plus text, not colour
    alone), with their Retry button next to the message.
- **Contrast:** body text and numbers meet WCAG AA contrast against their
  background in both themes.
- **Focus:** every interactive element shows a visible focus ring.

### Constraints

- Keep the DOM roles, labels and text that tests query by: table names,
  headings and button names. Restyle; do not restructure what tests rely
  on. Where a wrapper element is needed for layout, add it without changing
  the roles.
- The space reserved for the "Updating…" note must keep the layout from
  moving, as it does now.
- No inline `style` attributes for anything a class can do.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, and at least one `*.module.css` exists in the web
      app (gate in `check_command`).

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, screenshots in light and in dark
      mode at desktop width, and in light mode at 375px width, show every
      section styled, no horizontal page scroll at 375px, and the chart
      following the theme. The screenshots are shown to the user, and the
      user approves the look before merge.
- [x] Keyboard: tabbing through the page shows a visible focus ring on the
      sign-out button, the organization selector (when present), the chart
      bars and the list links.

## Out of scope

- Showing the per-day counts on the chart (a separate task).
- Changing what the page shows or how it fetches.
