# Session API

The browser never sees the GitHub App's client secret, so the one thing the
app needs a server for is turning an OAuth `code` into tokens and refreshing
them later. This document is the contract between the single-page app and
that server. The server stores nothing: the refresh token travels in an
encrypted cookie the browser holds, and the access token lives only in the
page's memory.

Keeping the access token in memory, rather than in the browser's storage,
keeps it from being left behind in storage after the page is closed, where a
later script or another user of the browser could find it. It does not keep
it from a script that runs in the page (through cross-site scripting or a
compromised dependency): such a script runs in the same origin, can read the
`access_token` of a refresh response, and can send it elsewhere for the rest
of its 8-hour life. The refresh token itself is in an `HttpOnly` cookie,
which scripts cannot read. The cost is that every page load sends one `POST /session/refresh`
before its first API call, to get an access token again.

The app does not wait for that refresh to draw. It remembers in the browser
the login of the last viewer who signed in, and on a page load draws that
viewer's cached activity at once, while the refresh, which answers with the
login as well as the token, runs behind it. Until it answers, the viewer is
signed in unconfirmed: their cache is read but not written, and GitHub requests wait
for the token. When the session has ended (the refresh answers `401`, for
example after signing out on another device or once the refresh token has
expired), the previous view shows for a moment, then gives way to the
sign-in button, and the last viewer is forgotten so that the next load
draws nothing first. This discloses nothing new: what is drawn is only what
this browser's IndexedDB already holds, which anyone using this browser
could read from it anyway, and no request is sent without a token the
session API issued.

The server is reached at a base URL the app is built with
(`VITE_YAGURA_SESSION_API`). In production that is
`https://api.yagura.module.codes`; in development it is a local server on
`http://localhost:8787`. Both are on the same site as the page that calls them
(`yagura.module.codes` and `localhost` respectively), which is what lets the
cookie use `SameSite=Lax`.

## Endpoints

All requests and responses are JSON (`Content-Type: application/json`). The
app sends every request with `credentials: "include"`.

### `POST /session`

Exchanges the authorization code for tokens. Called once, from the sign-in
callback page.

Request body:

```json
{
  "code": "<code from the GitHub redirect>",
  "code_verifier": "<the PKCE verifier the app generated>",
  "redirect_uri": "https://yagura.module.codes/callback"
}
```

`redirect_uri` must be the exact value the app sent to GitHub's authorize
endpoint; the server forwards it unchanged.

Response `200`:

```json
{
  "access_token": "ghu_...",
  "token_type": "bearer",
  "expires_in": 28800,
  "login": "octocat"
}
```

plus a `Set-Cookie` header carrying the refresh token (see below).

`login` is the GitHub login of the user the token belongs to, so that the app
need not ask GitHub's `GET /user` for it. The server asks GitHub for it once,
right after exchanging the code, and keeps it in the encrypted cookie next to
the refresh token; a refresh answers with the login from the cookie without
asking GitHub again. A cookie issued before `login` was added holds no login:
the server looks it up on that cookie's next refresh and writes it into the
new cookie. A login renamed on GitHub therefore shows its old name until the
user signs in again.

If GitHub's user lookup fails after the code was exchanged, the response is
`502 upstream_error` and no cookie is set.

### `POST /session/refresh`

Obtains a new access token from the refresh cookie. Called when the page
loads with no access token in memory, and again whenever the access token has
expired. No request body.

Response `200`: the same JSON shape as `POST /session`, `login` included,
plus a new `Set-Cookie` header. GitHub rotates refresh tokens on every refresh, so the
cookie is replaced each time.

Response `401` when the cookie is missing, cannot be decrypted, or GitHub
rejects the refresh token. The response also clears the cookie, so the next
page load starts sign-in from scratch.

### `DELETE /session`

Signs out: clears the cookie and revokes the session's tokens at GitHub.
To do so, the server refreshes once with the cookie's refresh token and
revokes the access token that refresh issues, the newest of the session.
Response `204`, also when the revocation at GitHub fails, which the server
records; the page is not told. The access token in memory is the app's to
discard.

A sign-out in the app ends the session in the whole browser, not on other
devices:

- **This tab** forgets the access token, the last viewer and the viewer's
  entries in the browser cache, and shows the sign-in screen at once,
  without waiting for this request, which may take a few seconds while
  the server revokes the tokens at GitHub. The request is sent once a
  refresh in flight has answered, so that the refresh's new cookie cannot
  outlive the one this request clears. When it fails (the server cannot be
  reached, or does not answer `2xx`), the cookie may still be set and the
  next page load would sign the viewer in again, so the sign-in screen
  says so.
