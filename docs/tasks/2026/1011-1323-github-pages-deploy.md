---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
retries_remaining: 1
check_command: "make check && grep -q 'actions/deploy-pages' .github/workflows/ci.yml && grep -q '404.html' .github/workflows/ci.yml && grep -q 'mockServiceWorker.js' .github/workflows/ci.yml && grep -q 'workflow_dispatch' .github/workflows/ci.yml && test -f docs/guides/deployment.md && grep -q 'deployment.md' README.md && grep -q 'VITE_API_MOCK' packages/apps/web/src/config.ts"
assignee: null
branch: task/1011-1323-github-pages-deploy
created_at: 2026-10-11T13:23:48Z
updated_at: 2026-10-11T13:33:47Z
---

# feat(web): deploy the app to GitHub Pages from CI

## Overview

The web app only runs from the dev server. Add a deploy job that publishes
the production build to GitHub Pages, make the build fail loudly when its
configuration is missing, and document what the repository owner sets up
outside the code (Pages settings, repository variables, DNS, the GitHub
App's callback URL).

The app is served under a custom domain whose session API lives on a
sibling host (`docs/design/session-api.md` describes the pair). Both values
reach the build as repository variables, so a fork can point its deployment
elsewhere without editing the workflow.

### 1. Deploy job in `.github/workflows/ci.yml`

Add a `deploy` job to the existing workflow, after `check`:

- `needs: check`, and runs only when `github.event_name == 'push' &&
  github.ref == 'refs/heads/main'` or `github.event_name ==
  'workflow_dispatch'`. Add `workflow_dispatch` to `on:` so a branch can be
  published by hand for verification.
- `permissions: { contents: read, pages: write, id-token: write }`,
  `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`,
  `concurrency: { group: github-pages, cancel-in-progress: false }`.
- Steps: checkout, `pnpm/action-setup@v4`, `actions/setup-node@v4` (Node 24,
  pnpm cache) as in `check`; `make deps`; build the app with
  `pnpm --filter @yagura/web build` and the environment
  `VITE_GITHUB_CLIENT_ID: ${{ vars.VITE_GITHUB_CLIENT_ID }}` and
  `VITE_YAGURA_SESSION_API: ${{ vars.VITE_YAGURA_SESSION_API }}`; then in
  `packages/apps/web/dist` copy `index.html` to `404.html` and delete
  `mockServiceWorker.js`; `actions/upload-pages-artifact@v3` with that
  directory; `actions/deploy-pages@v4` with `id: deployment`.
- Comment in the workflow why `404.html` exists (GitHub Pages serves it for
  paths it has no file for, which is how `/callback` reaches the app) and
  why the worker script is dropped (dev-only, see
  `docs/guides/development.md`).

Keep the `check` job unchanged. Pin action versions by major tag as the
existing steps do.

### 2. Fail at startup when configuration is missing

`packages/apps/web/src/config.ts` (`loadConfig`) falls back to empty
strings, so a build without `VITE_YAGURA_SESSION_API` sends requests to the
page's own origin and fails with `unexpected_response`. Change it:

- Add `readonly apiMock: boolean` to `Config`, true when `VITE_API_MOCK` is
  `"1"`. `main.tsx` reads `config.apiMock` instead of `import.meta.env`.
- `loadConfig()` throws an `Error` naming the variable when
  `VITE_YAGURA_SESSION_API` is empty, or when `VITE_GITHUB_CLIENT_ID` is
  empty and `apiMock` is false (mock mode accepts any client id).
- In `main.tsx`, replace `void main()` with a call that catches a rejected
  `main()` and writes the error's message as text into the `#root` element,
  so a bad build or a failed worker registration shows its reason instead of
  a blank page.

Tests in `config.test.ts` (Vitest, `vi.stubEnv`): the three failure cases
and the success case.

### 3. Documentation

Write `docs/guides/deployment.md` in English, for the repository owner:

- what the deploy job does and when it runs (push to `main`, or by hand);
- the repository variables `VITE_GITHUB_CLIENT_ID` and
  `VITE_YAGURA_SESSION_API`, and that they are public values;
- Pages settings: Source "GitHub Actions", the custom domain, "Enforce
  HTTPS";
- DNS: the custom domain is the apex of its own zone, so it needs `A` and
  `AAAA` records to the GitHub Pages addresses listed in GitHub's docs
  (link to the docs rather than copying the addresses);
- the GitHub App must list `https://<domain>/callback` as a callback URL;
- why `404.html` is a copy of `index.html`.

Link the guide from `README.md` next to the development guide.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, and `config.test.ts` covers the missing session
      API URL, the missing client id outside mock mode, the client id
      ignored in mock mode, and the success case.
- [x] `.github/workflows/ci.yml` has a `deploy` job using
      `actions/deploy-pages`, copies `index.html` to `404.html`, deletes
      `mockServiceWorker.js`, and lists `workflow_dispatch` as a trigger
      (`grep` gates in `check_command`).
- [x] `docs/guides/deployment.md` exists and `README.md` links it
      (`test -f` and `grep` in `check_command`).

### Before merge (verified outside the check command)

- [ ] GitHub Pages is enabled with Source "GitHub Actions", the custom
      domain is set with HTTPS enforced, and the two repository variables
      are set.
- [ ] `dig +short yagura.module.codes A` returns the GitHub Pages addresses,
      and `https://yagura.module.codes/` answers over TLS.
- [ ] The GitHub App lists `https://yagura.module.codes/callback` as a
      callback URL — needs a person: the App's settings belong to its owner.
- [ ] Running the `deploy` job by hand on this branch publishes the app, and
      at `https://yagura.module.codes/` "Sign in with GitHub" completes,
      a reload keeps the session, and "Sign out" returns to the button.
- [ ] The CI `check` job passes on the pull request.

## Out of scope

- Organization selection, pull-request queries, and charts.
- Moving the dev-only worker script out of `public/` (dropping it from the
  artifact is enough for now).
