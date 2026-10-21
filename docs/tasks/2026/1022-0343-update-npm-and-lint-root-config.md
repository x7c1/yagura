---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -q 'package-ecosystem: npm' .github/dependabot.yml"
assignee: null
branch: task/1022-0343-update-npm-and-lint-root-config
created_at: 2026-10-21T18:43:00Z
updated_at: 2026-10-21T21:04:36Z
---

# ci: let Dependabot update npm, lint the root config files, and make the web tests stable under load

## Overview

### Let Dependabot update npm

`.github/dependabot.yml` only watches `github-actions`, so ESLint, TypeScript
and the other npm dependencies are never proposed for update.

- Add `package-ecosystem: npm` for the workspace root (`/`; pnpm workspaces are
  read from the root lockfile)
- Weekly. Group minor and patch updates into one pull request
  (`groups` with `update-types: [minor, patch]`); majors stay separate
- Explain the choices in a short comment, as the existing entry does

### Lint the root config files

`pnpm -r lint` runs per package, so the root `eslint.config.js` and
`.dependency-cruiser.cjs` are only checked by Prettier. Add a root lint step
that `make check` runs (for example a root `lint` script that lints the root
config files with the root ESLint config), and fix what it reports.

### Make the web tests stable under load

`packages/apps/web/src/browser-cache.test.tsx` and
`packages/apps/web/src/features/pull-requests/PullRequests.test.tsx` failed 3
times in 24 runs when 8 runs were in parallel: `findByRole` timed out. A plain
`make check` does not reproduce it.

- Reproduce first, for example by running the web package's tests repeatedly
  with several processes in parallel, and find what takes long under load
- Fix the cause rather than raising timeouts blindly: wait on the condition the
  test actually depends on, avoid real timers or real delays, and avoid work
  that grows with the machine's load. If a longer wait is truly the right fix,
  scope it to the one query and explain why in a comment
- Report the reproduction command and the before/after failure counts

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `dependabot.yml` has an npm entry for the root, weekly, with minor and patch grouped
- [x] `make check` lints `eslint.config.js` and `.dependency-cruiser.cjs` with ESLint
- [x] `make check` passes

### Before merge (verified outside the check command)

- [ ] Running the web tests 24 times, 8 in parallel, fails 0 times
- [ ] `dependabot.yml` passes GitHub's validation (no Dependabot configuration error on the pull request)
