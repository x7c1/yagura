/** The `code` the authorize stand-in hands back. */
const mockCode = "mock-code";

/**
 * Stands in for the GitHub authorize page: given the authorize URL the app
 * built, returns the callback URL GitHub would redirect to after the user
 * approved, carrying a mock `code` and the request's `state`.
 */
export function mockAuthorize(authorizeUrl: URL): URL {
  const redirectUri = authorizeUrl.searchParams.get("redirect_uri");
  const state = authorizeUrl.searchParams.get("state");
  if (redirectUri === null || state === null) {
    throw new Error("The authorize URL lacks redirect_uri or state");
  }
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", mockCode);
  callback.searchParams.set("state", state);
  return callback;
}
