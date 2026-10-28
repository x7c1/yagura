import {
  mockOrganization,
  mockOrganizationId,
  type ApiMock,
  type MockActivityFixtures,
} from "@yagura/api-mocks";
import { MemorySignalConnector } from "@yagura/activity-api";
import {
  ManualTimer,
  MemoryNetworkEvents,
  MemoryVisibility,
} from "@yagura/browser";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  burstMs,
  connectingGraceMs,
  firstRetryMs,
  longAbsenceMs,
  type LiveUpdatesOptions,
} from "./features/live-updates";
import {
  menuButton,
  pullRequestTitles,
  server,
  sessionApi,
  signOut,
  testController,
  testPreferences,
  testTheme,
  testWidths,
} from "./test-support";

const minute = 60 * 1000;

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const now = new Date(2026, 9, 12, 15, 30);

const signalTokenUrl = `${sessionApi}/activity/signal-token`;
const newTitle = "Open a pull request while the page is open";
const importingNotice = `Importing the last 14 days of ${mockOrganization}. This can take a few minutes.`;

/**
 * The app, signed in, with live updates from a connector held in memory,
 * timed by a manual timer. With `live: false`, the app is given no live
 * updates, as a build without the signal hosts is.
 */
function openPage({ live = true }: { readonly live?: boolean } = {}) {
  const test = testController({ signedIn: true, clock: () => now });
  return renderPage(test, live);
}

/** The app of `test`, rendered as {@link openPage} does. */
function renderPage(test: ReturnType<typeof testController>, live: boolean) {
  const connector = new MemorySignalConnector();
  const timer = new ManualTimer();
  const visibility = new MemoryVisibility();
  const network = new MemoryNetworkEvents();
  const liveUpdates: LiveUpdatesOptions = {
    connector,
    timer,
    visibility,
    network,
    now: () => timer.now,
    // The shortest wait, so that a test knows when the next try comes.
    random: () => 0,
  };
  render(
    <App
      session={test.controller}
      widths={testWidths()}
      theme={testTheme()}
      preferences={testPreferences()}
      liveUpdates={live ? liveUpdates : undefined}
    />,
  );
  return { ...test, connector, timer, visibility, network };
}

/** Waits for the page's first load and its connection, and subscribes it. */
async function connected(page: ReturnType<typeof openPage>) {
  await pullRequestTitles();
  const connection = await waitFor(() => {
    const [only, ...rest] = page.connector.connections;
    expect(rest).toEqual([]);
    if (only === undefined) {
      throw new Error("Not connected yet");
    }
    return only;
  });
  act(() => connection.subscribed());
  page.mock.clearRequests();
  return connection;
}

/** Runs the timers due within `ms`, as React sees them. */
function advance(timer: ManualTimer, ms: number): void {
  act(() => timer.advance(ms));
}

/** The header's dot, which shows whether the page is live. */
function liveDot(): HTMLElement {
  return screen.getByRole("button", { name: /^Connection: / });
}

/** The status the header's dot shows, or `undefined` without a dot. */
function liveStatus(): string | undefined {
  return screen
    .queryByRole("button", { name: /^Connection: / })
    ?.getAttribute("aria-label")
    ?.replace("Connection: ", "");
}

/**
 * The state the header's dot is drawn in, which tells "starting" from
 * "connecting" where their names do not, or `undefined` without a dot.
 */
function liveState(): string | undefined {
  return (
    screen
      .queryByRole("button", { name: /^Connection: / })
      ?.querySelector("[data-status]")
      ?.getAttribute("data-status") ?? undefined
  );
}

/** Waits until the header shows the session, with the menu that ends it. */
async function sessionShown(): Promise<void> {
  await waitFor(() => menuButton());
}

/**
 * The states the header's dot is drawn in while the header shows the
 * session, from the first, recorded on each change of the page until
 * `stop` is called.
 */
function recordLiveStates(): {
  readonly seen: Set<string | undefined>;
  stop(): void;
} {
  const seen = new Set<string | undefined>();
  const record = () => {
    if (
      screen.queryByRole("banner") !== null &&
      within(screen.getByRole("banner")).queryByRole("button", {
        name: "Menu",
      }) !== null
    ) {
      seen.add(liveState());
    }
  };
  const observer = new MutationObserver(record);
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
  });
  record();
  return { seen, stop: () => observer.disconnect() };
}

