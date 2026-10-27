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
  /**
   * The hosts of the AppSync Events API that carries the signals of new
   * activity, or `undefined` when either is not set, in which case the
   * page is not live. Always `undefined` in mock mode, whose API mock has
   * no realtime endpoint.
   */
  readonly signalHosts: SignalHosts | undefined;
}

/** The AppSync Events API's hosts: plain host names, without a scheme. */
export interface SignalHosts {
  /** `VITE_YAGURA_SIGNAL_HTTP_HOST`, which authorizes the connection. */
  readonly http: string;
  /** `VITE_YAGURA_SIGNAL_REALTIME_HOST`, which the page connects to. */
  readonly realtime: string;
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
  return {
    githubClientId,
    sessionApiBaseUrl,
    apiMock,
    signalHosts: apiMock ? undefined : loadSignalHosts(),
  };
}

/** A host name, with a port at most: no scheme, path or credentials. */
const hostPattern = /^[A-Za-z0-9.-]+(:\d+)?$/;

function loadSignalHosts(): SignalHosts | undefined {
  const http = import.meta.env.VITE_YAGURA_SIGNAL_HTTP_HOST ?? "";
  const realtime = import.meta.env.VITE_YAGURA_SIGNAL_REALTIME_HOST ?? "";
  for (const [name, value] of [
    ["VITE_YAGURA_SIGNAL_HTTP_HOST", http],
    ["VITE_YAGURA_SIGNAL_REALTIME_HOST", realtime],
  ] as const) {
    if (value && !hostPattern.test(value)) {
      throw new Error(`${name} is not a plain host name: ${value}`);
    }
  }
  if (Boolean(http) !== Boolean(realtime)) {
    // One host alone is a half-done setup, not a choice: say why the page
    // is not live, where the person checking it will look.
    const [set, missing] = http
      ? ["VITE_YAGURA_SIGNAL_HTTP_HOST", "VITE_YAGURA_SIGNAL_REALTIME_HOST"]
      : ["VITE_YAGURA_SIGNAL_REALTIME_HOST", "VITE_YAGURA_SIGNAL_HTTP_HOST"];
    console.warn(
      `${set} is set but ${missing} is not, so the page does not update live.`,
    );
  }
  return http && realtime ? { http, realtime } : undefined;
}
