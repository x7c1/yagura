/** Build-time configuration from Vite env variables. */
export interface Config {
  readonly githubClientId: string;
  /** Base URL of the session API, without a trailing slash. */
  readonly sessionApiBaseUrl: string;
}

export function loadConfig(): Config {
  return {
    githubClientId: import.meta.env.VITE_GITHUB_CLIENT_ID ?? "",
    sessionApiBaseUrl: import.meta.env.VITE_YAGURA_SESSION_API ?? "",
  };
}
