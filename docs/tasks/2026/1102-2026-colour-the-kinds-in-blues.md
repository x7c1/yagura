---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity, user-experience]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -q 'light-dark(#18b1cd, #0ed4f6)' packages/apps/web/src/global.css && grep -q 'light-dark(#504994, #7f78d6)' packages/apps/web/src/global.css && grep -q 'light-dark(#3280dd, #0754c6)' packages/apps/web/src/global.css && ! grep -qiE 'orange|magenta' docs/design/activity-view.md"
assignee: null
branch: task/1102-2026-colour-the-kinds-in-blues
created_at: 2026-11-02T11:26:42Z
updated_at: 2026-11-02T11:57:57Z
---

# feat(web): colour the kinds of merged pull requests in blues

## Overview

The "Merged PRs" chart stacks each day's bar by the kind of its pull
requests in four colours: `feat` in blue, `fix` in orange, the third kind
in magenta and `other` in grey (`--color-kind-*` in
`packages/apps/web/src/global.css`, described in
`docs/design/activity-view.md`). The three hues read as unrelated to one
another. This task gives the three kinds one family of blues, told apart
by their lightness, with a meaning to the lightness: `feat`, a welcome
change, is the brightest, and `fix`, the repair of something that went
wrong, the darkest.

### The colours

Replace the three tokens' values with these, and keep `other`'s grey as it
is:

| Token | Light | Dark | |
|---|---|---|---|
| `--color-kind-feat` | `#18b1cd` | `#0ed4f6` | a bright cyan |
| `--color-kind-fix` | `#504994` | `#7f78d6` | an indigo |
| `--color-kind-third` | `#3280dd` | `#0754c6` | a blue: mid in light, deep in dark |
| `--color-kind-other` | `#8c959f` | `#5d6670` | unchanged |

In a stack, a kind without merges that day takes no space, so any two of
the four can end up next to each other. The colours were checked for every
pair, not only for neighbours in the stacking order, under protanopia,
deuteranopia and tritanopia and in full colour, in both themes. In the dark
theme the third kind is a deep blue rather than a light one, as a light
blue sits too close to the cyan of `feat`. Some things do not meet the
earlier rules, on purpose:

- The light theme's cyan has about 2.6:1 contrast against the card, and the
  dark theme's deep blue about 2.8:1, both below 3:1. The legend names each
  kind, and each bar's accessible name and tooltip spell out its breakdown,
  so the colour is never the only way to read a segment.
- In the light theme the cyan and the grey of `other` are the closest
  pair: apart in full colour, and within the margin that counts on such
  secondary cues under deuteranopia.
- The lightness of the four is deliberately uneven, as it carries the
  meaning above.

### Code and docs

- Rewrite the comment above the tokens in `global.css` to describe the
  family of blues, the meaning of their lightness, the contrast exception
  and why it is acceptable, and that they stay apart from the grey and
  from the list's state badges.
- In `docs/design/activity-view.md`, rewrite the sentences about the
  colours ("blue, orange, magenta, and for `other` a grey", "Each has 3:1
  contrast …", "the three hues stay apart …") to match. The sentence that
  explains why a bar's count is written in the text colour refers to "the
  blue of `feat`"; keep the reason (a count drawn in a kind's colour right
  above that kind's segment reads as that kind's count) and drop the
  colour name.
- Any other comment or doc text in the repository that names the kinds'
  old colours is updated too.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `global.css` holds the new values for the three kinds (grep in the
      check)
- [x] `docs/design/activity-view.md` no longer names orange or magenta
      (grep in the check)
- [x] `make check` passes

### Before merge (verified outside the check command)

- [x] With `VITE_API_MOCK=1 make dev`, the bars and the legend show the
      cyan, indigo, blue and grey in both themes, and the four are told
      apart in both the column and the row layout
