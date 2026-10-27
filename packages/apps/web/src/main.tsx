import {
  BroadcastTabChannel,
  DocumentVisibility,
  DomElementAttribute,
  GlobalTimer,
  IndexedDbStore,
  ResizeObserverWidths,
  WebStorageStore,
  WindowLocation,
  WindowStorageChanges,
  WindowNetworkEvents,
  type KeyValueStore,
} from "@yagura/browser";
import {
  ActivityApiClient,
  AppSyncSignalConnector,
} from "@yagura/activity-api";
import { SessionApiClient } from "@yagura/session-api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, callbackPath } from "./App";
import { loadConfig, type Config } from "./config";
import { SessionController } from "./features/session";
import { ThemeController, themeAttributeName } from "./features/theme";
import "./global.css";

// The composition root: the one module that touches `window`, to build the
// browser implementations everything else receives.

/**
 * With `VITE_API_MOCK=1`, serves the session API and the activity API
 * from Mock Service Worker, and skips the GitHub
 * authorize page. The mocks are imported only in that mode, so they stay out
 * of the production bundle.
 */
async function startApiMock(
  config: Config,
  store: KeyValueStore,
): Promise<((url: URL) => URL) | undefined> {
  if (!config.apiMock) {
    return undefined;
  }
  const { mockAuthorize, startBrowserApiMock } =
    await import("@yagura/api-mocks/browser");
  await startBrowserApiMock({
    sessionApiBaseUrl: config.sessionApiBaseUrl,
    store,
  });
  return mockAuthorize;
}

async function main(container: HTMLElement): Promise<void> {
  const config = loadConfig();
  const storage = new WebStorageStore(() => window.sessionStorage);
  const localStore = new WebStorageStore(() => window.localStorage);
  const location = new WindowLocation(window);
  const authorize = await startApiMock(config, storage);
  const timer = new GlobalTimer();
  const { signalHosts } = config;

  const session = new SessionController({
    sessionApi: new SessionApiClient({ baseUrl: config.sessionApiBaseUrl }),
    // The activity API is on the session API's host.
    activityApi: new ActivityApiClient({ baseUrl: config.sessionApiBaseUrl }),
    // Empty only in mock mode, whose authorize page accepts any client id.
    clientId: config.githubClientId || "mock-client-id",
    redirectUri: location.origin + callbackPath,
    storage,
    lastViewer: localStore,
    location,
    timer,
    cache: new IndexedDbStore(() => window.indexedDB),
    tabs: new BroadcastTabChannel(
      () => new window.BroadcastChannel("yagura.session"),
    ),
    navigate: authorize && ((url) => location.assign(authorize(url))),
  });

  createRoot(container).render(
    <StrictMode>
      <App
        session={session}
        widths={
          new ResizeObserverWidths((callback) => new ResizeObserver(callback))
        }
        preferences={localStore}
        liveUpdates={
          signalHosts && {
            connector: new AppSyncSignalConnector({
              httpHost: signalHosts.http,
              realtimeHost: signalHosts.realtime,
              timer,
            }),
            timer,
            visibility: new DocumentVisibility(document),
            network: new WindowNetworkEvents(window),
          }
        }
        theme={
          new ThemeController({
            store: localStore,
            changes: new WindowStorageChanges(
              window,
              () => window.localStorage,
            ),
            root: new DomElementAttribute(
              document.documentElement,
              themeAttributeName,
            ),
          })
        }
      />
    </StrictMode>,
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}
// Show why startup failed (a misconfigured build, a failed worker
// registration) instead of leaving the page blank.
main(container).catch((error: unknown) => {
  container.textContent =
    error instanceof Error ? error.message : String(error);
  console.error(error);
});
