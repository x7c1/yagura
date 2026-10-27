import {
  mockLogin,
  mockOrganization,
  mockOrganizationId,
  type ApiMock,
  type MockActivityFixtures,
} from "@yagura/api-mocks";
import { MemoryJsonStore, type JsonStore } from "@yagura/browser";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { http, HttpResponse, type HttpHandler } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { viewerCachePrefix } from "./shared";
import {
  findOrganization,
  membersPageUrl,
  memberSummaryRows,
  mockListedPullRequests,
  organizationIdentity,
  pullRequestTitles,
  server,
  sessionApi,
  shownMemberSummaryRows,
  shownPullRequestTitles,
  showPage,
  signOut,
  testController,
  testPreferences,
  testTheme,
  testWidths,
  titlesOf,
} from "./test-support";

const minute = 60 * 1000;
const day = 24 * 60 * minute;

const activityUrl = `${sessionApi}/activity`;
const organizationsUrl = `${sessionApi}/activity/organizations`;
const activityKey = `${viewerCachePrefix(mockLogin)}organization-activity/${mockOrganizationId(mockOrganization)}`;
const organizationsKey = `${viewerCachePrefix(mockLogin)}organizations`;

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const firstLoad = new Date(2026, 9, 12, 15, 30);

/**
 * A page that can be loaded again, as a reload would: each load renders the
 * app with a new controller over the same API mock, browser cache and clock.
 */
function page(cache: JsonStore = new MemoryJsonStore()) {
  let now = firstLoad;
  let url: string | undefined;
  let mock: ApiMock | undefined;
  return {
    cache,
    get mock(): ApiMock {
      if (!mock) {
        throw new Error("Not loaded yet");
      }
      return mock;
    },
    get now(): Date {
      return now;
    },
    /** Moves the clock `ms` past the first load. */
    advanceTo(ms: number): void {
      now = new Date(firstLoad.getTime() + ms);
    },
    /** Opens the app at `pageUrl` from now on, instead of at its root. */
    at(pageUrl: string): void {
      url = pageUrl;
    },
    /**
     * Renders the app, without waiting for anything. `handlers` take
     * precedence over the API mock's.
     */
    open(...handlers: HttpHandler[]): void {
      cleanup();
      mock?.clearRequests();
      const test = testController({
        signedIn: true,
        cache,
        clock: () => now,
        mock,
        url,
      });
      mock = test.mock;
      server.use(...handlers);
      render(
        <App
          session={test.controller}
          widths={testWidths()}
          theme={testTheme()}
          preferences={testPreferences()}
        />,
      );
    },
    /**
     * Renders the app and resolves to the listed titles once nothing is
     * loading or updating. `handlers` take precedence over the API mock's.
     */
    async load(...handlers: HttpHandler[]): Promise<string[]> {
      this.open(...handlers);
      return pullRequestTitles();
    },
  };
}

/**
 * The fixtures with a pull request that `mock-alice` opened 5 minutes
 * after the first load.
 */
function withNewPullRequest(
  fixtures: MockActivityFixtures,
): MockActivityFixtures {
  const createdAt = new Date(firstLoad.getTime() + 5 * minute).toISOString();
  return {
    ...fixtures,
    pullRequests: [
      ...fixtures.pullRequests,
      {
        id: "PR_mock_new",
        repository: {
          id: "R_mock-org/web",
          ownerLogin: "mock-org",
          name: "web",
        },
        number: 99,
        title: "Open a pull request after the first load",
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
        pullRequestId: "PR_mock_new",
        actorId: "1001",
        occurredAt: createdAt,
      },
    ],
  };
}

/** An activity API answer of 502, as when GitHub fails behind it. */
const upstreamError = () =>
  HttpResponse.json(
    { error: "upstream_error", error_description: "GitHub failed." },
    { status: 502 },
  );

