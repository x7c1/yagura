---
status: completed
pipeline_phase: null
plan: null
base_ref: null
perspectives: [completeness, clarity]
max_refine_rounds: 3
retries_remaining: 1
check_command: "make check"
assignee: null
branch: task/1015-0226-content-security-policy
created_at: 2026-10-14T17:26:38Z
updated_at: 2026-10-14T17:44:55Z
---

# feat(web): limit what the page may load and connect to with a Content Security Policy

## Overview

The page has no Content Security Policy. It is served from GitHub Pages,
which answers with no security headers of its own (only `server` and
`cache-control`) and lets a site set none. If a script ever got into the
page, through a dependency or a flaw yet unknown, nothing would stop it from
loading more code from anywhere or sending the access token in memory to any
host.

The page needs very little: its own scripts and styles, the GitHub API, the
session API, and the avatars GitHub serves. This task states exactly that in
a policy, delivered in the page itself, since the host cannot add headers.

### What it should do

- **A `<meta http-equiv="Content-Security-Policy">` in the built
  `index.html`**, as early in `<head>` as possible, before any script. It
  allows, and nothing more:
  - `default-src 'none'`
  - `script-src 'self'` plus a `sha256-…` hash of the early inline theme
    script in `index.html` (not `'unsafe-inline'`). The hash is computed at
    build time from the script's exact text, so that editing the script
    cannot silently break the policy.
  - `style-src 'self'` (the app uses CSS Modules and no inline styles; check
    that React or Vite inject none in the build, and add only what is truly
    needed if they do)
  - `img-src 'self'` plus the hosts GitHub serves avatars from
    (`https://avatars.githubusercontent.com`), and `data:` only if the build
    actually uses data URLs for images
  - `connect-src` with `https://api.github.com` and the session API's origin
    from `VITE_YAGURA_SESSION_API`, so that each build allows the API it is
    built for
  - `font-src 'self'`, `manifest-src 'self'` only if used, `base-uri 'none'`,
    `form-action 'none'`, `object-src 'none'`
- **Built per mode, in `vite.config.ts`** (for example with a small
  `transformIndexHtml` plugin), so that the production build carries the
  policy for its API. The development server and `VITE_API_MOCK=1` may relax
  what they need (Vite's own client, hot module reload over WebSocket,
  Mock Service Worker's `worker-src 'self'`), or carry no policy at all, but
  the production build must not inherit those relaxations. Say which you
  chose.
- `frame-ancestors` cannot be set from a meta tag; note in the docs that
  embedding cannot be refused on this host, and why that is acceptable
  (there is nothing on the page a framing site could trick a click into
  doing beyond signing out or choosing a theme).

### Constraints

- No new runtime dependencies. A build-time helper in `vite.config.ts` may
  use Node's `crypto`.
- Keep the early theme script working before the first paint.
- Update `docs/design/` or `docs/guides/deployment.md`, wherever the page's
  delivery is described, with the policy, how it is built, and its limits.
- Comments are full-sentence English prose explaining intent.

## Acceptance criteria

### Automated (pipeline-verified)

- [x] `make check` passes, including a test (for example over the output of
      the HTML transform, or over a production build of `index.html`) that:
  - the production policy contains exactly the directives above, with the
    session API's origin from the environment and the hash of the theme
    script as it is in `index.html`;
  - the production policy has no `'unsafe-inline'`, no `'unsafe-eval'` and no
    wildcard source.

### Before merge (verified outside the check command)

- [x] A production build served locally (`vite preview`) with
      `VITE_YAGURA_SESSION_API` set to the production API loads the sign-in
      screen with no CSP violation in the browser console, the theme script
      still applies a stored dark theme before paint, and a script injected
      from another origin is refused.
- [ ] After deployment, the live page signs in, draws the activity and the
      avatars, and the console shows no CSP violation (checked by the owner,
      since signing in needs their GitHub account).

## Out of scope

- Moving the page to a host that can send headers (and HSTS, frame-ancestors).
- Subresource integrity.
