import { type ApiMock, type MockActivityFixtures } from "@yagura/api-mocks";
import { MemorySignalConnector } from "@yagura/activity-api";
import { ManualTimer, MemoryVisibility } from "@yagura/browser";
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
  firstRetryMs,
  type LiveUpdatesOptions,
} from "./features/live-updates";
import {
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

/**
 * The app, signed in, with live updates from a connector held in memory,
 * timed by a manual timer. With `live: false`, the app is given no live
 * updates, as a build without the signal hosts is.
 */
function openPage({ live = true }: { readonly live?: boolean } = {}) {
  const test = testController({ signedIn: true, clock: () => now });
  const connector = new MemorySignalConnector();
  const timer = new ManualTimer();
  const visibility = new MemoryVisibility();
  const liveUpdates: LiveUpdatesOptions = {
    connector,
    timer,
    visibility,
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
  return { ...test, connector, timer, visibility };
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
  connection.subscribed();
  page.mock.clearRequests();
  return connection;
}

/** Runs the timers due within `ms`, as React sees them. */
function advance(timer: ManualTimer, ms: number): void {
  act(() => timer.advance(ms));
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

  it("sends the token request with the bearer token and no cookies", async () => {
    const page = openPage();
    await pullRequestTitles();

    await waitFor(() => expect(page.mock.signalTokenRequests).toHaveLength(1));
    const [request] = page.mock.signalTokenRequests;
    expect(request?.authorization).toBe(
      `Bearer ${page.controller.accessToken}`,
    );
    expect(request?.credentials).toBe("omit");
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

  it("waits longer after each failure to connect, and never shows it", async () => {
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

  it("tries a failed token request again, without showing it", async () => {
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
    await waitFor(() => expect(page.timer.pending).toBeGreaterThan(0));
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
});
