import {
  mockLogin,
  mockOrganization,
  mockPullRequestTitles,
  type ApiMock,
} from "@yagura/api-mocks";
import { MemoryJsonStore, MemoryStore } from "@yagura/browser";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { viewerCachePrefix } from "./shared";
import {
  memberSummaryRows,
  pullRequestTitles,
  server,
  sessionApi,
  showPage,
  shownMemberSummaryRows,
  shownPullRequestTitles,
  testController,
} from "./test-support";

const minute = 60 * 1000;
const refreshUrl = `${sessionApi}/session/refresh`;
const installationsUrl = "https://api.github.com/user/installations";
const lastViewerKey = "yagura.last-viewer";

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const firstLoad = new Date(2026, 9, 12, 15, 30);

/**
 * A page that can be loaded again, as a reload would: each load renders the
 * app with a new controller over the same API mock, browser cache, last
 * viewer store and clock.
 */
function page(options: { readonly organizations?: readonly string[] } = {}) {
  const cache = new MemoryJsonStore();
  const lastViewer = new MemoryStore();
  let now = firstLoad;
  let mock: ApiMock | undefined;
  let release: (() => void) | undefined;
  return {
    cache,
    lastViewer,
    get mock(): ApiMock {
      if (!mock) {
        throw new Error("Not loaded yet");
      }
      return mock;
    },
    advanceTo(ms: number): void {
      now = new Date(firstLoad.getTime() + ms);
    },
    /**
     * Renders the app, without waiting for anything. With `holdRefresh`,
     * the session API's answer to the refresh is held until
     * {@link releaseRefresh}.
     */
    open(
      load: { readonly holdRefresh?: boolean } = {},
      ...handlers: Parameters<typeof server.use>
    ): void {
      cleanup();
      release?.();
      mock?.clearRequests();
      const test = testController({
        signedIn: mock === undefined ? true : undefined,
        organizations: options.organizations,
        cache,
        lastViewer,
        clock: () => now,
        mock,
      });
      mock = test.mock;
      release = load.holdRefresh
        ? mock.holdRequests(({ url }) => url === refreshUrl)
        : undefined;
      server.use(...handlers);
      render(<App session={test.controller} />);
    },
    releaseRefresh(): void {
      release?.();
      release = undefined;
    },
    async load(): Promise<string[]> {
      this.open();
      return pullRequestTitles();
    },
  };
}

/** A snapshot of every entry of the cache, to compare before and after. */
async function entries(cache: MemoryJsonStore): Promise<unknown[]> {
  return Promise.all(
    cache.keys.map(async (key) => [key, await cache.get(key)]),
  );
}

