---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -qE '\"react\": \"\\^19' packages/apps/web/package.json && grep -qE '\"react-dom\": \"\\^19' packages/apps/web/package.json && grep -qE '\"@types/react\": \"\\^19' packages/apps/web/package.json && grep -qE '\"@types/react-dom\": \"\\^19' packages/apps/web/package.json"
assignee: null
branch: task/1023-0245-upgrade-to-react-19
created_at: 2026-10-22T17:45:00Z
updated_at: 2026-10-22T17:53:25Z
---

# build(web): upgrade to React 19 and let Dependabot move React as one set

## Overview

`@yagura/web` is on React 18 (`react`, `react-dom`, `@types/react` and
`@types/react-dom` at `^18` in `packages/apps/web/package.json`). Dependabot
opened two separate major updates, #50 (`react` with `@types/react`) and #51
(`react-dom` with `@types/react-dom`). Neither can pass alone, because `react`
and `react-dom` must be on the same version, and #50 also fails type checking:

```
src/shared/element-width.tsx(53,12): error TS2322: Type 'RefObject<T | null>' is not assignable to type 'RefObject<T>'.
```

### Upgrade the four packages together

- Move `react`, `react-dom`, `@types/react` and `@types/react-dom` to their
  latest 19.x, and update `pnpm-lock.yaml`
- Fix what React 19 breaks. The known site is `useElementWidth` in
  `packages/apps/web/src/shared/element-width.tsx`: React 19 types `useRef<T>(null)`
  as `RefObject<T | null>`, so the returned `ref` type has to say so (and its
  callers have to accept it). Look for the other React 19 changes that apply
  here as well — the global `JSX` namespace (use `React.JSX`), `ref` callbacks
  that return a value, `useRef()` without an argument, removed APIs
  (`ReactDOM.render`, `findDOMNode`, string refs, `propTypes` / `defaultProps`
  on function components), and test helpers (`react-dom/test-utils`'s `act`
  moved to `react`)
- Do not silence a type error with a cast or `any`; make the types say what
  React 19 means

### Group React in Dependabot

So that the next React major arrives as one pull request instead of two that
cannot pass alone, add a group to `.github/dependabot.yml` that puts `react`,
`react-dom`, `@types/react` and `@types/react-dom` in one pull request for
every update type. Keep the existing `minor-and-patch` group for everything
else, and say why in a short comment, as the existing entries do.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `react`, `react-dom`, `@types/react` and `@types/react-dom` are at `^19`
      in `packages/apps/web/package.json`, and `make check` (build, typecheck,
      tests, lint, format, dependency rules) passes on them
- [x] `useElementWidth` and its callers type-check without a cast to the old
      `RefObject<T>`

### Before merge (verified outside the check command)

- [ ] `.github/dependabot.yml` has a group that keeps the four React packages
      in one pull request, and GitHub accepts the configuration (no Dependabot
      configuration error on the pull request)
- [ ] With `make dev` (the API mock), the sign-in screen, Activity (chart,
      heatmap, list and its filters) and Members render and respond, the theme
      menu switches themes, and the browser console shows no React errors or
      warnings