/** The explanation of the header's dot, which describes the dot. */
function liveExplanation(): HTMLElement {
  const id = liveDot().getAttribute("aria-describedby");
  const found = id === null ? null : document.getElementById(id);
  if (found === null) {
    throw new Error("The dot has no description");
  }
  return found;
}

/** The `index`th connection the page made, once it is made. */
async function connection(page: ReturnType<typeof openPage>, index: number) {
  return waitFor(() => {
    const found = page.connector.connections[index];
    if (found === undefined) {
      throw new Error(`Connection ${index} not made yet`);
    }
    return found;
  });
}

function withNewPullRequest(
  fixtures: MockActivityFixtures,
): MockActivityFixtures {
  const createdAt = new Date(now.getTime() - minute).toISOString();
  return {
    ...fixtures,
    pullRequests: [
      ...fixtures.pullRequests,
      {
        id: "PR_mock_live",
        repository: {
          id: "R_mock-org/web",
          ownerLogin: "mock-org",
          name: "web",
        },
        number: 98,
        title: newTitle,
        state: "open",
        draft: false,
        additions: 3,
        deletions: 1,
        authorId: "1001",
        createdAt,
      },
    ],
    activities: [
      ...fixtures.activities,
      {
        kind: "opened",
        pullRequestId: "PR_mock_live",
        actorId: "1001",
        occurredAt: createdAt,
      },
    ],
  };
}

/** Waits until the activity has been asked for `count` times, and settled. */
async function fetchedTimes(mock: ApiMock, count: number): Promise<void> {
  await waitFor(() => expect(mock.activityRequests).toHaveLength(count));
  await pullRequestTitles();
}

