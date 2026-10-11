/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_YAGURA_SESSION_API?: string;
  /** `1` serves the APIs from Mock Service Worker (development only). */
  readonly VITE_API_MOCK?: string;
}