describe("Asking the activity API", () => {
  it("asks for the organization's activity over the period with the bearer token and no cookies", async () => {
    const view = page();
    await view.load();

    const [request, ...others] = view.mock.activityRequests;
    expect(others).toEqual([]);
    const params = new URL(request?.url ?? "").searchParams;
    expect(params.get("organization")).toBe(
      mockOrganizationId(mockOrganization),
    );
    // From local midnight 13 days back up to local midnight after today.
    expect(new Date(params.get("from") ?? "")).toEqual(new Date(2026, 8, 29));
    expect(new Date(params.get("to") ?? "")).toEqual(new Date(2026, 9, 13));
    expect(request?.authorization).toMatch(/^Bearer ghu_mock_\d+$/);
    expect(request?.credentials).not.toBe("include");
  });
});

describe("The browser cache", () => {
  it("keeps the last response per viewer and organization, and the organizations", async () => {
    const view = page();
    await view.load();

    const stored = await view.cache.get(activityKey);
    expect(stored).toMatchObject({ storedAt: firstLoad.getTime() });
    expect(await view.cache.get(organizationsKey)).toMatchObject({
      storedAt: firstLoad.getTime(),
      response: {
        organizations: [
          expect.objectContaining({
            id: mockOrganizationId(mockOrganization),
            login: mockOrganization,
          }),
        ],
      },
    });
  });

  it("asks again on every load, and stores the answer in place of the last one", async () => {
    const view = page();
    await view.load();
    view.mock.fixtures = withNewPullRequest(view.mock.fixtures);
    view.advanceTo(10 * minute);

    const titles = await view.load();

    expect(titles).toContain("Open a pull request after the first load");
    expect(view.mock.activityRequests).toHaveLength(1);
    expect(await view.cache.get(activityKey)).toMatchObject({
      storedAt: firstLoad.getTime() + 10 * minute,
    });
  });

  it("deletes the viewer's entries on sign-out, and only theirs", async () => {
    const cache = new MemoryJsonStore();
    const other = `${viewerCachePrefix("someone-else")}organizations`;
    await cache.set(other, { storedAt: 0, response: [] });
    const view = page(cache);
    await view.load();
    expect(cache.keys).toEqual(
      expect.arrayContaining([activityKey, organizationsKey]),
    );

    signOut();
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    await vi.waitFor(() => {
      expect(cache.keys).toEqual([other]);
    });
  });

  it("is not needed: a store that always fails still yields the full list", async () => {
    const fail = () => {
      throw new Error("The operation is insecure.");
    };
    const failing: JsonStore = {
      get: fail,
      set: fail,
      delete: fail,
      deleteByPrefix: fail,
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const view = page(failing);

    expect(await view.load()).toEqual(
      titlesOf(mockListedPullRequests(view.mock, firstLoad)),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    signOut();
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("Drawing from the cache first", () => {
  const updating = () => screen.queryByText("Updating…");

  it("shows the stored response while the update runs, then the API's answer", async () => {
    const view = page();
    const stored = await view.load();
    showPage("Members");
    const storedRows = shownMemberSummaryRows();
    view.mock.fixtures = withNewPullRequest(view.mock.fixtures);
    view.advanceTo(10 * minute);
    const release = view.mock.holdRequests(
      ({ url }) => new URL(url).pathname === "/activity",
    );

    view.open();
    await screen.findByRole("table", { name: "Pull requests" });

    expect(shownPullRequestTitles()).toEqual(stored);
    expect(updating()).toBeInTheDocument();
    showPage("Members");
    expect(shownMemberSummaryRows()).toEqual(storedRows);
    expect(updating()).toBeInTheDocument();
    showPage("Activity");

    release();
    const fetched = await pullRequestTitles();
    expect(fetched[0]).toBe("Open a pull request after the first load");
    expect(fetched.slice(1)).toEqual(stored);
    expect(updating()).not.toBeInTheDocument();
  });

  it("keeps whether the organization was imported, and draws the notice of an import from it until the answer says otherwise", async () => {
    const notice = `Importing the last 14 days of ${mockOrganization}. This can take a few minutes.`;
    const view = page();
    view.open();
    view.mock.importing = [mockOrganization];
    const stored = await pullRequestTitles();
    expect(screen.getByText(notice)).toBeInTheDocument();
    expect(await view.cache.get(activityKey)).toMatchObject({
      response: { importedAt: null },
    });
    view.mock.importing = [];
    view.advanceTo(10 * minute);
    const release = view.mock.holdRequests(
      ({ url }) => new URL(url).pathname === "/activity",
    );

    view.open();
    await screen.findByRole("table", { name: "Pull requests" });

    expect(shownPullRequestTitles()).toEqual(stored);
    expect(screen.getByText(notice)).toBeInTheDocument();
    release();
    await pullRequestTitles();
    expect(screen.queryByText(notice)).not.toBeInTheDocument();
    expect(await view.cache.get(activityKey)).toMatchObject({
      response: { importedAt: firstLoad.toISOString() },
    });
  });

  it("draws nothing stored 7 days ago or more", async () => {
    const view = page();
    await view.load();
    view.advanceTo(7 * day);
    const release = view.mock.holdRequests(
      ({ url }) => new URL(url).pathname === "/activity",
    );

    view.open();
    await findOrganization(mockOrganization);

    expect(await screen.findByText("Loading pull requests…")).toBeVisible();
    expect(
      screen.queryByRole("table", { name: "Pull requests" }),
    ).not.toBeInTheDocument();
    release();
    await pullRequestTitles();
  });

  it("keeps the stored response when the update fails, and retries", async () => {
    const view = page();
    const stored = await view.load();
    let failing = true;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    view.open(
      http.get(activityUrl, () => (failing ? upstreamError() : undefined)),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      `Could not update the activity of ${mockOrganization}'s members because GitHub or Yagura is not working right now, so what is shown may be out of date. Retry in a moment, or reload the page if it keeps failing.`,
    );
    expect(shownPullRequestTitles()).toEqual(stored);
    expect(updating()).not.toBeInTheDocument();
    warn.mockRestore();

    failing = false;
    fireEvent.click(
      within(alert.parentElement as HTMLElement).getByRole("button", {
        name: "Retry",
      }),
    );

    expect(await pullRequestTitles()).toEqual(stored);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says each page is loading while nothing is stored, and shows a failure in its place", async () => {
    const view = page();
    view.at(membersPageUrl);
    let failing = true;
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    view.open(
      http.get(activityUrl, async () => {
        await answered;
        return failing ? upstreamError() : undefined;
      }),
    );

    expect(await screen.findByText("Loading members…")).toBeVisible();
    showPage("Activity");
    expect(screen.getByText("Loading pull requests…")).toBeVisible();
    showPage("Members");
    answer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Could not load the activity of ${mockOrganization}'s members`,
    );
    expect(screen.queryByText("Loading members…")).not.toBeInTheDocument();
    warn.mockRestore();

    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect((await memberSummaryRows()).length).toBeGreaterThan(1);
  });

  it("draws the stored organizations at once, and again when the fetched list differs", async () => {
    const view = page();
    await view.load();
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });

    view.open(
      http.get(organizationsUrl, async () => {
        await answered;
        return HttpResponse.json({
          organizations: [
            {
              id: mockOrganizationId(mockOrganization),
              login: mockOrganization,
              avatarUrl: "data:,",
            },
            { id: "O_second", login: "second-org", avatarUrl: "data:," },
          ],
        });
      }),
    );

    // Drawn from the cache, before the request answers.
    await findOrganization(mockOrganization);
    expect(organizationIdentity(mockOrganization)).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    answer();

    await screen.findByRole("combobox", { name: "Organization" });
    await findOrganization(mockOrganization);
  });
});
