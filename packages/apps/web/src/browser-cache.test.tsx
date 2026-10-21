import {
  measures,
  searchQuery,
  type MemberActivity,
  type PullRequest,
} from "@yagura/activity";
import {
  mockLogin,
  mockMemberLogins,
  mockOrganization,
  mockPullRequests,
  mockPullRequestTitles,
  type ApiMock,
  type MockPullRequestNode,
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
import {
  activityCacheKey,
  decodeMemberActivity,
} from "./features/pull-requests/activity-record";
import { viewerCachePrefix } from "./shared";
import {
  findOrganization,
  membersPageUrl,
  memberSummaryRows,
  mockDomainPullRequests,
  organizationIdentity,
  pullRequestTitles,
  server,
  shownMemberSummaryRows,
  shownPullRequestTitles,
  showPage,
  showsOrganization,
  signOut,
  testController,
  testTheme,
  testWidths,
} from "./test-support";

const minute = 60 * 1000;
const day = 24 * 60 * minute;

const graphqlUrl = "https://api.github.com/graphql";
const membersUrl = `https://api.github.com/orgs/${mockOrganization}/members?per_page=100`;
const installationsUrl =
  "https://api.github.com/user/installations?per_page=100";

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

/** The searches for every member and measure from `from` up to now. */
function searchesFrom(from: Date): string[] {
  return mockMemberLogins
    .flatMap((login) =>
      measures.map((measure) =>
        searchQuery(login, measure, { from, to: undefined }),
      ),
    )
    .sort();
}

/**
 * The ids of the fixture pull requests opened or merged in the period: all
 * but PR_mock_6, opened and merged before it.
 */
const periodIds = mockPullRequests(firstLoad)
  .map(({ id }) => id)
  .filter((id) => id !== "PR_mock_6")
  .sort();

/** A pull request opened 5 minutes after the first load. */
const newPullRequest: MockPullRequestNode = {
  __typename: "PullRequest",
  id: "PR_mock_new",
  title: "Open a pull request after the first load",
  url: "https://github.com/mock-org/web/pull/28",
  repository: { nameWithOwner: "mock-org/web" },
  author: { login: "mock-alice" },
  state: "OPEN",
  createdAt: new Date(firstLoad.getTime() + 5 * minute).toISOString(),
  mergedAt: null,
  additions: 3,
  deletions: 1,
};

/** The fixture pull request `id` as the app sees it. */
function fixture(id: string): PullRequest {
  const pullRequest = mockDomainPullRequests(firstLoad).find(
    (pr) => pr.id === id,
  );
  if (pullRequest === undefined) {
    throw new Error(`No fixture ${id}`);
  }
  return pullRequest;
}

async function storedActivity(
  cache: JsonStore,
  login: string,
): Promise<MemberActivity | undefined> {
  return decodeMemberActivity(
    await cache.get(viewerCachePrefix(mockLogin) + activityCacheKey(login)),
  );
}

async function storedDays(
  cache: JsonStore,
  login: string,
): Promise<string[] | undefined> {
  const activity = await storedActivity(cache, login);
  return activity && [...activity.days.opened.keys()].sort();
}

describe("The browser cache", () => {
  it("answers a second load within 10 minutes without GitHub requests", async () => {
    const view = page();
    expect(await view.load()).toEqual(mockPullRequestTitles);
    expect(view.mock.searches).toHaveLength(2 * mockMemberLogins.length);

    view.advanceTo(10 * minute - 1000);

    expect(await view.load()).toEqual(mockPullRequestTitles);
    expect(view.mock.requestsTo("POST", graphqlUrl)).toEqual([]);
    expect(view.mock.requestsTo("GET", membersUrl)).toEqual([]);
    expect(view.mock.requestsTo("GET", installationsUrl)).toEqual([]);
  });

  it("searches for ids and times, and looks up each found pull request once", async () => {
    const view = page();

    expect(await view.load()).toEqual(mockPullRequestTitles);

    // A pull request opened and merged in the period is found by both of
    // its author's searches and looked up once.
    expect(view.mock.lookups.flat().sort()).toEqual(periodIds);
    for (const lookup of view.mock.lookups) {
      expect(lookup.length).toBeGreaterThan(0);
      expect(lookup.length).toBeLessThanOrEqual(100);
    }
    expect(view.mock.lookups.length).toBeLessThanOrEqual(
      view.mock.searches.length,
    );
    const alice = await storedActivity(view.cache, "mock-alice");
    expect(alice?.pullRequests.get("PR_mock_2")?.pullRequest).toEqual({
      ...fixture("PR_mock_2"),
      state: "merged",
    });
  });

  it("searches only today after 10 minutes, and looks up only what may have changed", async () => {
    const view = page();
    await view.load();
    view.mock.addPullRequest(newPullRequest);

    view.advanceTo(10 * minute);

    expect(await view.load()).toEqual([
      "Open a pull request after the first load",
      ...mockPullRequestTitles,
    ]);
    expect([...view.mock.searches].sort()).toEqual(
      searchesFrom(new Date(2026, 9, 12)),
    );
    // The open and closed pull requests stored, today's open one among them
    // although today's search finds it again, and the new one; not those
    // merged earlier today (PR_mock_2, PR_mock_9), which today's searches
    // find too. Each once.
    expect(view.mock.lookups.flat().sort()).toEqual([
      "PR_mock_1",
      "PR_mock_10",
      "PR_mock_5",
      "PR_mock_7",
      "PR_mock_new",
    ]);
    expect(view.mock.requestsTo("GET", membersUrl)).toHaveLength(1);
  });

  it("stores the lookup's record of a stale pull request today's search finds", async () => {
    const view = page();
    await view.load();

    view.advanceTo(10 * minute);
    await view.load();

    const alice = await storedActivity(view.cache, "mock-alice");
    expect(alice?.days.opened.get("2026-10-12")?.ids).toEqual(["PR_mock_1"]);
    expect(alice?.pullRequests.get("PR_mock_1")).toEqual({
      storedAt: new Date(firstLoad.getTime() + 10 * minute),
      pullRequest: fixture("PR_mock_1"),
    });
  });

  it("sends the refresh of stale pull requests without waiting for the searches", async () => {
    const view = page();
    await view.load();
    view.advanceTo(10 * minute);
    const release = view.mock.holdGraphql(
      (variables) => typeof variables.query === "string",
    );

    const titles = view.load();

    await vi.waitFor(() => {
      expect(view.mock.lookups).toHaveLength(1);
    });
    // The searches the concurrency limit lets through have been sent, and
    // none has been answered.
    expect(view.mock.searches.length).toBeGreaterThan(0);
    release();
    expect(await titles).toEqual(mockPullRequestTitles);
    expect(view.mock.lookups).toHaveLength(1);
  });

  it("stores no day whose pull requests' lookup failed, so that the next load fetches them", async () => {
    const view = page();
    let failingNow = true;
    const failLookups = http.post(graphqlUrl, async ({ request }) => {
      const body = (await request.clone().json()) as {
        variables?: { ids?: unknown };
      };
      if (failingNow && body.variables?.ids !== undefined) {
        return HttpResponse.json({ message: "Server Error" }, { status: 502 });
      }
      return undefined;
    });
    await expect(view.load(failLookups)).rejects.toThrow();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the pull requests",
    );
    for (const login of mockMemberLogins) {
      const activity = await storedActivity(view.cache, login);
      for (const measure of measures) {
        for (const { ids } of activity?.days[measure].values() ?? []) {
          for (const id of ids) {
            expect(activity?.pullRequests.has(id)).toBe(true);
          }
        }
      }
    }

    failingNow = false;
    view.mock.clearRequests();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(view.mock.lookups.flat().sort()).toEqual(periodIds);
  });

  it("searches the previous day once more the next day, and no day before it", async () => {
    const view = page();
    await view.load();

    // October 13, 09:00.
    view.advanceTo(17.5 * 60 * minute);
    await view.load();

    expect([...view.mock.searches].sort()).toEqual(
      searchesFrom(new Date(2026, 9, 12)),
    );

    // Within 10 minutes, the previous day is complete.
    view.mock.clearRequests();
    view.advanceTo(17.5 * 60 * minute + 9 * minute);
    await view.load();
    expect(view.mock.searches).toEqual([]);
  });

  it("searches again what was stored 7 days ago, and drops the days out of the period", async () => {
    const view = page();
    await view.load();
    expect(await storedDays(view.cache, "mock-alice")).toContain("2026-09-29");

    // October 19, 16:30: the period starts on October 6.
    view.advanceTo(7 * day + 60 * minute);
    await view.load();

    expect([...view.mock.searches].sort()).toEqual(
      searchesFrom(new Date(2026, 9, 6)),
    );
    const days = await storedDays(view.cache, "mock-alice");
    expect(days?.[0]).toBe("2026-10-06");
    expect(days).toHaveLength(14);
  });

  it("deletes the viewer's entries on sign-out, and only theirs", async () => {
    const cache = new MemoryJsonStore();
    const other = `${viewerCachePrefix("someone-else")}members/other-org`;
    await cache.set(other, { storedAt: 0, members: [] });
    const view = page(cache);
    await view.load();
    expect(
      cache.keys.filter((key) => key.startsWith(viewerCachePrefix(mockLogin))),
    ).toHaveLength(2 + mockMemberLogins.length);
    expect(cache.keys).toContain(
      `${viewerCachePrefix(mockLogin)}installations`,
    );

    signOut();
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    await vi.waitFor(() => {
      expect(cache.keys).toEqual([other]);
    });
  });

  it("keeps the searches that succeeded when another fails, so that a retry repeats only the failed one", async () => {
    const view = page();
    const failing = searchQuery(mockLogin, "merged", {
      from: new Date(2026, 8, 29),
      to: undefined,
    });
    let failingNow = true;
    const failOnce = http.post(graphqlUrl, async ({ request }) => {
      const body = (await request.clone().json()) as {
        variables?: { query?: unknown };
      };
      if (failingNow && body.variables?.query === failing) {
        // Fail once the other searches' lookups are sent: a failure stops
        // the requests not sent yet.
        await vi.waitFor(() => {
          expect(view.mock.lookups.flat()).toHaveLength(periodIds.length);
        });
        return HttpResponse.json({ message: "Server Error" }, { status: 502 });
      }
      return undefined;
    });
    // The list never shows, so waiting for it fails.
    await expect(view.load(failOnce)).rejects.toThrow();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Could not load the pull requests",
    );

    failingNow = false;
    view.mock.clearRequests();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(view.mock.searches).toEqual([failing]);
    expect(view.mock.lookups).toEqual([]);
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

    expect(await view.load()).toEqual(mockPullRequestTitles);
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
  const chart = () =>
    screen.queryByRole("group", {
      name: "Merged pull requests per day",
    });
  const failSearches = (failing: () => boolean) =>
    http.post(graphqlUrl, async ({ request }) => {
      const body = (await request.clone().json()) as {
        variables?: { query?: unknown };
      };
      if (failing() && body.variables?.query !== undefined) {
        return HttpResponse.json({ message: "Server Error" }, { status: 502 });
      }
      return undefined;
    });

  it("shows the stored pull requests while the update runs, then the fetched ones", async () => {
    const view = page();
    await view.load();
    showPage("Members");
    const cachedRows = shownMemberSummaryRows();
    view.mock.addPullRequest(newPullRequest);
    view.advanceTo(10 * minute);
    view.mock.clearRequests();
    const release = view.mock.holdGraphql(() => true);

    view.open();

    await screen.findByText("Updating…");
    expect(shownPullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(chart()).toBeInTheDocument();
    expect(view.mock.searches.length).toBeGreaterThan(0);
    showPage("Members");
    expect(shownMemberSummaryRows()).toEqual(cachedRows);
    expect(updating()).toBeInTheDocument();
    showPage("Activity");

    release();

    expect(await pullRequestTitles()).toEqual([
      newPullRequest.title,
      ...mockPullRequestTitles,
    ]);
    expect(updating()).not.toBeInTheDocument();
  });

  it("shows the stored pull requests within 10 minutes without a GraphQL request or a note", async () => {
    const view = page();
    await view.load();
    view.advanceTo(10 * minute - 1000);

    view.open();

    await screen.findByRole("table", { name: "Pull requests" });
    expect(updating()).not.toBeInTheDocument();
    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(view.mock.requestsTo("POST", graphqlUrl)).toEqual([]);
  });

  it("keeps the stored pull requests when the update fails, and retries", async () => {
    const view = page();
    await view.load();
    view.mock.addPullRequest(newPullRequest);
    view.advanceTo(10 * minute);
    let failing = true;

    view.open(failSearches(() => failing));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Could not update the pull requests of ${mockOrganization}'s members because GitHub or Yagura is not working right now, so what is shown may be out of date. Retry in a moment, or reload the page if it keeps failing.`,
    );
    expect(shownPullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(updating()).not.toBeInTheDocument();

    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(shownPullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(await pullRequestTitles()).toEqual([
      newPullRequest.title,
      ...mockPullRequestTitles,
    ]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("lists the members with placeholders while nothing is stored", async () => {
    const view = page();
    view.at(membersPageUrl);
    view.open();
    // The mock exists once the app is rendered.
    const release = view.mock.holdGraphql(() => true);

    await screen.findByRole("table", { name: "Members" });
    const placeholders = ["…", "…", "…", "…"];
    expect(shownMemberSummaryRows()).toEqual([
      ...mockMemberLogins.map((login) => [login, ...placeholders]),
      ["Total", ...placeholders],
    ]);
    // While loading, the cards are headed as when loaded: the members' card
    // not at all, and on the activity page only the chart's card.
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
    showPage("Activity");
    expect(screen.getByText("Loading pull requests…")).toBeInTheDocument();
    expect(chart()).not.toBeInTheDocument();
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Merged PRs",
    ]);
    expect(
      within(
        screen
          .getByText("Loading pull requests…")
          .closest("section") as HTMLElement,
      ).queryByRole("heading"),
    ).not.toBeInTheDocument();

    release();

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    showPage("Members");
    expect((await memberSummaryRows()).flat()).not.toContain("…");
  });

  it("keeps the placeholders when nothing is stored and the fetch fails, and retries", async () => {
    const view = page();
    view.at(membersPageUrl);
    let failing = true;

    view.open(failSearches(() => failing));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Could not load the pull requests of ${mockOrganization}'s members`,
    );
    expect(shownMemberSummaryRows().map(([login]) => login)).toEqual([
      ...mockMemberLogins,
      "Total",
    ]);
    expect(shownMemberSummaryRows()[0]?.slice(1)).toEqual(["…", "…", "…", "…"]);
    // On the activity page, the failure takes the place of the list.
    showPage("Activity");
    expect(screen.getByRole("alert")).toHaveTextContent(
      `Could not load the pull requests of ${mockOrganization}'s members`,
    );
    expect(
      screen.queryByText("Loading pull requests…"),
    ).not.toBeInTheDocument();

    failing = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
  });

  it("draws the stored installations and members past 10 minutes before they are fetched again", async () => {
    const view = page();
    await view.load();
    view.advanceTo(10 * minute);
    const release = view.mock.holdRequests(
      ({ url }) => url === installationsUrl || url === membersUrl,
    );

    view.open();

    await screen.findByRole("table", { name: "Pull requests" });
    await vi.waitFor(() => {
      expect(view.mock.requestsTo("GET", installationsUrl)).toHaveLength(1);
      expect(view.mock.requestsTo("GET", membersUrl)).toHaveLength(1);
    });
    expect(showsOrganization(mockOrganization)).toBe(true);
    // The organization's avatar is stored with it, so that it is drawn
    // before the installations are fetched again.
    expect(
      organizationIdentity(mockOrganization).querySelector("img"),
    ).toHaveAttribute("src", expect.stringMatching(/^data:image\/svg\+xml,/));

    release();

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("draws a stored organization without an avatar with its initial until the fetch brings the avatar", async () => {
    const view = page();
    await view.load();
    view.advanceTo(10 * minute);
    // As stored before the organization's avatar was kept.
    await view.cache.set(`${viewerCachePrefix(mockLogin)}installations`, {
      storedAt: firstLoad.getTime(),
      items: [{ login: mockOrganization }],
    });
    const release = view.mock.holdRequests(
      ({ url }) => url === installationsUrl,
    );

    view.open();

    const identity = () => organizationIdentity(mockOrganization);
    await findOrganization(mockOrganization);
    expect(identity().querySelector("img")).toBeNull();
    expect(
      within(identity()).getByText(mockOrganization.charAt(0).toUpperCase()),
    ).toHaveAttribute("aria-hidden", "true");

    release();

    await vi.waitFor(() => {
      expect(identity().querySelector("img")).toHaveAttribute(
        "src",
        expect.stringMatching(/^data:image\/svg\+xml,/),
      );
    });
  });

  it("shows the first fetched organization when the stored one is no longer listed", async () => {
    const view = page();
    await view.load();
    view.advanceTo(10 * minute);
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });

    view.open(
      http.get(installationsUrl.replace(/\?.*$/, ""), async () => {
        await answered;
        return HttpResponse.json({
          total_count: 1,
          installations: [
            { id: 1, account: { login: "other-org", type: "Organization" } },
          ],
        });
      }),
    );

    await findOrganization(mockOrganization);
    answer();

    await findOrganization("other-org");
    expect(showsOrganization(mockOrganization)).toBe(false);
  });

  it("draws again with a fetched member list that differs from the stored one", async () => {
    const view = page();
    await view.load();
    view.advanceTo(10 * minute);
    const fewer = mockMemberLogins.filter((login) => login !== "mock-carol");

    view.at(membersPageUrl);
    view.open(
      http.get(membersUrl.replace(/\?.*$/, ""), () =>
        HttpResponse.json(fewer.map((login) => ({ login, avatar_url: "" }))),
      ),
    );

    await vi.waitFor(async () => {
      expect((await memberSummaryRows()).map(([login]) => login)).toEqual([
        ...fewer,
        "Total",
      ]);
    });
  });
});