describe("live updates", () => {
  it("subscribes to the channel of a signal token asked for with the session's token", async () => {
    const page = openPage();

    const connection = await connected(page);

    expect(connection.token).toMatchObject({
      token: "mock-signal-token-1",
      channel: "/mock-yagura-viewers/1004",
    });
  });

  it("sends the token request with the bearer token", async () => {
    const page = openPage();
    await pullRequestTitles();

    await waitFor(() => expect(page.mock.signalTokenRequests).toHaveLength(1));
    const [request] = page.mock.signalTokenRequests;
    expect(request?.authorization).toBe(
      `Bearer ${page.controller.accessToken}`,
    );
  });

  it("fetches the activity again on a signal, and draws it in place", async () => {
    const page = openPage();
    const connection = await connected(page);
    expect(await pullRequestTitles()).not.toContain(newTitle);
    // A narrowing of the list by the chart stays through the update.
    const [choice] = within(
      screen.getByRole("group", {
        name: "Merged pull requests and pushes per day",
      }),
    ).getAllByRole("button", { pressed: false });
    if (choice === undefined) {
      throw new Error("The chart has nothing to choose");
    }
    fireEvent.click(choice);
    const table = await waitFor(() =>
      screen.getByRole("table", { name: "Pull requests" }),
    );
    page.mock.fixtures = withNewPullRequest(page.mock.fixtures);

    connection.signal({
      repositoryId: "R_mock-org/web",
      pullRequestId: "PR_mock_live",
      kind: "opened",
    });
    expect(page.mock.activityRequests).toHaveLength(0);
    advance(page.timer, burstMs);
    await fetchedTimes(page.mock, 1);

    expect(choice).toHaveAttribute("aria-pressed", "true");
    // The list is the same element, drawn again rather than anew, so that
    // it keeps where it was scrolled to.
    expect(screen.getByRole("table", { name: "Pull requests" })).toBe(table);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(await pullRequestTitles()).toContain(newTitle);
  });

  it("fetches once when the organization on screen is imported, and drops the notice of its import", async () => {
    const test = testController({ signedIn: true, clock: () => now });
    test.mock.importing = [mockOrganization];
    const page = renderPage(test, true);
    const connection = await connected(page);
    expect(screen.getByText(importingNotice)).toBeInTheDocument();
    page.mock.importing = [];

    connection.signal({
      kind: "imported",
      organizationId: mockOrganizationId(mockOrganization),
    });
    advance(page.timer, burstMs);
    await fetchedTimes(page.mock, 1);

    expect(screen.queryByText(importingNotice)).not.toBeInTheDocument();
    advance(page.timer, burstMs);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(page.mock.activityRequests).toHaveLength(1);
  });

  it("fetches nothing when another organization is imported", async () => {
    const page = openPage();
    const connection = await connected(page);

    connection.signal({ kind: "imported", organizationId: "O_another-org" });
    advance(page.timer, burstMs);
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(page.mock.activityRequests).toHaveLength(0);
  });

  it("fetches once for activity in a burst with another organization's import", async () => {
    const page = openPage();
    const connection = await connected(page);

    connection.signal({ kind: "imported", organizationId: "O_another-org" });
    connection.signal({
      repositoryId: "R_mock-org/web",
      pullRequestId: "PR_mock_live",
      kind: "pushed",
    });
    advance(page.timer, burstMs);

    await fetchedTimes(page.mock, 1);
  });

  it("fetches once for a burst of signals", async () => {
    const page = openPage();
    const connection = await connected(page);

    connection.signal();
    advance(page.timer, burstMs / 2);
    connection.signal();
    connection.signal();
    advance(page.timer, burstMs / 2);
    await fetchedTimes(page.mock, 1);
    advance(page.timer, burstMs);

    await pullRequestTitles();
    expect(page.mock.activityRequests).toHaveLength(1);
  });

  it("never runs two fetches at once, fetching once more after the running one", async () => {
    const page = openPage();
    const connection = await connected(page);
    const release = page.mock.holdRequests(
      ({ url }) => new URL(url).pathname === "/activity",
    );

    connection.signal();
    advance(page.timer, burstMs);
    await waitFor(() => expect(page.mock.activityRequests).toHaveLength(1));
    connection.signal();
    advance(page.timer, burstMs);
    connection.signal();
    advance(page.timer, burstMs);
    // Give a second request the time to be sent, were it to be.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(page.mock.activityRequests).toHaveLength(1);

    release();
    await fetchedTimes(page.mock, 2);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(page.mock.activityRequests).toHaveLength(2);
  });

  it("connects again with a fresh token when the connection drops, then fetches once", async () => {
    const page = openPage();
    const connection = await connected(page);

    connection.drop();
    expect(page.mock.signalTokenRequests).toHaveLength(0);
    advance(page.timer, firstRetryMs);
    const again = await waitFor(() => {
      const next = page.connector.connections[1];
      if (next === undefined) {
        throw new Error("Not connected again yet");
      }
      return next;
    });

    expect(page.mock.signalTokenRequests).toHaveLength(1);
    expect(again.token).toMatchObject({ token: "mock-signal-token-2" });
    expect(page.mock.activityRequests).toHaveLength(0);
    again.subscribed();
    advance(page.timer, burstMs);
    await fetchedTimes(page.mock, 1);
  });

  it("waits longer after each failure to connect, without an alert", async () => {
    const page = openPage();
    const connection = await connected(page);

    // With the shortest waits, the first is half of the first ceiling.
    const first = firstRetryMs / 2;
    connection.drop();
    advance(page.timer, first);
    await waitFor(() => expect(page.connector.connections).toHaveLength(2));
    page.connector.connections[1]?.drop();
    // The second wait is twice the first.
    advance(page.timer, first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(page.connector.connections).toHaveLength(2);
    advance(page.timer, first);
    await waitFor(() => expect(page.connector.connections).toHaveLength(3));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("tries a failed token request again, showing it only as not live", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const page = openPage();
    // Ahead of the API mock's handlers, which the page installed.
    server.use(
      http.post(
        signalTokenUrl,
        () => HttpResponse.json({ error: "internal_error" }, { status: 500 }),
        { once: true },
      ),
    );
    await pullRequestTitles();
    await waitFor(() => expect(liveStatus()).toBe("Not live"));
    expect(page.connector.connections).toHaveLength(0);

    advance(page.timer, firstRetryMs);
    await waitFor(() => expect(page.connector.connections).toHaveLength(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("refreshes the session when the token request answers 401, as for any expired token", async () => {
    const page = openPage();
    // Ahead of the API mock's handlers, which the page installed.
    server.use(
      http.post(
        signalTokenUrl,
        () => HttpResponse.json({ error: "invalid_token" }, { status: 401 }),
        { once: true },
      ),
    );

    await pullRequestTitles();
    await waitFor(() => expect(page.connector.connections).toHaveLength(1));
    expect(
      page.mock.requestsTo("POST", `${sessionApi}/session/refresh`),
    ).toHaveLength(2);
    expect(page.connector.connections[0]?.token).toMatchObject({
      token: "mock-signal-token-1",
    });
  });

  it("fetches once when the page is shown again after it was hidden", async () => {
    const page = openPage();
    await connected(page);

    act(() => page.visibility.set(false));
    advance(page.timer, burstMs);
    expect(page.mock.activityRequests).toHaveLength(0);
    act(() => page.visibility.set(true));
    advance(page.timer, burstMs);

    await fetchedTimes(page.mock, 1);
  });

  it("connects at once when the page is shown again without a connection", async () => {
    const page = openPage();
    const connection = await connected(page);

    connection.drop();
    act(() => page.visibility.set(false));
    act(() => page.visibility.set(true));

    await waitFor(() => expect(page.connector.connections).toHaveLength(2));
    advance(page.timer, burstMs);
    await fetchedTimes(page.mock, 1);
  });

  it("closes the connection on sign-out", async () => {
    const page = openPage();
    const connection = await connected(page);

    signOut();

    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(connection.closedByApp).toBe(true);
    expect(page.connector.open).toEqual([]);
    expect(page.visibility.listeners).toBe(0);
    expect(page.timer.pending).toBe(0);
  });

  it("closes the connection when the session ends", async () => {
    const page = openPage();
    const connection = await connected(page);

    page.mock.signedIn = false;
    // The session API answers 401 to the refresh the next update makes.
    connection.signal();
    advance(page.timer, burstMs);

    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(connection.closedByApp).toBe(true);
    expect(page.connector.open).toEqual([]);
  });

  it("is not live without the signal hosts", async () => {
    const page = openPage({ live: false });

    await pullRequestTitles();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(page.mock.signalTokenRequests).toEqual([]);
    expect(page.connector.connections).toEqual([]);
    expect(page.visibility.listeners).toBe(0);
  });

  it("replaces the connection when the page is shown again after a long absence", async () => {
    const page = openPage();
    const first = await connected(page);

    act(() => page.visibility.set(false));
    advance(page.timer, longAbsenceMs);
    act(() => page.visibility.set(true));

    expect(first.closedByApp).toBe(true);
    expect(liveStatus()).toBe("Connecting");
    const second = await connection(page, 1);
    act(() => second.subscribed());
    expect(liveStatus()).toBe("Live");
    expect(page.connector.open).toEqual([second]);
    advance(page.timer, burstMs);
    await fetchedTimes(page.mock, 1);
  });

  it("keeps the connection when the page is shown again after a short absence", async () => {
    const page = openPage();
    const only = await connected(page);

    act(() => page.visibility.set(false));
    advance(page.timer, longAbsenceMs - 1);
    act(() => page.visibility.set(true));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(only.closed).toBe(false);
    expect(page.connector.connections).toHaveLength(1);
    expect(liveStatus()).toBe("Live");
  });

  it("connects at once when the browser is back online while waiting to retry", async () => {
    const page = openPage();
    const first = await connected(page);

    first.drop();
    act(() => page.network.report("online"));

    await connection(page, 1);
    expect(page.timer.pending).toBe(0);
  });

  it("does nothing when the browser is back online while connected", async () => {
    const page = openPage();
    const only = await connected(page);

    act(() => page.network.report("online"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(only.closed).toBe(false);
    expect(page.connector.connections).toHaveLength(1);
    expect(page.mock.signalTokenRequests).toHaveLength(0);
  });

  it("stops listening to the network on sign-out", async () => {
    const page = openPage();
    await connected(page);

    signOut();

    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(page.network.listeners).toBe(0);
  });
});

describe("the live status", () => {
  it("follows the connection, starting for the first moment", async () => {
    const page = openPage();
    await sessionShown();
    expect(liveState()).toBe("starting");
    expect(liveStatus()).toBe("Connecting");
    await pullRequestTitles();
    const first = await connection(page, 0);
    expect(liveState()).toBe("starting");

    advance(page.timer, connectingGraceMs - 1);
    expect(liveState()).toBe("starting");
    advance(page.timer, 1);
    expect(liveState()).toBe("connecting");
    expect(liveStatus()).toBe("Connecting");
    act(() => first.subscribed());
    expect(liveStatus()).toBe("Live");

    act(() => first.drop());
    expect(liveStatus()).toBe("Not live");
    advance(page.timer, firstRetryMs);
    await waitFor(() => expect(liveState()).toBe("connecting"));
    const second = await connection(page, 1);
    act(() => second.subscribed());
    expect(liveStatus()).toBe("Live");
  });

  it("goes from starting to live when subscribed within the first moment", async () => {
    const recording = recordLiveStates();
    const page = openPage();

    await connected(page);
    advance(page.timer, connectingGraceMs);
    recording.stop();
    const { seen } = recording;

    expect(liveStatus()).toBe("Live");
    expect(seen).toContain("starting");
    expect(seen).not.toContain("connecting");
    expect(seen).not.toContain(undefined);
  });

  it("is not shown without the signal hosts, as with the API mock", async () => {
    // The development mode with the API mock has no signal hosts either.
    const page = openPage({ live: false });
    expect(liveState()).toBeUndefined();

    await pullRequestTitles();
    advance(page.timer, connectingGraceMs);

    expect(liveState()).toBeUndefined();
  });

  it("is not shown signed out", async () => {
    const page = openPage();
    await connected(page);
    expect(liveStatus()).toBe("Live");

    signOut();

    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(liveState()).toBeUndefined();
  });

  it("is not shown signed out from the start", async () => {
    const test = testController({ signedIn: false, clock: () => now });
    renderPage(test, true);

    expect(liveState()).toBeUndefined();
    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(liveState()).toBeUndefined();
  });

  it("is described by its explanation in each state", async () => {
    const page = openPage();
    await sessionShown();
    expect(liveDot()).toHaveAccessibleDescription("Connecting…");
    const first = await connection(page, 0);

    advance(page.timer, connectingGraceMs);
    expect(liveState()).toBe("connecting");
    expect(liveDot()).toHaveAccessibleDescription("Connecting…");
    act(() => first.subscribed());
    expect(liveDot()).toHaveAccessibleDescription(
      "Live. Updates appear within seconds.",
    );
    act(() => first.drop());
    expect(liveDot()).toHaveAccessibleDescription(
      "Not live. Reload to update.",
    );
    expect(liveExplanation()).not.toBeVisible();
  });

  it("explains itself on hover and on focus, until left", async () => {
    const page = openPage();
    await connected(page);
    const explanation = "Live. Updates appear within seconds.";
    expect(liveExplanation()).toHaveTextContent(explanation);
    expect(liveExplanation()).not.toBeVisible();

    fireEvent.pointerEnter(liveDot(), { pointerType: "mouse" });
    expect(liveExplanation()).toBeVisible();
    expect(liveDot()).toHaveAttribute("aria-expanded", "true");
    fireEvent.pointerLeave(liveDot(), { pointerType: "mouse" });
    expect(liveExplanation()).not.toBeVisible();

    fireEvent.focus(liveDot());
    expect(liveExplanation()).toBeVisible();
    fireEvent.blur(liveDot());
    expect(liveExplanation()).not.toBeVisible();
  });

  it("closes on Escape when opened by pointing or focus, leaving focus where it is", async () => {
    const page = openPage();
    await connected(page);
    const elsewhere = menuButton();

    // Opened by pointing while focus is elsewhere.
    act(() => elsewhere.focus());
    fireEvent.pointerEnter(liveDot(), { pointerType: "mouse" });
    expect(liveExplanation()).toBeVisible();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(liveExplanation()).not.toBeVisible();
    expect(elsewhere).toHaveFocus();
    fireEvent.pointerLeave(liveDot(), { pointerType: "mouse" });

    // Opened by focus.
    act(() => liveDot().focus());
    expect(liveExplanation()).toBeVisible();
    fireEvent.keyDown(liveDot(), { key: "Escape" });
    expect(liveExplanation()).not.toBeVisible();
    expect(liveDot()).toHaveFocus();
  });

  it("explains itself on a tap, until a tap outside, Escape or a second tap", async () => {
    const page = openPage();
    const first = await connected(page);
    act(() => first.drop());
    const explanation = "Not live. Reload to update.";
    expect(liveExplanation()).toHaveTextContent(explanation);

    // A touch has no hover; the tap opens it.
    fireEvent.pointerEnter(liveDot(), { pointerType: "touch" });
    expect(liveExplanation()).not.toBeVisible();
    fireEvent.click(liveDot());
    expect(liveExplanation()).toBeVisible();
    fireEvent.pointerDown(screen.getByRole("main"));
    expect(liveExplanation()).not.toBeVisible();

    // After a press, Escape returns focus to the dot.
    fireEvent.click(liveDot());
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(liveExplanation()).not.toBeVisible();
    expect(liveDot()).toHaveFocus();

    fireEvent.click(liveDot());
    expect(liveExplanation()).toBeVisible();
    fireEvent.click(liveDot());
    expect(liveExplanation()).not.toBeVisible();
  });

  it("is not announced as it changes", async () => {
    const page = openPage();
    await sessionShown();
    expect(liveDot().closest("[aria-live], [role=status]")).toBeNull();
    await connected(page);

    expect(liveDot().closest("[aria-live], [role=status]")).toBeNull();
  });
});
