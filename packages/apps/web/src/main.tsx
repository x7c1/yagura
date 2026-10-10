import { GitHubApiClient } from "@yagura/github-api";
import { SessionApiClient } from "@yagura/session-api";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, callbackPath } from "./App";
import { loadConfig } from "./config";
import { SessionController } from "./features/session";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element #root not found");
}

const config = loadConfig();
const session = new SessionController({
  sessionApi: new SessionApiClient({
    baseUrl: config.sessionApiBaseUrl,
    fetch,
  }),
  githubApi: new GitHubApiClient({ fetch }),
  clientId: config.githubClientId,
  redirectUri: window.location.origin + callbackPath,
  navigate: (url) => window.location.assign(url),
});

createRoot(container).render(
  <StrictMode>
    <App session={session} />
  </StrictMode>,
);
