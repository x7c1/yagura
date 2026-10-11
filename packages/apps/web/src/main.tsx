import {
  GlobalTimer,
  WebStorageStore,
  WindowLocation,
  type KeyValueStore,
} from "@yagura/browser";
import { GitHubApiClient } from "@yagura/github-api";
import { SessionApiClient } from "@yagura/session-api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, callbackPath } from "./App";
import { loadConfig } from "./config";
import { SessionController } from "./features/session";

// The composition root: the one module that touches `window`, to build the
// browser implementations everything else receives.

/**
 * With `VITE_API_MOCK=1`, serves the session API and GitHub's `GET /user`
 * from Mock Service Worker and skips the GitHub authorize page. The mocks are
 * imported only in that mode, so they stay out of the production bundle.
 */
async function startApiMock(
  sessionApiBaseUrl: string,
  store: KeyValueStore,
): Promise<((url: URL) => URL) | undefined> {
  if (import.meta.env.VITE_API_MOCK !== "1") {
    return undefined;
  }
  const { mockAuthorize, startBrowserApiMock } =
    await import("@yagura/api-mocks/browser");
  await startBrowserApiMock({ sessionApiBaseUrl, store });
  return mockAuthorize;
}

async function main(): Promise<void> {
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Root element #root not found");
  }

  const config = loadConfig();
  const storage = new WebStorageStore(() => window.sessionStorage);
  const location = new WindowLocation(window);
  const authorize = await startApiMock(config.sessionApiBaseUrl, storage);

  const session = new SessionController({
    sessionApi: new SessionApiClient({ baseUrl: config.sessionApiBaseUrl }),
    githubApi: new GitHubApiClient(),
    // The mock authorize page accepts any client id.
    clientId: config.githubClientId || (authorize ? "mock-client-id" : ""),
    redirectUri: location.origin + callbackPath,
    storage,
    location,
    timer: new GlobalTimer(),
    navigate: authorize && ((url) => location.assign(authorize(url))),
  });

  createRoot(container).render(
    <StrictMode>
      <App session={session} />
    </StrictMode>,
  );
}

void main();
