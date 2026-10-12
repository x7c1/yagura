import {
  ManualTimer,
  MemoryJsonStore,
  MemoryLocation,
  MemoryStore,
  type JsonStore,
  type KeyValueStore,
} from "@yagura/browser";
import { ApiMock } from "@yagura/api-mocks";
import { GitHubApiClient } from "@yagura/github-api";
import { SessionApiClient } from "@yagura/session-api";
import { screen, within } from "@testing-library/react";
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
  /** The organizations the mock reports the GitHub App installed on. */
  readonly organizations?: readonly string[];
  readonly storage?: KeyValueStore;
  /** The browser cache; defaults to an empty memory store. */
  readonly cache?: JsonStore;
  /**
   * The current time, for the controller and the fixtures of a new mock.
   * Defaults to the system clock.
   */
  readonly clock?: () => Date;
  /**
   * An API mock to keep using, as a reload of the page would, instead of a
   * fresh one. Its fixtures and session stay as they are.
   */
  readonly mock?: ApiMock;
}

/**
 * A controller over memory implementations of the browser, talking through
 * the real fetch to an API mock installed on the MSW server: a fresh one
 * unless `mock` is given.
 */
export function testController(options: TestControllerOptions = {}) {
  const mock =
    options.mock ??
    new ApiMock({
      sessionApiBaseUrl: sessionApi,
      signedIn: options.signedIn,
      organizations: options.organizations,
      now: options.clock?.(),
    });
  server.use(...mock.handlers);
  const storage = options.storage ?? new MemoryStore();
  const cache = options.cache ?? new MemoryJsonStore();
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
    cache,
    clock: options.clock,
  });
  return { controller, mock, storage, location, timer, cache };
}

/** The rows of the pull request list, once it is shown. */
export async function pullRequestRows(): Promise<HTMLElement[]> {
  const table = await screen.findByRole("table", { name: "Pull requests" });
  const [, body] = within(table).getAllByRole("rowgroup");
  return within(body as HTMLElement).getAllByRole("row");
}

/** The titles in the pull request list, once it is shown. */
export async function pullRequestTitles(): Promise<string[]> {
  return (await pullRequestRows()).map(
    (row) => within(row).getByRole("link").textContent ?? "",
  );
}
