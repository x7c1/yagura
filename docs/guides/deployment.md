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
