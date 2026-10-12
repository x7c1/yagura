import { measures, searchQuery } from "@yagura/activity";
import {
  mockLogin,
  mockMemberLogins,
  mockOrganization,
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
import { pullRequestTitles, server, testController } from "./test-support";

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

async function storedDays(
  cache: JsonStore,
  login: string,
): Promise<string[] | undefined> {
  const activity = decodeMemberActivity(
    await cache.get(viewerCachePrefix(mockLogin) + activityCacheKey(login)),
  );
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

  it("searches only today after 10 minutes, and looks unmerged ones up by id", async () => {
    const view = page();
    await view.load();

    view.advanceTo(10 * minute);

    expect(await view.load()).toEqual(mockPullRequestTitles);
    expect([...view.mock.searches].sort()).toEqual(
      searchesFrom(new Date(2026, 9, 12)),
    );
    // The open and closed pull requests of the past days; today's open one
    // was found again by today's search.
    expect(view.mock.lookups.map((ids) => [...ids].sort())).toEqual([
      ["PR_mock_10", "PR_mock_5", "PR_mock_7"],
    ]);
    expect(view.mock.requestsTo("GET", membersUrl)).toHaveLength(1);
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
