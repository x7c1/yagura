# Yagura

See your organization's development activity on GitHub at a glance.

- **Sign in with GitHub** — you see exactly what you can see on GitHub, no
  more and no less. There are no separate accounts or permissions to manage.
- **What the server keeps** — the server collects and stores the pull
  request activity of the organizations that use Yagura, from GitHub, and
  returns to each viewer only what that viewer can see on GitHub.
- **Built for looking back** — how much your organization's members worked
  over the last two weeks: the pull requests they opened, pushed to and
  merged, in any repository you can see, broken down by member.

The name is Japanese for a watchtower: a place to look over the whole site.

## Status

Yagura is in early development and is not yet usable. Nothing about its
interfaces is stable.

## Documentation

- [Development](docs/guides/development.md) — prerequisites, running the
  app, and checking changes.
- [Deployment](docs/guides/deployment.md) — building the app for a host,
  and what the host has to do.
- [Activity view](docs/design/activity-view.md) — what the main view
  shows, where its numbers come from, and what the browser keeps.
- [Activity API](docs/design/activity-api.md) — the API the view reads the
  activity from.
- [Session API](docs/design/session-api.md) — how signing in works, and
  the API that keeps the session.

## License

[AGPL-3.0-only](LICENSE)

Contributions are accepted under the terms described in [CLA.md](CLA.md).