- **Every other tab of the browser** hears of it through a
  `BroadcastChannel`, forgets its access token, stops its refresh, drops
  what it shows and shows the sign-in screen. It sends no request of its
  own: the cookie is shared, and the signing-out tab clears it. The one
  exception is a tab whose own refresh was in flight: that refresh's
  answer may set the cookie again, with the token GitHub rotated to, after
  the signing-out tab's request cleared it. Such a tab waits for its
  refresh to settle and, when it was answered with new tokens, sends
  `DELETE /session` itself, so that the rotated token is revoked and the
  cookie cleared again; a refresh that failed set no cookie, and nothing is
  sent. A tab that misses the message (asleep, or in a browser without
  `BroadcastChannel`) signs out on its next refresh, which answers
  `401 invalid_session` once the cookie is gone.
- **In every tab**, a load or refresh that was in flight when the sign-out
  arrived stores nothing when it answers: no cache entries, no last
  viewer, no tokens.
- **The session's tokens at GitHub** are revoked by the server.
- **Sessions on other devices** are left as they are; each has its own
  cookie and tokens.

Signing in again in one tab works as usual; other tabs stay on the sign-in
screen until they are reloaded.

## The refresh cookie

| Attribute  | Value                                                                                                                                      |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Name       | `__Host-yagura_refresh`                                                                                                                    |
| Value      | The GitHub refresh token, its expiry and the user's login, encrypted by the server with a key only the server holds. Opaque to the browser |
| `HttpOnly` | yes                                                                                                                                        |
| `Secure`   | yes (browsers treat `localhost` as a secure context, so this also works in development)                                                    |
| `SameSite` | `Lax`                                                                                                                                      |
| `Domain`   | none — the cookie goes back only to the host that set it                                                                                   |
| `Path`     | `/` — the `__Host-` prefix requires it; the session API's host serves only the endpoints above                                             |
| `Max-Age`  | the refresh token's remaining lifetime (6 months when freshly issued)                                                                      |

Browsers accept a `__Host-` cookie only with `Secure`, `Path=/` and no
`Domain`. So no other host can set a cookie of this name for the session
API, not even another host on the same site, and the server reads no cookie
but this one.

Clearing the cookie means setting it with an empty value and `Max-Age=0`.

Earlier versions named the cookie `yagura_refresh`, with `Path=/session`.
The server no longer reads it: a browser that holds only that cookie gets
`401 invalid_session` on its next refresh and signs in again. Whenever a
request carries the old cookie, the response clears it as well.

## Errors

Every error response is JSON:

```json
{ "error": "invalid_grant", "error_description": "..." }
```

| Status | `error`                  | When                                                                                               |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request`        | The body is not the documented shape                                                               |
| 400    | `invalid_grant`          | GitHub rejected the code or the verifier (expired, reused, mismatched `redirect_uri`)              |
| 401    | `invalid_session`        | `POST /session/refresh` without a usable cookie                                                    |
| 403    | `forbidden_origin`       | Any of the three requests without an allowed `Origin` (see [Origins](#origins))                    |
| 415    | `unsupported_media_type` | `POST /session` whose `Content-Type` is not `application/json`                                     |
| 502    | `upstream_error`         | GitHub did not answer, or answered with something other than a token, a user or a documented error |

## Origins

The server accepts `POST /session`, `POST /session/refresh` and
`DELETE /session` only with an `Origin` header that exactly matches an
allowed origin. A request without `Origin`, with `Origin: null`, or from any
other origin is refused with `403 forbidden_origin` before anything else
happens: GitHub is not called and no cookie is set or cleared. Browsers send
`Origin` on these requests, and the API serves only the page, so a request
without one has no legitimate source.

CORS alone would not be enough. It keeps another site's script from reading
a response, but a plain form on another site can still send a `POST` with a
`text/plain` body that parses as JSON, and the server would act on it, for
example by setting a cookie for an attacker's code in the victim's browser.
For the same reason `POST /session` takes only `Content-Type:
application/json` (parameters such as `charset` are allowed) and refuses
anything else with `415 unsupported_media_type`; a form cannot send that type
without a preflight.

The page and the server are different origins, and the requests carry a
cookie, so the server also answers CORS preflights and sets, for an allowed
origin only:

- `Access-Control-Allow-Origin: <that origin>` (never `*`)
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: POST, DELETE`
- `Access-Control-Allow-Headers: Content-Type`

The allowed origins are configured on the server: `https://yagura.module.codes`
in production and `http://localhost:5173` in development. A request from any
other origin gets no CORS headers, so the browser does not let the page read
the response, and the server refuses the request itself as above.
