# Activity API

The server collects the activity of the organizations that use Yagura
from GitHub and stores it. The
activity API is how the single-page app reads it: the app calls no other
API for data, and never calls the GitHub API itself. This document is the
contract between the app and that API. What the app makes of the answers
is in the [activity view's design](activity-view.md).

The API is served from the same host as the session API, at the base URL
the app is built with (`VITE_YAGURA_SESSION_API`). The session itself, and
how the app gets the access token that the requests below carry, is the
[session API's](session-api.md) contract.

## Requests

Every request is a `GET`, except `POST /activity/signal-token`, and
every request carries the session's access token, the one the session API
issued, as a bearer token:

```http
Authorization: Bearer ghu_...
```

The token alone authenticates the request. The app sends no cookies with
it (it does not use `credentials: "include"`), so the refresh cookie,
which only the session API reads, never travels with an activity request.

Every response is JSON and carries `Cache-Control: no-store`: what it holds
depends on who asks and changes as GitHub does, so no cache along the way
keeps it. The app keeps the last answer itself (see the activity view's
[browser cache](activity-view.md#the-browser-cache)).

## Endpoints

### `GET /activity/organizations`

The organizations the viewer can use Yagura for: those the Yagura GitHub
App is installed on, among the ones the viewer can see on GitHub, in login
order.

Response `200`:

```json
{
  "organizations": [
    {
      "id": "...",
      "login": "my-org",
      "avatarUrl": "https://avatars.githubusercontent.com/..."
    }
  ]
}
```

An empty list means that the app is installed on none of the viewer's
organizations.

### `GET /activity`

The activity of an organization's members over a range of time.

| Parameter      | Value                                          |
| -------------- | ---------------------------------------------- |
| `organization` | The `id` of one of the viewer's organizations  |
| `from`         | The start of the range, inclusive, in ISO 8601 |
| `to`           | The end of the range, exclusive, in ISO 8601   |

`from` and `to` carry their zone, `Z` or an offset such as `+09:00`; a time
without one is refused. The app writes them with the viewer's local offset,
so that the range starts and ends at the viewer's local midnight. The range
is at most 31 days and 1 hour long: a local month, even one with a
daylight saving change that lengthens it by an hour.

Response `200`:

```json
{
  "members": [
    { "id": "...", "login": "octocat", "type": "User" },
    { "id": "...", "login": "dependabot[bot]", "type": "Bot" }
  ],
  "pullRequests": [
    {
      "id": "...",
      "repository": { "id": "...", "ownerLogin": "my-org", "name": "web" },
      "number": 123,
      "title": "Draw the activity chart",
      "state": "open",
      "draft": true,
      "additions": 240,
      "deletions": 12,
      "authorId": "...",
      "createdAt": "2026-10-09T05:15:00.000Z"
    }
  ],
  "activities": [
    {
      "kind": "pushed",
      "pullRequestId": "...",
      "actorId": "...",
      "occurredAt": "2026-10-12T05:40:00.000Z"
    }
  ]
}
```

- `members` are the organization's current members, in login order, each
  listed even when they have no activity in the range, followed by the
  bots that opened one of the returned pull requests. `type` is `User` for
  a person and `Bot` for a bot.
- `pullRequests` are the pull requests that had any activity in the range,
  in the order of their first activity in it. `state` is `open` or
  `closed`, as GitHub reports it now; a merged pull request is `closed`,
  and its merge is in `activities`. `draft` is whether it is a draft now.
  `additions` and `deletions` are GitHub's own counts. `authorId` is the
  account that opened it; `createdAt` is when, which may be before the
  range.
- `activities` are what happened to those pull requests in the range, in
  time order. `kind` is one of `opened`, `pushed` (commits pushed to the
  pull request's branch), `ready_for_review`, `converted_to_draft`,
  `merged` and `closed`. `actorId` is the account that did it, which may be
  someone who is not in `members`, such as a contributor from outside the
  organization.
- Every time is in UTC, in ISO 8601 with milliseconds.

An account's id (a member's `id`, `authorId` and `actorId`) is the
number GitHub knows the account by; the app draws the account's avatar
from it, at `https://avatars.githubusercontent.com/u/<id>`. Every other
id is opaque: the app compares it and does not read it.

### `POST /activity/signal-token`

A token for the viewer's channel of [signals](#signals), with which the
app connects to the realtime endpoint and subscribes to that channel. The
request has no body.

Response `200`:

```json
{
  "token": "...",
  "expiresAt": "2026-10-27T03:15:00.000Z",
  "channel": "/prod-yagura-viewers/1004"
}
```

- `token` is opaque to the app, which passes it on as it is. It is good
  for 15 minutes, until `expiresAt`, and only for connecting to the
  realtime endpoint and subscribing to `channel`: it cannot publish, nor
  subscribe to another viewer's channel.
- `channel` is the viewer's own, `/<namespace>/<user id>`, where
  `<user id>` is the number GitHub knows the viewer's account by. The
  namespace depends on the deployment (`prod-yagura-viewers` in the
  example), so the app subscribes to `channel` as returned and never builds
  it.

## Visibility

The server answers each viewer with only the rows from repositories that
viewer can see on GitHub: a pull request in a repository the viewer cannot
see is not returned, nor is its activity, even when a member of the
organization wrote it. The server learns what the viewer can see from
GitHub, and a change of access, such as being added to a repository or
removed from one, shows in the answers within about five minutes.

`GET /activity/organizations` likewise lists only organizations the viewer
can see, and `GET /activity` answers `403 forbidden` for an organization
the viewer cannot use.

## Signals

The server tells each open page when there is new activity for its viewer,
so that the page can fetch the activity again rather than wait for a
reload. It sends these signals over
[AWS AppSync Events](https://docs.aws.amazon.com/appsync/latest/eventapi/),
a managed WebSocket pub/sub service, on a channel per viewer.

When the server records activity in a repository, it publishes a signal to
the channel of each viewer who can see that repository and whose access to
it the server checked within the last five minutes (see
[Visibility](#visibility)). A signal carries ids only, never what happened
in the viewer's terms:

```json
{ "repositoryId": "...", "pullRequestId": "...", "kind": "pushed" }
```

`kind` is one of the `kind`s of `activities`. A push often records several
events at once, and so sends several signals within a second or two.

Nothing is kept: a signal published while the page is not connected and
subscribed is lost. That is why the page fetches the activity again after
it connects again, and when it becomes visible after being hidden (see the
activity view's [live updates](activity-view.md#live-updates)).

### Connecting

The app is built with two hosts of the AppSync Events API, plain host
names without a scheme (see [Deployment](../guides/deployment.md)): the
HTTP host, which AppSync Events authorizes connections against, and the
realtime host, which the page connects to. Without both, the app does not
connect and is not live.

The app relies on the following part of the
[AppSync Events WebSocket protocol](https://docs.aws.amazon.com/appsync/latest/eventapi/event-api-websocket-protocol.html),
with the API's Lambda authorization:

- **The authorization object.** The connection and the subscription each
  carry `{ "host": "<HTTP host>", "Authorization": "<signal token>" }`. The
  service checks the token, and that the channel subscribed to is the
  token's own.
- **The connection.** The page opens a WebSocket to
  `wss://<realtime host>/event/realtime`, offering two subprotocols:
  `aws-appsync-event-ws`, and `header-` followed by the authorization
  object as JSON in base64url, without padding. Once it is open, the page
  sends `{ "type": "connection_init" }`.
- **The acknowledgement.** The service answers
  `{ "type": "connection_ack", "connectionTimeoutMs": 300000 }`, then
  sends `{ "type": "ka" }` about every minute. When no `ka` arrives within
  `connectionTimeoutMs` of the last one (or of the acknowledgement), the
  page takes the connection as gone and closes it.
- **The subscription.** On the acknowledgement, the page sends
  `{ "type": "subscribe", "id": "<a random UUID>", "channel": "<channel>",
"authorization": { ... } }`, with the channel the signal token came with
  and the same authorization object. The service confirms it with
  `{ "type": "subscribe_success", "id": "<id>" }`.
- **The signals.** Each signal published to the channel arrives as
  `{ "type": "data", "id": "<id>", "event": ... }`, where `event` is the
  signal written as a string of JSON. The page also reads a list of such
  strings there. A signal it cannot read, and a
  `{ "type": "broadcast_error", "id": "<id>", ... }`, by which the service
  says that it failed to deliver one, count as a signal without its ids.
- **Errors.** A `connection_error`, a `subscribe_error` or an `error`
  message, each with an `errors` list, ends the connection: the page
  closes it and connects again with a new token, as it does when the
  socket closes.

A connection stays open for up to 24 hours, even after its signal token
expires; a new token is needed only to connect or subscribe again. The
page sends nothing but `connection_init` and `subscribe`: it never
publishes, and closes the socket rather than unsubscribing first.

## Errors

Every error response is JSON, in the shape the session API uses:

```json
{ "error": "invalid_request", "error_description": "..." }
```

| Status | `error`           | When                                                                                |
| ------ | ----------------- | ----------------------------------------------------------------------------------- |
| 400    | `invalid_request` | A parameter is missing or unreadable, a bound has no zone, or the range is too long |
| 401    | `invalid_token`   | No bearer token, or one the server does not accept, such as an expired one          |
| 403    | `forbidden`       | The organization is not one the viewer can use                                      |
| 404    | `not_found`       | No such endpoint, or no such organization                                           |
| 502    | `upstream_error`  | GitHub did not answer, or answered with an error, while the server checked with it  |
| 500    | `internal_error`  | The server failed otherwise                                                         |

`POST /activity/signal-token` answers with these errors too, `403` and
`400` aside. The app treats `401 invalid_token` as an expired access
token: it refreshes
the session once with `POST /session/refresh` and sends the request again
with the new token. When the refresh answers `401`, the session has ended,
and the app signs the viewer out as it does for any ended session (see the
session API's design). The other errors are shown to the viewer in their
own terms, with a way to retry; the screen names no status or error code.
A failed signal token request is the exception: it is only tried again
later, and never shown, since the page works without live updates.
