import {
  ManualTimer,
  MemoryElementAttribute,
  MemoryElementWidths,
  MemoryJsonStore,
  MemoryLocation,
  MemoryStorageChanges,
  MemoryStore,
  MemoryTabChannel,
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
import { ThemeController } from "./features/theme";

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
   * This tab's channel to the browser's other tabs; defaults to a channel
   * of its own browser, with no other tab.
   */
  readonly tabs?: MemoryTabChannel;
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
  const tabs = options.tabs ?? new MemoryTabChannel();
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
    tabs,
    clock: options.clock,
  });
  return {
    controller,
    mock,
    storage,
    lastViewer,
    location,
    timer,
    cache,
    tabs,
  };
}

/**
 * The element widths the views are drawn to: `width` for every element,
 * wide enough by default for the chart's columns.
 */
export function testWidths(width = 1000): MemoryElementWidths {
  return new MemoryElementWidths(width);
}

/**
 * A theme controller over memory implementations of the browser, so that a
 * test that does not look at the theme leaves the document as it is.
 */
export function testTheme(
  store: KeyValueStore = new MemoryStore(),
): ThemeController {
  return new ThemeController({
    store,
    changes: new MemoryStorageChanges(),
    root: new MemoryElementAttribute(),
  });
}

/** The header's menu button, which holds the theme choice and "Sign out". */
export function menuButton(): HTMLElement {
  return within(screen.getByRole("banner")).getByRole("button", {
    name: "Menu",
  });
}

/**
 * Opens the header's menu, as a click on its button does, unless it is open
 * already, and returns it.
 */
export function openMenu(): HTMLElement {
  const button = menuButton();
  if (button.getAttribute("aria-expanded") !== "true") {
    fireEvent.click(button);
  }
  return screen.getByRole("menu");
}

/** Signs out from the header's menu, as a viewer does. */
export function signOut(): void {
  fireEvent.click(
    within(openMenu()).getByRole("menuitem", { name: "Sign out" }),
  );
}

/**
 * The tab of the page `name`. It is looked for within the tabs, so that the
 * pull request list's links, which outnumber them, are not named one by one.
 */
export function pageTab(name: "Activity" | "Members"): HTMLElement {
  const tabs = screen.getByRole("navigation", { name: "Pages" });
  return within(tabs).getByRole("link", { name });
}

/** Switches to the page of the tab named `name`, as a plain click does. */
export function showPage(name: "Activity" | "Members"): void {
  fireEvent.click(pageTab(name));
}

/**
 * Whether the header shows the organization `name`: chosen in the
 * "Organization" selector when there are several, else as its name. The
 * sign-in screen has no header, so it shows no organization.
 */
export function showsOrganization(name: string): boolean {
  const banner = screen.queryByRole("banner");
  if (banner === null) {
    return false;
  }
  const selector = within(banner).queryByRole<HTMLSelectElement>("combobox", {
    name: "Organization",
  });
  return selector === null
    ? within(banner).queryByText(name) !== null
    : selector.value === name;
}

/** Waits until the header shows the organization `name`. */
export async function findOrganization(name: string): Promise<void> {
  await waitFor(() => {
    expect(showsOrganization(name)).toBe(true);
  });
}

/**
 * The organization's part of the header, holding its avatar, when it is
 * shown alone, without a selector.
 */
export function organizationIdentity(name: string): HTMLElement {
  const banner = screen.getByRole("banner");
  return within(banner).getByText(name).parentElement as HTMLElement;
}

/**
 * Asserts that the view is not loading or updating anything: no
 * "Loading…", no "Updating…" note, and no "…" placeholder in the summary
 * table, which the Members page shows instead of a "Loading…" note.
 */
function expectSettled(): void {
  // Every note and placeholder ends in "…", so the plain text rules them out
  // without the queries below, which walk every element.
  if (!document.body.textContent?.includes("…")) {
    return;
  }
  expect(screen.queryByText(/^Loading/)).not.toBeInTheDocument();
  expect(screen.queryByText("Updating…")).not.toBeInTheDocument();
  expect(screen.queryAllByText("…")).toHaveLength(0);
}

/**
 * Waits until the view is settled and shows the table named `name`. The
 * view is settled first, as waitFor runs this on every change to the
 * document: while it loads, the cheap look at the text fails before the
 * table is looked for.
 */
async function findSettledTable(name: string): Promise<void> {
  await waitFor(() => {
    expectSettled();
    screen.getByRole("table", { name });
  });
}

/** The rows of the pull request list, once it is shown and settled. */
export async function pullRequestRows(): Promise<HTMLElement[]> {
  await findSettledTable("Pull requests");
  return shownPullRequestRows();
}

/** The rows of the pull request list as shown now, settled or not. */
function shownPullRequestRows(): HTMLElement[] {
  const table = screen.getByRole("table", { name: "Pull requests" });
  const [, body] = within(table).getAllByRole("rowgroup");
  // The table was found accessible, and the list leaves out the rows it does
  // not show rather than hiding them, so `hidden` skips computing the style
  // of each row, which is most of the cost of a role query.
  return within(body as HTMLElement).getAllByRole("row", { hidden: true });
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
  // As for the rows, `hidden` skips computing the style of each link and
  // its ancestors.
  return rows.map(
    (row) => within(row).getByRole("link", { hidden: true }).textContent ?? "",
  );
}

/**
 * The cells of the summary table's rows, once it is shown and settled: the
 * member rows (login and counts, as shown), then the totals row.
 */
export async function memberSummaryRows(): Promise<string[][]> {
  await findSettledTable("Members");
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
