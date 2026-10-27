/** Build-time configuration from Vite env variables. */
export interface Config {
  readonly githubClientId: string;
  /**
   * Base URL of the Yagura API, without a trailing slash: the session API
   * and the activity API are on the same host.
   */
  readonly sessionApiBaseUrl: string;
  /** Serve the APIs from Mock Service Worker (`VITE_API_MOCK=1`). */
  readonly apiMock: boolean;
}

/**
 * Reads the configuration, throwing when a variable the app cannot work
 * without is empty, so a misconfigured build fails at startup instead of on
 * the first request.
 */
export function loadConfig(): Config {
  const apiMock = import.meta.env.VITE_API_MOCK === "1";
  const githubClientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? "";
  const sessionApiBaseUrl = import.meta.env.VITE_YAGURA_SESSION_API ?? "";
  if (!sessionApiBaseUrl) {
    throw new Error("VITE_YAGURA_SESSION_API is not set");
  }
  // The mock authorize page accepts any client id.
  if (!githubClientId && !apiMock) {
    throw new Error("VITE_GITHUB_CLIENT_ID is not set");
  }
  return { githubClientId, sessionApiBaseUrl, apiMock };
}
