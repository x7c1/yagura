import { mockBotLogin, mockOrganization } from "@yagura/api-mocks";
import { MemoryStore } from "@yagura/browser";
import {
  dayKeyOf,
  type ListedPullRequest,
  type PullRequest,
} from "@yagura/activity";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import {
  mockListedPullRequests,
  pullRequestRows,
  pullRequestTitles,
  server,
  sessionApi,
  showPage,
  testController,
  testTheme,
  testWidths,
  testPreferences,
  titlesOf,
} from "../../test-support";
import { showBotsKey } from "./DailyActivity";
import { PullRequestList } from "./PullRequestList";

const activityUrl = `${sessionApi}/activity`;

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const now = new Date(2026, 9, 12, 15, 30);

/**
 * Renders the app signed in at {@link now}, with `preferences`. `handlers`
 * take precedence over the API mock's.
 */
function open(
  preferences = testPreferences(),
  ...handlers: Parameters<typeof server.use>
) {
  const test = testController({ signedIn: true, clock: () => now });
  server.use(...handlers);
  render(
    <App
      session={test.controller}
      widths={testWidths()}
      theme={testTheme()}
      preferences={preferences}
    />,
  );
  return test;
}

/** The cells of the list's row titled `title`, as their text. */
async function rowCells(title: string): Promise<string[]> {
  const rows = await pullRequestRows();
  const row = rows.find((candidate) =>
    within(candidate).queryByRole("link", { name: title }),
  );
  if (row === undefined) {
    throw new Error(`No row titled ${title}`);
  }
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent ?? "");
}

/** A row of the list, for rendering the list on its own. */
function listed(
  id: string,
  at: Date,
  overrides: Partial<ListedPullRequest> = {},
): ListedPullRequest {
  const pullRequest: PullRequest = {
    id,
    repository: { id: "r1", ownerLogin: mockOrganization, name: "web" },
    number: Number(id),
    title: `Pull request ${id}`,
    state: "open",
    draft: false,
    additions: 1,
    deletions: 1,
    authorId: "1001",
    createdAt: at,
  };
  return {
    pullRequest,
    author: { id: "1001", login: "mock-alice", type: "User" },
    state: "open",
    latest: { kind: "opened", at },
    pushes: 0,
    byBot: false,
    ...overrides,
  };
}

