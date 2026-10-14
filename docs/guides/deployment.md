# Deployment

The web app is a static site published to GitHub Pages under a custom
domain. Its session API runs on a sibling host of that domain (see
[Session API](../design/session-api.md)); this guide covers only the web
app.

## The deploy job

The `deploy` job in `.github/workflows/ci.yml` runs after `check` passes:

- on every push to `main`, and
- by hand, from the Actions tab ("Run workflow") or with
  `gh workflow run ci.yml --ref <branch>`, on any branch the `github-pages`
  environment allows (see [GitHub Pages settings](#github-pages-settings)).
  Use this to verify a branch before merging it; the next push to `main`
  publishes `main` again.

It builds `packages/apps/web` for production,
[prepares the build output](#preparing-the-build-output), and publishes it
with `actions/deploy-pages`. Only one deployment runs at a time; a newer one
waits for the running one instead of cancelling it.

## Repository variables

The build reads its configuration from two repository variables (Settings →
Secrets and variables → Actions → Variables):

| Variable                  | Value                                                 |
| ------------------------- | ----------------------------------------------------- |
| `VITE_GITHUB_CLIENT_ID`   | The GitHub App's client id                            |
| `VITE_YAGURA_SESSION_API` | Base URL of the session API, without a trailing slash |

Both end up in the JavaScript the site serves, so they are public values,
not secrets. The app refuses to start, and says which variable is missing,
when either is empty. A fork sets its own values to deploy elsewhere without
editing the workflow.

## GitHub Pages settings

In Settings → Pages:

1. Under "Build and deployment", set Source to "GitHub Actions".
2. Under "Custom domain", enter the domain the app is served from.
3. Once the DNS records below resolve and GitHub has issued the
   certificate, check "Enforce HTTPS".

Choosing "GitHub Actions" creates the `github-pages` environment, which by
default accepts deployments from the default branch only; a run by hand on
another branch fails with "not allowed to deploy to github-pages due to
environment protection rules". To publish a branch for verification, add it
under Settings → Environments → `github-pages` → "Deployment branches and
tags", and remove it once the branch is merged.

## DNS

The custom domain is the apex of its own DNS zone, so it cannot be a
`CNAME`. Point it at GitHub Pages with `A` and `AAAA` records to the
addresses listed in GitHub's documentation,
[Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site#configuring-an-apex-domain).

Check the records with:

```sh
dig +short <domain> A
dig +short <domain> AAAA
```

## GitHub App callback URL

Sign-in redirects back to `https://<domain>/callback`. GitHub refuses to
redirect anywhere the GitHub App does not list, so add that URL to the
App's callback URLs, next to `http://localhost:5173/callback` used in
development.

## Preparing the build output

The app is a single page: every path, including `/callback`, is served by
`index.html`. GitHub Pages has no rewrite rules, but it serves `404.html`
for any path it has no file for. The deploy job copies `index.html` to
`404.html`, so a request for `/callback` loads the app, which then reads the
path itself. The response status is still 404, which the browser ignores
for rendering.

The job also removes `mockServiceWorker.js` from the build output. That
script is only used when developing with `VITE_API_MOCK=1` (see
[Development](development.md)).

## Content Security Policy

GitHub Pages sends no security headers and lets a site set none, so the
page carries its Content Security Policy itself, in a
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

- `frame-ancestors` has no effect in a meta element, and GitHub Pages cannot
  send it as a header, so another site can embed the page in a frame. This
  is acceptable because the page holds no action a framing site could trick
  a click into beyond signing out or choosing a theme; signing in leaves for
  GitHub's own page, which refuses to be framed.
- The policy takes effect only from the meta element onward, which is why it
  comes before every script.
- `report-uri` and `report-to` have no effect in a meta element either, so
  violations show only in the browser console.
