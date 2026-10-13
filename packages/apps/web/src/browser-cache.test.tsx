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
} from "@yagura/api-mocks";
import { MemoryJsonStore, type JsonStore } from "@yagura/browser";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse, type HttpHandler } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  activityCacheKey,
  decodeMemberActivity,
} from "./features/pull-requests/activity-record";
import { viewerCachePrefix } from "./shared";
import {
  mockDomainPullRequests,
  pullRequestTitles,
  server,
  testController,
} from "./test-support";

const minute = 60 * 1000;
const day = 24 * 60 * minute;

const graphqlUrl = "https://api.github.com/graphql";
const membersUrl = `https://api.github.com/orgs/${mockOrganization}/members?per_page=100`;

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const firstLoad = new Date(2026, 9, 12, 15, 30);

/**
 * A page that can be loaded again, as a reload would: each load renders the
 * app with a new controller over the same API mock, browser cache and clock.
 */
function page(cache: JsonStore = new MemoryJsonStore()) {
  let now = firstLoad;
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
    /**
     * Renders the app and resolves to the listed titles. `handlers` take
     * precedence over the API mock's.
     */
    async load(...handlers: HttpHandler[]): Promise<string[]> {
      cleanup();
      mock?.clearRequests();
      const test = testController({
        signedIn: true,
        cache,
        clock: () => now,
        mock,
      });
      mock = test.mock;
      server.use(...handlers);
      render(<App session={test.controller} />);
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
    view.mock.addPullRequest({
      __typename: "PullRequest",
      id: "PR_mock_new",
      title: "Open a pull request after the first load",
      url: "https://github.com/mock-org/web/pull/11",
      repository: { nameWithOwner: "mock-org/web" },
      author: { login: "mock-alice" },
      state: "OPEN",
      createdAt: new Date(firstLoad.getTime() + 5 * minute).toISOString(),
      mergedAt: null,
      additions: 3,
      deletions: 1,
    });

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
    ).toHaveLength(1 + mockMemberLogins.length);

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    expect(cache.keys).toEqual([other]);
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
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
