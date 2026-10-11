import {
  ManualTimer,
  MemoryLocation,
  MemoryStore,
  type KeyValueStore,
} from "@yagura/browser";
import { ApiMock } from "@yagura/api-mocks";
import { GitHubApiClient } from "@yagura/github-api";
import { SessionApiClient } from "@yagura/session-api";
import { setupServer } from "msw/node";
import { SessionController } from "./features/session";

export const sessionApi = "http://localhost:8787";
export const redirectUri = "http://localhost:5173/callback";

/** The MSW server every test shares; `test-setup.ts` starts and resets it. */
export const server = setupServer();

export interface TestControllerOptions {
  /** The page URL; defaults to the app's root. */
  readonly url?: string;
  /** Starts the mock session signed in, as if a refresh cookie were set. */
  readonly signedIn?: boolean;
  readonly storage?: KeyValueStore;
}

/**
 * A controller over memory implementations of the browser, talking through
 * the real fetch to a fresh API mock installed on the MSW server.
 */
export function testController(options: TestControllerOptions = {}) {
  const mock = new ApiMock({
    sessionApiBaseUrl: sessionApi,
    signedIn: options.signedIn,
  });
  server.use(...mock.handlers);
  const storage = options.storage ?? new MemoryStore();
  const location = new MemoryLocation(options.url ?? "http://localhost:5173/");
  const timer = new ManualTimer();
  const controller = new SessionController({
    sessionApi: new SessionApiClient({ baseUrl: sessionApi }),
    githubApi: new GitHubApiClient(),
    clientId: "Iv1.test",
    redirectUri,
    storage,
    location,
    timer,
  });
  return { controller, mock, storage, location, timer };
}
