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
branch: task/1014-0332-tidy-the-header-and-the-page-heading
created_at: 2026-10-13T18:32:33Z
updated_at: 2026-10-13T19:35:00Z
---

# feat(web): tidy the header, the page heading and the sections into one look

## Overview

The app has a visual design (tokens in `packages/apps/web/src/global.css`,
CSS Modules per component), but in daily use parts of it still look like
browser defaults, and parts that mean different things look alike:

- **The page tabs look like buttons.** In the header
  (`src/App.tsx`, `src/App.module.css`, `src/features/pages/PageTabs.*`)
  the current tab is a bordered box on the page background, nearly the same
  as the "Sign out" button at the other end of the bar. The other tab is
  plain text. At 375px the session part wraps onto a second row of its own,
  so the bar has three uneven rows.
- **The organization and the period are bare HTML.** Under the header, the
  organization's name is an `h2` and the period ("Oct 1 – Oct 14") is a bold
  paragraph below it (`src/features/members/OrganizationMembers.*`,
  `PeriodLine` in `src/features/pull-requests/MembersActivity.tsx`). Nothing
  ties them together, and the period does not say what it is.
- **The sections float.** "Per day", "Pull requests" and "Per member" are
  bare headings over their content (`src/shared/section.module.css`), so the
  page has no visible structure.
- **The list is noisy and inconsistent with the summary.** Every title in
  the pull request list is an underlined link, and the Author column has no
  avatar while the member summary table shows one per member.

This task makes these parts read as one design. It changes what the page
looks like, not what it shows or fetches, apart from the organization's
avatar below.

### Approach (decided with the user)

- **Underline tabs in the header.** Like GitHub's repository tabs: the tabs
  sit on the header's bottom edge, the current one marked by a thick
  underline in an accent colour and full-strength text, the others muted
  until hovered. No box, no border around a tab, so a tab can no longer be
  mistaken for a button. "yagura" stays on the left as the brand. On the
  right, the signed-in login and the "Sign out" button stay, but the button
  becomes the quiet variant so the bar's emphasis is on the tabs. At 375px
  the bar takes at most two rows: brand and session on the first, the tabs
  on the second, still underline-style and on the bar's bottom edge.
- **A one-line page heading band.** One row under the header holds, on the
  left, the organization's avatar (rounded square, about 24px) and its
  name, and on the right the period, worded as "Last 14 days · Oct 1 – Oct
  14" in muted text, with the "Updating…" note or the update's failure
  beside it. At a narrow width the period part wraps below the name. When
  there are several organizations, the selector stays in this band (beside
  or replacing the plain name; keep its label "Organization").
- **Sections as cards.** "Per day", "Pull requests" and "Per member" each
  become a card: the surface or page background, a subtle border, the
  medium radius, the heading inside the card at its top, consistent padding.
  Loading notes and failures shown in a section's place sit inside the same
  card shape, so the page does not change shape when data arrives. At 375px
  the cards keep a small padding and the pull request list still scrolls
  inside its own container, not the page.
- **The list quieter and matched to the summary.** Pull request titles are
  links in the text colour without an underline, underlined (and in the
  link colour) on hover and focus. The Author column shows the author's
  avatar (the same size and shape as in the member summary table) when the
  author is one of the members, from the members list already loaded; an
  author who is not a member shows the login alone.
- **The organization's avatar.** `GET /user/installations` already returns
  `account.avatar_url`. Add `avatarUrl` to `Organization` in
  `packages/gateway/github-api/src/client.ts` and to the mock in
  `packages/testing/api-mocks`. The installations list is cached in the
  browser for a short time (`short-lived-list.ts`), so a stored list from
  before this change has no avatar: treat a missing avatar as absent and
  show a neutral placeholder (for example the first letter on the surface
  colour) rather than a broken image, until the next fetch fills it.

### Constraints

- Use only the tokens in `global.css`; add tokens there when a new value is
  needed (for example an accent for the current tab or a card shadow), with
  values for both the light and the dark theme.
- Keep the roles, labels and text the tests query by: the `Pages`
  navigation and its links with `aria-current="page"`, the organization's
  name as a heading, the "Organization" combobox, the "Sign out" and
  "Sign in with GitHub" buttons, section headings, table names, the
  `status` role of the updating note, and the failure messages. Where the
  wording of the period line changes ("Last 14 days · …"), update the tests
  that read it.
- The room reserved for the "Updating…" note must still keep the band from
  moving when the note comes and goes.
- Contrast stays at WCAG AA in both themes, and every interactive element
  keeps a visible focus ring, including the tabs on the header's edge.
- No inline `style` attributes for anything a class can do. No new runtime
  dependencies, no web fonts.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including tests that `Organization` carries
      `avatarUrl` from `account.avatar_url`, that a stored organization
      without an avatar is drawn with a placeholder instead of an `img`
      with no source, and that an author who is a member is listed with
      their avatar and one who is not is listed without one.

### Before merge (verified outside the check command)

- [ ] With `VITE_API_MOCK=1 make dev`, screenshots of the Activity and the
      Members pages in light and dark at desktop width, and of the Activity
      page in light at 375px, show: underline tabs that do not look like
      the Sign out button, a header of at most two rows at 375px, the
      one-line heading band with the organization's avatar and "Last 14
      days · …", each section as a card, and no horizontal page scroll at
      375px. Needs a person: the user approves the look before merge.
- [ ] Keyboard: tabbing through the page shows a visible focus ring on
      both tabs, the Sign out button, the chart bars and the list links.

## Out of scope

- A menu under the login (avatar with a dropdown holding "Sign out"); the
  button stays visible in the bar.
- The chart's own drawing, and the keyboard order through its bars (a
  separate leftover).
- Changing what the pages show or how they fetch, beyond the organization's
  avatar.

