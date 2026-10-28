---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: null
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check && grep -Eq '\"msw\": \"\\^3\\.' packages/apps/web/package.json && grep -Eq '\"msw\": \"\\^3\\.' packages/testing/api-mocks/package.json && ! grep -q 'dependency-name: msw' .github/dependabot.yml && ! grep -rq --exclude-dir=node_modules --exclude-dir=dist 'onUnhandledRequest' packages/"
assignee: null
branch: task/1028-0325-upgrade-to-msw-3
created_at: 2026-10-28T03:25:08Z
updated_at: 2026-10-28T04:25:20Z
---

# test(web): upgrade to MSW 3 and make the tests wait for the state they expect

## Overview

The workspace is held on MSW 2 (`msw` `^2.15.0` in
`packages/apps/web/package.json` and `packages/testing/api-mocks/package.json`),
and `.github/dependabot.yml` ignores MSW's major updates (#57). This task
upgrades both packages to MSW 3 and makes the web tests robust to it, then
drops the ignore entry together with its comment.

### Why MSW 3 was held back

In MSW 3, the Node interceptor picks the handler when the request reaches
the connection, not when `fetch` is called, so a few more turns pass between
`fetch` and the handler's response. The tests have waits that race with the
responses, and the delay widens those races: when several test runs share a
machine (8 runs in parallel, 24 times each), 190 of 192 runs had some
failure, while MSW 2 had 0 of 120 under the same load after #48.

The failing files were `browser-cache.test.tsx`, `pages.test.tsx`,
`DailyChart.test.tsx`, `MemberSummaryTable.test.tsx`,
`PullRequests.test.tsx`, `last-viewer.test.tsx`,
`OrganizationMembers.test.tsx` and `App.test.tsx`. The main errors:

- `Found multiple elements with the text: /^Loading/`
- a list that should be empty has 20 items
- the chart's group is not found
- `Updating…` does not disappear
- duplicate pull request ids

### What an earlier attempt found

An earlier attempt (not pushed) made these changes; redo them:

- Rename `onUnhandledRequest` to `onUnhandledFrame` in `server.listen`
  (`packages/apps/web/src/test-setup.ts`) and wherever else MSW 3 renamed
  options.
- Regenerate `packages/apps/web/public/mockServiceWorker.js` with
  `pnpm --filter @yagura/web exec msw init` (see `docs/guides/development.md`).
- Remove the `msw` entry from `allowBuilds` in `pnpm-workspace.yaml` if MSW 3
  no longer has a postinstall script; keep it, with its comment, if it does.
- In `test-setup.ts`, wrap `fetch` so that `afterEach` waits until every
  request a test started has reached MSW or been answered. Otherwise a
  request left by one test is recorded by the next test's mock.
- MSW 3 in Node cannot observe a request's `credentials`, so drop it from
  `RecordedRequest`. `credentials: "include"` stays covered by the gateway's
  `client.test.ts`; check that it does.
- `App.test.tsx:368-373` waited only until `cache.keys` was non-empty and
  signed out before the activity response arrived. Wait until the number of
  keys is the one expected.

### The fix

The wrapper alone did not make the tests pass under load. In each test of
the files above, find the waits whose condition is "something appeared"
(a `findBy…`, a `waitFor` on a partial state, a check right after the first
render) and change them to wait for the state the test expects to be
complete: the loading text gone, the expected number of rows, the response
recorded. Do not add sleeps or retries, and do not raise timeouts to hide a
race.

Reproduce under load before and after the fix. With 4 CPUs, this runs the
web tests 4 times in parallel, 10 rounds:

```sh
cd packages/apps/web
for r in $(seq 10); do
  for i in 1 2 3 4; do (pnpm exec vitest run >/tmp/msw3-$r-$i.log 2>&1 || echo "fail $r-$i") & done
  wait
done
```

Update `docs/guides/development.md` if anything it says about MSW changes
(for example the `msw init` step or `allowBuilds`).

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `msw` is `^3.x` in `packages/apps/web` and `packages/testing/api-mocks`
      (grep in the check)
- [x] `.github/dependabot.yml` no longer ignores `msw` (grep in the check)
- [x] No `onUnhandledRequest` remains in `packages/` (grep in the check)
- [x] Build, type check, tests, lint, format and dependency rules pass
      (`make check`)

### Before merge (verified outside the check command)

- [x] Under the load above (4 parallel × 10 rounds of the web tests), the
      branch has 0 failing runs, and `main` (MSW 2) is measured the same way
      on the same day for comparison; both counts are recorded in the PR
- [x] With `VITE_API_MOCK=1 make dev`, the app signs in with the mock and
      shows `mock-labs`'s members and pull requests (the regenerated browser
      worker works)

## Out of scope

- Changing what the app does; only tests, test setup and the MSW upgrade
  change.
- Other dependency upgrades.
