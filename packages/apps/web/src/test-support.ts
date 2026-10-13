import {
  ManualTimer,
  MemoryElementWidths,
  MemoryJsonStore,
  MemoryLocation,
  MemoryStore,
  type JsonStore,
  type KeyValueStore,
} from "@yagura/browser";
import type { PullRequest } from "@yagura/activity";
import { ApiMock, mockPullRequests } from "@yagura/api-mocks";
import { GitHubApiClient } from "@yagura/github-api";
import { SessionApiClient } from "@yagura/session-api";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import { setupServer } from "msw/node";
import { SessionController } from "./features/session";

export const sessionApi = "http://localhost:8787";
export const redirectUri = "http://localhost:5173/callback";
/** The address of the members page. */
export const membersPageUrl = "http://localhost:5173/members";

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
  /** Where the last viewer is remembered; defaults to an empty memory store. */
  readonly lastViewer?: KeyValueStore;
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
  const lastViewer = options.lastViewer ?? new MemoryStore();
  const cache = options.cache ?? new MemoryJsonStore();
  const location = new MemoryLocation(options.url ?? "http://localhost:5173/");
  const timer = new ManualTimer();
  const controller = new SessionController({
    sessionApi: new SessionApiClient({ baseUrl: sessionApi }),
    githubApi: new GitHubApiClient(),
    clientId: "Iv1.test",
    redirectUri,
    storage,
    lastViewer,
    location,
    timer,
    cache,
    clock: options.clock,
  });
  return { controller, mock, storage, lastViewer, location, timer, cache };
}

/**
 * The element widths the views are drawn to: `width` for every element,
 * wide enough by default for the chart's columns.
 */
export function testWidths(width = 1000): MemoryElementWidths {
  return new MemoryElementWidths(width);
}

/** Switches to the page of the tab named `name`, as a plain click does. */
export function showPage(name: "Activity" | "Members"): void {
  fireEvent.click(screen.getByRole("link", { name }));
}

/**
 * Waits until the view is not loading or updating anything: no "Loading…"
 * and no "Updating…" note.
 */
async function settled(): Promise<void> {
  await waitFor(() => {
    expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument();
    expect(screen.queryByText("Updating…")).not.toBeInTheDocument();
  });
}

/** The rows of the pull request list, once it is shown and settled. */
export async function pullRequestRows(): Promise<HTMLElement[]> {
  await screen.findByRole("table", { name: "Pull requests" });
  await settled();
  return shownPullRequestRows();
}

/** The rows of the pull request list as shown now, settled or not. */
function shownPullRequestRows(): HTMLElement[] {
  const table = screen.getByRole("table", { name: "Pull requests" });
  const [, body] = within(table).getAllByRole("rowgroup");
  return within(body as HTMLElement).getAllByRole("row");
}

/** The titles in the pull request list, once it is shown and settled. */
export async function pullRequestTitles(): Promise<string[]> {
  return titlesOf(await pullRequestRows());
}

/** The titles in the pull request list as shown now, settled or not. */
export function shownPullRequestTitles(): string[] {
  return titlesOf(shownPullRequestRows());
}

function titlesOf(rows: readonly HTMLElement[]): string[] {
  return rows.map((row) => within(row).getByRole("link").textContent ?? "");
}

/**
 * The cells of the summary table's rows, once it is shown and settled: the
 * member rows (login and counts, as shown), then the totals row.
 */
export async function memberSummaryRows(): Promise<string[][]> {
  await screen.findByRole("table", { name: "Members" });
  await settled();
  return shownMemberSummaryRows();
}

/** The cells of the summary table's rows as shown now, settled or not. */
export function shownMemberSummaryRows(): string[][] {
  const table = screen.getByRole("table", { name: "Members" });
  const [, body, foot] = within(table).getAllByRole("rowgroup");
  return [body, foot].flatMap((group) =>
    within(group as HTMLElement)
      .getAllByRole("row")
      .map((row) =>
        [...row.children].map((cell) => cell.textContent?.trim() ?? ""),
      ),
  );
}

/**
 * The API mock's fixture pull requests at `now`, as the domain sees them,
 * for working out from the fixtures what the view should show. Their state
 * is left `open`: the measures go by the dates, not the state.
 */
export function mockDomainPullRequests(now: Date): PullRequest[] {
  return mockPullRequests(now).map((node) => ({
    id: node.id,
    title: node.title,
    url: node.url,
    repository: node.repository.nameWithOwner,
    author: node.author.login,
    state: "open",
    createdAt: new Date(node.createdAt),
    mergedAt: node.mergedAt === null ? null : new Date(node.mergedAt),
    additions: node.additions,
    deletions: node.deletions,
  }));
}
