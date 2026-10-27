/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_YAGURA_SESSION_API?: string;
  /** `1` serves the APIs from Mock Service Worker (development only). */
  readonly VITE_API_MOCK?: string;
  /** The AppSync Events API's HTTP host, for live updates (optional). */
  readonly VITE_YAGURA_SIGNAL_HTTP_HOST?: string;
  /** The AppSync Events API's realtime host, for live updates (optional). */
  readonly VITE_YAGURA_SIGNAL_REALTIME_HOST?: string;
}
