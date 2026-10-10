---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
retries_remaining: 1
check_command: "make check && grep -rq 'strictPort: true' packages/apps/web/ && grep -rq 'port: 5173' packages/apps/web/"
assignee: null
branch: task/1010-1018-frontend-workspace-skeleton
created_at: 2026-10-10T10:18:38Z
updated_at: 2026-10-10T10:30:28Z
---

# feat: set up the frontend workspace skeleton

## Overview

yagura is a static single-page application: it signs the user in with
GitHub, calls the GitHub API directly from the browser with the user's own
token, and renders the organization's recent development activity. This task
lays down the workspace, tooling, and continuous-integration gate that every
later feature builds on. It deliberately ships no product behavior: the app
renders a placeholder page and nothing else.

Set up a pnpm workspace at the repository root with these parts:

- `packages/apps/web` — the Vite + React 18 + TypeScript application
  (`@yagura/web`). The dev server must listen on port 5173 with
  `strictPort: true`, because the GitHub App's registered callback URL is
  `http://localhost:5173/callback` and a fallback port would break sign-in
  later. Use `@vitejs/plugin-react`, Vitest with `jsdom` for this package,
  and `@testing-library/react`. The page renders the heading "yagura" and
  nothing more.
- Workspace layout and dependency rules that later packages slot into without
  reorganizing: `packages/apps/*`, `packages/ui/*`, `packages/gateway/*`,
  `packages/domain/*`, `packages/testing/*`, `packages/libs/*`
  (`pnpm-workspace.yaml` globs `packages/*/*`). Only `apps/web` exists
  now; do not create placeholder packages.
- `dependency-cruiser` configured at the root with rules that encode the
  layering: `apps` may import anything; `ui` may import only `libs`;
  `gateway` may import `domain` and `libs`; `domain` imports nothing from
  the workspace; `testing` may import `domain`, `gateway`, and `libs`;
  `libs` imports nothing from the workspace; no package imports `apps`.
  Also forbid circular imports. Wire it as a `depcruise` script at the root
  so it runs across the workspace.
- TypeScript with project references (`tsconfig.base.json` at the root,
  `tsc -b` in the build), strict mode on.
- ESLint 9 flat config with `typescript-eslint` at the root, Prettier for
  formatting with a `format:check` script, so CI rejects unformatted files.
- A `Makefile` with `deps` (`pnpm install --frozen-lockfile`), `dev`
  (starts the dev server), and `check` (depends on `deps`, then runs
  `pnpm -r build`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm -r lint`,
  `pnpm format:check`, `pnpm depcruise`). `make check` is the single
  canonical gate; CI runs exactly it.
- `.github/workflows/ci.yml` with one job named `check` that runs on
  pull requests to `main` and pushes to `main`: checkout, set up pnpm from
  the `packageManager` field in the root `package.json` (do not also pin
  a version in the action), set up Node 24 with the pnpm cache, then
  `make check`.
- `docs/guides/development.md` describing the prerequisites (Node 24, pnpm
  via Corepack), `make dev`, and `make check`. Add a "Documentation"
  section to `README.md` between "Status" and "License" that links to it.
  Leave the rest of the README as it is.

Pin `packageManager` to the pnpm version installed here (`pnpm@11.5.2`)
and commit `pnpm-lock.yaml`. Do not add a `CLAUDE.md`. Do not add any
sign-in, token, or GitHub API code; those are separate tasks.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` runs the build, typecheck, tests, lint, format check,
      and dependency-cruiser across the workspace and exits 0.
- [x] `packages/apps/web` has at least one Vitest test that renders the app
      and asserts the heading "yagura" is present.
- [x] The dependency-cruiser configuration forbids circular imports and
      encodes the layer rules listed in the overview, and `pnpm depcruise`
      passes on the current tree.
- [x] The Vite config sets `server.port` to 5173 and `server.strictPort`
      to true (`grep -rq 'strictPort: true' packages/apps/web/` and
      `grep -rq 'port: 5173' packages/apps/web/` are appended to
      `check_command`).

### Before merge (verified outside the check command)

- [ ] `make dev` serves the placeholder page at http://localhost:5173 and
      refuses to start when the port is taken instead of moving to another.
- [ ] The CI workflow runs on the pull request and its `check` job passes.

## Out of scope

- Sign-in, token handling, and any call to the GitHub API.
- Charts, routing, and UI components beyond the placeholder page.
- `CLAUDE.md` and any agent-specific files.
