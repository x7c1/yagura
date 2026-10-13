# Session API

The browser never sees the GitHub App's client secret, so the one thing the
app needs a server for is turning an OAuth `code` into tokens and refreshing
them later. This document is the contract between the single-page app and
that server. The server stores nothing: the refresh token travels in an
encrypted cookie the browser holds, and the access token lives only in the
page's memory.

Keeping the access token in memory, rather than in the browser's storage,
keeps a script that runs in the page (through cross-site scripting or a
compromised dependency) from reading it out of storage and using it
elsewhere for the rest of its 8-hour life. The refresh token is no easier to
take: it is in an `HttpOnly` cookie, which scripts cannot read. This does not
stop such a script from calling the API with the token while the page is
open. The cost is that every page load sends one `POST /session/refresh`
before its first API call, to get an access token again.

The app does not wait for that refresh to draw. It remembers in the browser
the login of the last viewer who signed in, and on a page load draws that
viewer's cached activity at once, while the refresh, and then the lookup of
the login, run behind it. Until they answer, the viewer is signed in
unconfirmed: their cache is read but not written, and GitHub requests wait
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
  "expires_in": 28800
}
```

plus a `Set-Cookie` header carrying the refresh token (see below).

### `POST /session/refresh`

Obtains a new access token from the refresh cookie. Called when the page
loads with no access token in memory, and again whenever the access token has
expired. No request body.

Response `200`: the same JSON shape as `POST /session`, plus a new
`Set-Cookie` header. GitHub rotates refresh tokens on every refresh, so the
cookie is replaced each time.

Response `401` when the cookie is missing, cannot be decrypted, or GitHub
rejects the refresh token. The response also clears the cookie, so the next
page load starts sign-in from scratch.

### `DELETE /session`

Signs out: clears the cookie. Response `204`. The access token in memory is
the app's to discard.

## The refresh cookie

| Attribute  | Value                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Name       | `yagura_refresh`                                                                                                         |
| Value      | The GitHub refresh token and its expiry, encrypted by the server with a key only the server holds. Opaque to the browser |
| `HttpOnly` | yes                                                                                                                      |
| `Secure`   | yes (browsers treat `localhost` as a secure context, so this also works in development)                                  |
| `SameSite` | `Lax`                                                                                                                    |
| `Path`     | `/session` — the cookie is sent only to the endpoints above                                                              |
| `Max-Age`  | the refresh token's remaining lifetime (6 months when freshly issued)                                                    |

Clearing the cookie means setting it with an empty value and `Max-Age=0`.

## Errors

Every error response is JSON:

```json
{ "error": "invalid_grant", "error_description": "..." }
```

| Status | `error`           | When                                                                                       |
| ------ | ----------------- | ------------------------------------------------------------------------------------------ |
| 400    | `invalid_request` | The body is not the documented shape                                                       |
| 400    | `invalid_grant`   | GitHub rejected the code or the verifier (expired, reused, mismatched `redirect_uri`)      |
| 401    | `invalid_session` | `POST /session/refresh` without a usable cookie                                            |
| 502    | `upstream_error`  | GitHub did not answer, or answered with something other than a token or a documented error |

## CORS

The page and the server are different origins, and the requests carry a
cookie, so the server answers CORS preflights and sets, for an allowed
origin only:

- `Access-Control-Allow-Origin: <that origin>` (never `*`)
- `Access-Control-Allow-Credentials: true`
- `Access-Control-Allow-Methods: POST, DELETE`
- `Access-Control-Allow-Headers: Content-Type`

The allowed origins are configured on the server: `https://yagura.module.codes`
in production and `http://localhost:5173` in development. A request from any
other origin gets no CORS headers and is therefore rejected by the browser.
