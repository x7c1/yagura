# Deployment

The web app is a static site. This repository builds and checks it but does
not publish it: the deployment that serves the app builds a chosen commit
and uploads the output to its host. Its session API runs on a sibling host
of the app's domain (see [Session API](../design/session-api.md)); this
guide covers only the web app.

## Build configuration

The build reads two variables:

| Variable                  | Value                                                 |
| ------------------------- | ----------------------------------------------------- |
| `VITE_GITHUB_CLIENT_ID`   | The GitHub App's client id                            |
| `VITE_YAGURA_SESSION_API` | Base URL of the session API, without a trailing slash |

Both end up in the JavaScript the site serves, so they are public values,
not secrets. The app refuses to start, and says which variable is missing,
when either is empty.

```sh
make deps
VITE_GITHUB_CLIENT_ID=... VITE_YAGURA_SESSION_API=https://api.example.com \
  pnpm --filter @yagura/web build
```

The output is `packages/apps/web/dist`. Remove `mockServiceWorker.js` from
it before uploading; that script is only used when developing with
`VITE_API_MOCK=1` (see [Development](development.md)).

## What the host has to do

- **Serve the app for every app path.** The app is a single page: every
  path, including `/callback`, is served by `index.html`, which then reads
  the path itself. The host answers a path that names no file in the build
  with `index.html` and status 200. Every file in the build has an
  extension, so a host can treat a path whose last segment has no `.` as an
  app path and still answer a missing file (`/assets/old.js`) with 404.
- **Send the headers a page cannot set itself.** The page carries its own
  Content Security Policy (below), but a meta element cannot say
  `frame-ancestors`. To keep other sites from framing the page, the host
  sends `Content-Security-Policy: frame-ancestors 'none'`, and
  `X-Frame-Options: DENY` for older browsers. It also sends
  `Strict-Transport-Security`.
- **Keep `index.html` fresh.** The files under `assets/` have content
  hashes in their names and can be cached for good; `index.html` names
  them, so it is served without long caching.

## GitHub App callback URL

Sign-in redirects back to `https://<domain>/callback`. GitHub refuses to
redirect anywhere the GitHub App does not list, so add that URL to the
App's callback URLs, next to `http://localhost:5173/callback` used in
development.

## Content Security Policy

The page carries its Content Security Policy itself, in a
`<meta http-equiv="Content-Security-Policy">` placed in `index.html` right
after the charset declaration, ahead of every script. It limits what a
script that got into the page, through a dependency or a flaw yet unknown,
could load or where it could send the access token. For a build with
`VITE_YAGURA_SESSION_API=https://api.yagura.module.codes` it reads:

```text
default-src 'none'; script-src 'self' 'sha256-…'; style-src 'self';
img-src 'self' https://avatars.githubusercontent.com;
connect-src https://api.github.com https://api.yagura.module.codes;
font-src 'self'; base-uri 'none'; form-action 'none'; object-src 'none'
```

- `script-src` allows the app's own scripts and, by its SHA-256 hash, the
  inline script in `index.html` that applies the stored theme before the
  first paint. No other inline script runs.
- `style-src` allows the app's own stylesheet. The app styles itself with
  CSS Modules and sets no inline styles.
- `img-src` allows the avatars GitHub serves.
- `connect-src` allows the GitHub API and the origin of
  `VITE_YAGURA_SESSION_API`, so each build allows the session API it is
  built for. A build without that variable allows no session API; the app
  refuses to start in that case anyway.

### How it is built

`packages/apps/web/content-security-policy.ts` is a Vite plugin that adds
the policy when `index.html` is built. It hashes each inline script from its
exact text at build time, so editing the theme script updates the hash
rather than leaving the policy to refuse the script. A test
(`content-security-policy.test.ts`) checks the production policy directive
by directive and that it allows no `'unsafe-inline'`, no `'unsafe-eval'` and
no wildcard.

The plugin applies to builds only. The dev server (`make dev`) carries no
policy, since it injects scripts and styles of its own and reloads over a
WebSocket; leaving it without a policy keeps those relaxations out of any
build. A build with `VITE_API_MOCK=1`, which is for development only, also
allows `worker-src 'self'` for Mock Service Worker and `data:` images for
the mocks' avatars.

Since the dev server carries no policy, a change that makes the page load
or connect to something new (another host, an inline style, a `data:`
image) works in `make dev` and is refused only once built. To see such a
change under the policy, build the app and serve the build locally, then
watch the browser console for violations:

```sh
pnpm --filter @yagura/web build
pnpm --filter @yagura/web exec vite preview
```

The build reads `VITE_YAGURA_SESSION_API` and `VITE_GITHUB_CLIENT_ID` as
the deployed one does; set them in the environment or in
`packages/apps/web/.env.local`. A new source the page truly needs belongs
in `content-security-policy.ts`, with its test.

The preview is served from `http://localhost:4173`, an origin a deployed
session API does not allow (see
[Origins](../design/session-api.md#origins)), so the session restore the
page attempts on load fails there with a CORS error. That error is not a
policy violation: a violation is reported as a refusal that names the
Content Security Policy directive it breaks.

### Limits

- `frame-ancestors` has no effect in a meta element, so the host sends it
  as a header (see [What the host has to do](#what-the-host-has-to-do)).
- The policy takes effect only from the meta element onward, which is why it
  comes before every script.
- `report-uri` and `report-to` have no effect in a meta element either, so
  violations show only in the browser console.