describe("MembersActivity", () => {
  it("lists the pull requests opened, merged or pushed to in the period, newest first, without bots'", async () => {
    const { mock } = open();

    const titles = await pullRequestTitles();

    expect(titles).toEqual(titlesOf(mockListedPullRequests(mock, now)));
    // Pushed to by its author in the period, then closed: listed.
    expect(titles).toContain("Try another GraphQL client");
    // Opened before the period, pushed to and merged in it: listed.
    expect(titles).toContain("Paginate the members endpoint");
    // Opened and merged before the period: not listed.
    expect(titles).not.toContain("Split the session module");
    // Bots' pull requests are hidden by default.
    expect(titles.filter((title) => title.startsWith("Bump"))).toEqual([]);
    // The chart's axis shows the days, so the activity page names no period.
    expect(screen.queryByText(/^Last 14 days/)).not.toBeInTheDocument();
  });

  it("shows a pull request's details and links to it", async () => {
    open();

    expect(await rowCells("Fix the sign-out redirect")).toEqual([
      "Fix the sign-out redirect",
      "mock-org/web#2",
      "mock-alice",
      "merged",
      "1 push",
      "+18 −4",
      expect.stringMatching(/^Merged \d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
    ]);
    const link = screen.getByRole("link", {
      name: "Fix the sign-out redirect",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/mock-org/web/pull/2",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("marks an open draft as a draft, dated by its latest push, with the members' pushes to it", async () => {
    open();

    const [, , , state, pushes, , date] = await rowCells(
      "Draw the activity chart",
    );

    expect(state).toBe("draft");
    // Four pushes in the period, the last an hour before now.
    expect(pushes).toBe("4 pushes");
    expect(date).toBe("Pushed 2026-10-12 14:30");
  });

  it("dates a pull request merged without pushes by its merge, with no pushes", async () => {
    open();

    const cells = await rowCells("Name the chart for screen readers");
    expect(cells.at(-1)).toBe("Merged 2026-10-03 10:25");
    expect(cells[4]).toBe("0 pushes");
  });

  it("hides bots' pull requests behind a button that counts them, and remembers the choice", async () => {
    const preferences = new MemoryStore();
    const { mock } = open(preferences);
    await pullRequestTitles();
    const bots = mockListedPullRequests(mock, now).filter(({ byBot }) => byBot);
    expect(bots).toHaveLength(3);

    fireEvent.click(
      screen.getByRole("button", { name: "Show 3 bot pull requests" }),
    );

    expect(await pullRequestTitles()).toEqual(
      titlesOf(mockListedPullRequests(mock, now), { bots: true }),
    );
    expect(preferences.get(showBotsKey)).toBe("true");
    const [, , author] = await rowCells("Bump vite from 8.3.4 to 8.3.5");
    // The bot alone, marked as one.
    expect(author).toBe(`${mockBotLogin}bot`);
    // The label says what the button does next, with no pressed state
    // beside it to contradict it.
    expect(
      screen.getByRole("button", { name: "Hide 3 bot pull requests" }),
    ).not.toHaveAttribute("aria-pressed");

    // Another load in this browser shows them too.
    cleanup();
    open(preferences);
    expect(await pullRequestTitles()).toContain(
      "Bump vite from 8.3.4 to 8.3.5",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Hide 3 bot pull requests" }),
    );
    expect(preferences.get(showBotsKey)).toBeUndefined();
  });

  it("fits both tables to their cards, in no container that scrolls sideways", async () => {
    open();
    /** Whether `element` scrolls sideways, by `overflow` or `overflow-x`. */
    const scrollsSideways = (element: Element) => {
      const style = getComputedStyle(element);
      const [overflowX] = style.overflow.split(" ");
      return [overflowX, style.overflowX].some(
        (value) => value === "auto" || value === "scroll",
      );
    };
    const sidewaysScrolling = (table: HTMLElement) => {
      const found: Element[] = [];
      for (
        let element: Element | null = table;
        element !== null;
        element = element.parentElement
      ) {
        if (scrollsSideways(element)) {
          found.push(element);
        }
      }
      return found;
    };

    await pullRequestTitles();
    const list = screen.getByRole("table", { name: "Pull requests" });
    expect(sidewaysScrolling(list)).toEqual([]);
    // The list still scrolls up and down inside its card, where the page
    // fits the window.
    expect(getComputedStyle(list.parentElement as Element).overflowY).toBe(
      "auto",
    );

    showPage("Members");
    const members = await screen.findByRole("table", { name: "Members" });
    expect(sidewaysScrolling(members)).toEqual([]);
  });

  it("writes each pull request's number under its repository, and the title alone in its cell", async () => {
    open();

    for (const row of await pullRequestRows()) {
      const link = within(row).getByRole("link");
      const number = /\/pull\/(\d+)$/.exec(link.getAttribute("href") ?? "");
      expect(number).not.toBeNull();
      const [title, repository] = row.querySelectorAll("td");
      expect(title?.textContent).toBe(link.textContent);
      expect(repository?.textContent).toMatch(/^[^#]+\/[^#]+#\d+$/);
      expect(repository?.lastElementChild?.textContent).toBe(`#${number?.[1]}`);
    }
  });

  it("names the list's table roles, which its narrow layout's display would drop", async () => {
    open();
    await pullRequestTitles();

    const table = screen.getByRole("table", { name: "Pull requests" });
    expect(table.getAttribute("role")).toBe("table");
    const roles = (selector: string) =>
      [...table.querySelectorAll(selector)].map((element) =>
        element.getAttribute("role"),
      );
    expect(roles("thead, tbody")).toEqual(["rowgroup", "rowgroup"]);
    const rows = roles("tr");
    expect(rows.length).toBeGreaterThan(1);
    expect(new Set(rows)).toEqual(new Set(["row"]));
    expect(new Set(roles("th"))).toEqual(new Set(["columnheader"]));
    const cells = roles("td");
    expect(cells).toHaveLength((rows.length - 1) * 7);
    expect(new Set(cells)).toEqual(new Set(["cell"]));
  });

  it("heads the chart's card \"Merged PRs\" and leaves the list's card without a heading", async () => {
    open();
    await pullRequestTitles();

    // The page's one card heading, over the chart: the list below it is the
    // detail of the period the chart covers, and needs no heading of its own.
    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings).toHaveLength(1);
    const [heading] = headings as [HTMLElement];
    expect(heading).toHaveTextContent(/^Merged PRs$/);
    const chartCard = heading.closest("section") as HTMLElement;
    expect(
      within(chartCard).getByRole("group", {
        name: "Merged pull requests per day",
      }),
    ).toBeInTheDocument();
    const listCard = screen
      .getByRole("table", { name: "Pull requests" })
      .closest("section") as HTMLElement;
    expect(listCard).not.toBe(chartCard);
    expect(within(listCard).queryByRole("heading")).not.toBeInTheDocument();
  });

  it("names the period at the top of the members' card, which has no heading", async () => {
    open();
    await pullRequestTitles();
    showPage("Members");

    const card = screen
      .getByRole("table", { name: "Members" })
      .closest("section") as HTMLElement;
    expect(
      within(card).getByText("Last 14 days · Sep 29 – Oct 12"),
    ).toBeInTheDocument();
    expect(within(card).queryByRole("heading")).not.toBeInTheDocument();
  });

  it('heads the last column "Date" and marks each date with its instant', async () => {
    open();

    const rows = await pullRequestRows();
    const table = screen.getByRole("table", { name: "Pull requests" });
    const headings = within(table).getAllByRole("columnheader");
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Title",
      "Repository",
      "Author",
      "State",
      "Pushes",
      "Lines",
      "Date",
    ]);
    for (const row of rows) {
      const time = row.querySelector("td:last-child > time");
      const dateTime = time?.getAttribute("dateTime") ?? "";
      expect(new Date(dateTime).toISOString()).toBe(dateTime);
    }
  });

  it("bands the rows by day, alternating where the day changes", async () => {
    open();

    const rows = await pullRequestRows();
    const days = rows.map((row) =>
      dayKeyOf(
        new Date(row.querySelector("time")?.getAttribute("dateTime") ?? ""),
      ),
    );
    const bands = rows.map((row) => row.dataset["band"]);
    expect(bands[0]).toBe("0");
    // Both cases below occur: the day changes, and some day has several rows.
    expect(new Set(days).size).toBeGreaterThan(1);
    expect(new Set(days).size).toBeLessThan(days.length);
    for (let index = 1; index < rows.length; index += 1) {
      if (days[index] === days[index - 1]) {
        expect(bands[index]).toBe(bands[index - 1]);
      } else {
        expect(bands[index]).not.toBe(bands[index - 1]);
      }
    }
  });

  it("bands a pull request by the date it shows", () => {
    render(
      <PullRequestList
        pullRequests={[
          listed("1", new Date(2026, 9, 10, 9, 30), {
            latest: { kind: "pushed", at: new Date(2026, 9, 10, 9, 30) },
          }),
          listed("2", new Date(2026, 9, 8, 11, 0)),
        ]}
      />,
    );

    const table = screen.getByRole("table", { name: "Pull requests" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(
      rows.map((row) => row.querySelector("td:last-child")?.textContent),
    ).toEqual(["Pushed 2026-10-10 09:30", "Opened 2026-10-08 11:00"]);
    expect(rows.map((row) => row.dataset["band"])).toEqual(["0", "1"]);
  });

  it("shows each author's avatar, found by the account's id, a bot's too", () => {
    render(
      <PullRequestList
        pullRequests={[
          listed("1", new Date(2026, 9, 10, 9, 30)),
          listed("2", new Date(2026, 9, 8, 11, 0), {
            author: { id: "49699333", login: mockBotLogin, type: "Bot" },
            byBot: true,
          }),
        ]}
      />,
    );

    const table = screen.getByRole("table", { name: "Pull requests" });
    const avatars = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelectorAll("td")[2]?.querySelector("img"));
    expect(avatars.map((avatar) => avatar?.getAttribute("src"))).toEqual([
      "https://avatars.githubusercontent.com/u/1001?v=4",
      "https://avatars.githubusercontent.com/u/49699333?v=4",
    ]);
    // Decorative: the login beside it names the author.
    expect(avatars[0]).toHaveAttribute("alt", "");
  });

  it("names an author the response does not name as unknown", () => {
    render(
      <PullRequestList
        pullRequests={[
          listed("1", new Date(2026, 9, 8, 11, 0), { author: undefined }),
        ]}
      />,
    );

    const table = screen.getByRole("table", { name: "Pull requests" });
    const [row] = within(table).getAllByRole("row").slice(1);
    expect(row?.querySelectorAll("td")[2]?.textContent).toBe("unknown");
    expect(row?.querySelectorAll("td")[2]?.querySelector("img")).toBeNull();
  });

  it("says so when the members have no pull requests in the period", async () => {
    open(
      testPreferences(),
      http.get(activityUrl, () =>
        HttpResponse.json({
          members: [{ id: "1001", login: "mock-alice", type: "User" }],
          pullRequests: [],
          activities: [],
        }),
      ),
    );

    expect(
      await screen.findByText(
        `No pull requests by ${mockOrganization}'s members in the last 14 days.`,
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when the activity request fails, and retries", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { mock } = open(
      testPreferences(),
      http.get(
        activityUrl,
        () =>
          HttpResponse.json(
            { error: "upstream_error", error_description: "GitHub failed." },
            { status: 502 },
          ),
        { once: true },
      ),
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      `Could not load the activity of ${mockOrganization}'s members because GitHub or Yagura is not working right now. Retry in a moment, or reload the page if it keeps failing.`,
    );
    expect(alert).not.toHaveTextContent(/responded|GET \/|\b502\b|upstream/);
    warn.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await pullRequestTitles()).toEqual(
      titlesOf(mockListedPullRequests(mock, now)),
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
