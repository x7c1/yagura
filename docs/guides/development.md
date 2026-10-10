# Development

## Prerequisites

- Node.js 24
- pnpm, through Corepack. The version is pinned by the `packageManager`
  field in `package.json`; run `corepack enable` once and Corepack provides
  the matching pnpm.

## Running the app

```sh
make dev
```

This installs nothing; run `make deps` first on a fresh checkout. The dev
server listens on http://localhost:5173 and refuses to start if that port is
taken, because sign-in redirects back to that exact address.

## Checking changes

```sh
make check
```

This installs dependencies from the lockfile, then runs the build, type
check, tests, lint, format check, and dependency rules across the workspace.
It is the same gate CI runs on every pull request. Run `pnpm format` to fix
formatting.

## Workspace layout

Packages live at `packages/<layer>/<name>`. The layers and what each may
import from the rest of the workspace:

| Layer     | May import                  |
| --------- | --------------------------- |
| `apps`    | anything                    |
| `ui`      | `libs`                      |
| `gateway` | `domain`, `libs`            |
| `domain`  | nothing                     |
| `testing` | `domain`, `gateway`, `libs` |
| `libs`    | nothing                     |

No package imports `apps`, and circular imports are forbidden. The rules are
enforced by dependency-cruiser (`pnpm depcruise`, configured in
`.dependency-cruiser.cjs`).