describe("Drawing the last viewer's cache before the session is confirmed", () => {
  it("draws the cached activity while the refresh is held, and keeps it after", async () => {
    const view = page();
    await view.load();
    showPage("Members");
    const cachedRows = await memberSummaryRows();
    expect(view.lastViewer.get(lastViewerKey)).toBe(mockLogin);

    view.advanceTo(10 * minute);
    const set = vi.spyOn(view.cache, "set");
    view.open({ holdRefresh: true });

    await screen.findByRole("table", { name: "Pull requests" });
    expect(set).not.toHaveBeenCalled();
    expect(shownPullRequestTitles()).toEqual(mockPullRequestTitles);
    showPage("Members");
    expect(shownMemberSummaryRows()).toEqual(cachedRows);
    showPage("Activity");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(view.mock.requestsTo("POST", refreshUrl)).toHaveLength(1);
    // Nothing is sent to GitHub before the token arrives.
    expect(
      view.mock.requests.filter(({ url }) =>
        url.startsWith("https://api.github.com/"),
      ),
    ).toEqual([]);

    view.releaseRefresh();

    await vi.waitFor(() => {
      expect(view.mock.searches.length).toBeGreaterThan(0);
    });
    expect(shownPullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    showPage("Members");
    expect(await memberSummaryRows()).toEqual(cachedRows);
    // The fetch that follows the confirmation stores what it fetched.
    expect(set).toHaveBeenCalled();
  });

  it("removes the drawn data and forgets the viewer when the session has ended", async () => {
    const view = page();
    await view.load();
    view.mock.signedIn = false;
    const before = await entries(view.cache);

    view.open({ holdRefresh: true });
    await screen.findByRole("table", { name: "Pull requests" });
    view.releaseRefresh();

    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(
      screen.queryByRole("table", { name: "Pull requests" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(mockLogin)).not.toBeInTheDocument();
    expect(view.lastViewer.get(lastViewerKey)).toBeUndefined();
    // The viewer's entries stay, untouched.
    expect(await entries(view.cache)).toEqual(before);

    // The next load draws nothing before the refresh answers.
    view.open({ holdRefresh: true });
    await vi.waitFor(() => {
      expect(view.mock.requestsTo("POST", refreshUrl)).toHaveLength(1);
    });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: mockOrganization }),
    ).not.toBeInTheDocument();
    view.releaseRefresh();
    await screen.findByRole("button", { name: "Sign in with GitHub" });
  });

  it("draws the cache of the login the session is confirmed as", async () => {
    const view = page();
    await view.load();
    // Another account was the last to sign in on this browser.
    const other = viewerCachePrefix("someone-else");
    await view.cache.set(`${other}installations`, {
      storedAt: firstLoad.getTime(),
      items: [{ login: "else-org" }],
    });
    await view.cache.set(`${other}members/else-org`, {
      storedAt: firstLoad.getTime(),
      items: [{ login: "else-member", avatarUrl: "" }],
    });
    view.lastViewer.set(lastViewerKey, "someone-else");

    view.open({ holdRefresh: true });
    await screen.findByRole("heading", { name: "else-org" });
    expect(screen.getByText("someone-else")).toBeInTheDocument();
    view.releaseRefresh();

    await screen.findByRole("heading", { name: mockOrganization });
    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(
      screen.queryByRole("heading", { name: "else-org" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("someone-else")).not.toBeInTheDocument();
    expect(
      view.mock.requests.filter(({ url }) => url.includes("else-org")),
    ).toEqual([]);
    expect(view.lastViewer.get(lastViewerKey)).toBe(mockLogin);
  });

  it("writes nothing to the cache before the confirmation, and nothing after a failed refresh", async () => {
    const view = page();
    await view.load();
    view.advanceTo(10 * minute);
    const before = await entries(view.cache);
    const set = vi.spyOn(view.cache, "set");
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });

    view.open(
      {},
      http.post(refreshUrl, async () => {
        await answered;
        return HttpResponse.json({ error: "upstream_error" }, { status: 502 });
      }),
    );
    await screen.findByRole("table", { name: "Pull requests" });
    expect(set).not.toHaveBeenCalled();
    answer();

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(set).not.toHaveBeenCalled();
    expect(await entries(view.cache)).toEqual(before);
    // Not an ended session: the viewer stays remembered.
    expect(view.lastViewer.get(lastViewerKey)).toBe(mockLogin);
  });

  it("clears the viewer's cache and forgets them on sign-out before the confirmation", async () => {
    const view = page();
    await view.load();
    // Past the short life, so that the view's fetches wait for the token.
    view.advanceTo(10 * minute);

    view.open({ holdRefresh: true });
    await screen.findByRole("table", { name: "Pull requests" });
    const releaseDelete = view.mock.holdRequests(
      ({ method, url }) =>
        method === "DELETE" && url === `${sessionApi}/session`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await vi.waitFor(() => {
      expect(view.cache.keys).toEqual([]);
    });
    expect(view.lastViewer.get(lastViewerKey)).toBeUndefined();
    // DELETE /session waits for the refresh in flight, whose cookie would
    // otherwise land after the one DELETE clears.
    expect(view.mock.requestsTo("DELETE", `${sessionApi}/session`)).toEqual([]);

    view.releaseRefresh();
    await vi.waitFor(() => {
      expect(
        view.mock.requestsTo("DELETE", `${sessionApi}/session`),
      ).toHaveLength(1);
    });
    // While DELETE /session is answered, the view's waiting fetches show
    // no failure: the viewer is signing out, not facing an error.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    releaseDelete();
    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("selects the organization selected on the previous load, or the first when it is gone", async () => {
    const view = page({ organizations: [mockOrganization, "second-org"] });
    await view.load();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "second-org" },
    });
    await screen.findByRole("heading", { name: "second-org" });
    await pullRequestTitles();

    view.open({ holdRefresh: true });
    await screen.findByRole("heading", { name: "second-org" });
    view.releaseRefresh();
    await pullRequestTitles();
    expect(screen.getByRole("heading", { name: "second-org" })).toBeVisible();

    // Past the list's short life, the fetched list lacks it.
    view.advanceTo(10 * minute);
    view.open(
      {},
      http.get(installationsUrl, () =>
        HttpResponse.json({
          total_count: 1,
          installations: [
            {
              id: 1,
              account: { login: mockOrganization, type: "Organization" },
            },
          ],
        }),
      ),
    );
    await screen.findByRole("heading", { name: mockOrganization });
    expect(
      screen.queryByRole("heading", { name: "second-org" }),
    ).not.toBeInTheDocument();
  });

  it("draws nothing before the session is restored when no viewer is remembered", async () => {
    const view = page();
    await view.load();
    view.lastViewer.remove(lastViewerKey);

    view.open({ holdRefresh: true });
    await vi.waitFor(() => {
      expect(view.mock.requestsTo("POST", refreshUrl)).toHaveLength(1);
    });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: mockOrganization }),
    ).not.toBeInTheDocument();

    view.releaseRefresh();

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
  });
});
