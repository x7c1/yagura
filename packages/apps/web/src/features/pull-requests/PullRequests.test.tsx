import {
  mockMemberLogins,
  mockOrganization,
  mockPullRequestTitles,
} from "@yagura/api-mocks";
import { dayKeyOf, periodEndingAt, type PullRequest } from "@yagura/activity";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  pullRequestRows,
  pullRequestTitles,
  server,
  testController,
  testWidths,
} from "../../test-support";
import { PullRequestList } from "./PullRequestList";

const graphqlUrl = "https://api.github.com/graphql";

describe("MembersActivity", () => {
  it("lists the members' pull requests of the period, newest first", async () => {
    const { controller, mock } = testController({ signedIn: true });

    render(<App session={controller} widths={testWidths()} />);

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    // Opened and merged in the period: found by both searches, listed once.
    expect(
      screen.getAllByRole("link", { name: "Fix the sign-out redirect" }),
    ).toHaveLength(1);
    expect(mock.searches).toHaveLength(2 * mockMemberLogins.length);
    expect(
      screen.getByText(
        /^Last 14 days · [A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}$/,
      ),
    ).toBeInTheDocument();
  });

  it("shows a pull request's details and links to it", async () => {
    const { controller } = testController({ signedIn: true });

    render(<App session={controller} widths={testWidths()} />);

    const [, row] = await pullRequestRows();
    const cells = within(row as HTMLElement).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "Fix the sign-out redirect",
      "mock-org/web",
      "mock-alice",
      "merged",
      "+18 −4",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/),
    ]);
    const link = within(row as HTMLElement).getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/mock-org/web/pull/2",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it('heads the last column "Date" and marks each date with its instant', async () => {
    const { controller } = testController({ signedIn: true });

    render(<App session={controller} widths={testWidths()} />);

    const rows = await pullRequestRows();
    const table = screen.getByRole("table", { name: "Pull requests" });
    const headings = within(table).getAllByRole("columnheader");
    expect(headings.at(-1)).toHaveTextContent(/^Date$/);
    for (const row of rows) {
      const time = row.querySelector("td:last-child > time");
      const dateTime = time?.getAttribute("dateTime") ?? "";
      expect(new Date(dateTime).toISOString()).toBe(dateTime);
    }
  });

  it("bands the rows by day, alternating where the day changes", async () => {
    const { controller } = testController({ signedIn: true });

    render(<App session={controller} widths={testWidths()} />);

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

  it("bands a pull request by the date it shows, its merge if later", () => {
    // As in a list narrowed to the pull requests opened on Oct 8: one of
    // them was merged on Oct 10, so it shows that day and starts its band.
    const opened = (id: string, mergedAt: Date | null): PullRequest => ({
      id,
      state: mergedAt === null ? "open" : "merged",
      createdAt: new Date(2026, 9, 8, 11, 0),
      mergedAt,
      title: id,
      url: `https://github.com/${mockOrganization}/web/pull/${id}`,
      repository: `${mockOrganization}/web`,
      author: "mock-alice",
      additions: 1,
      deletions: 1,
    });

    render(
      <PullRequestList
        pullRequests={[
          opened("merged later", new Date(2026, 9, 10, 9, 30)),
          opened("still open", null),
        ]}
        period={periodEndingAt(new Date(2026, 9, 12, 15, 30))}
        members={[]}
      />,
    );

    const table = screen.getByRole("table", { name: "Pull requests" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((row) => row.querySelector("time")?.textContent)).toEqual([
      "2026-10-10 09:30",
      "2026-10-08 11:00",
    ]);
    expect(rows.map((row) => row.dataset["band"])).toEqual(["0", "1"]);
  });

  it("shows a member author's avatar, and any other author's login alone", () => {
    const by = (id: string, author: string): PullRequest => ({
      id,
      state: "open",
      createdAt: new Date(2026, 9, 8, 11, 0),
      mergedAt: null,
      title: id,
      url: `https://github.com/${mockOrganization}/web/pull/${id}`,
      repository: `${mockOrganization}/web`,
      author,
      additions: 1,
      deletions: 1,
    });

    render(
      <PullRequestList
        pullRequests={[by("1", "mock-alice"), by("2", "outsider")]}
        period={periodEndingAt(new Date(2026, 9, 12, 15, 30))}
        members={[{ login: "mock-alice", avatarUrl: "https://avatars/alice" }]}
      />,
    );

    const table = screen.getByRole("table", { name: "Pull requests" });
    const authors = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => row.querySelectorAll("td")[2] as HTMLElement);
    expect(authors.map((cell) => cell.textContent)).toEqual([
      "mock-alice",
      "outsider",
    ]);
    expect(authors[0]?.querySelector("img")).toHaveAttribute(
      "src",
      "https://avatars/alice",
    );
    expect(authors[1]?.querySelector("img")).toBeNull();
  });

  it("says so when the members have no pull requests in the period", async () => {
    const { controller } = testController({ signedIn: true });
    server.use(
      http.post(graphqlUrl, () =>
        HttpResponse.json({
          data: {
            search: {
              pageInfo: { hasNextPage: false, endCursor: null },
              nodes: [],
            },
          },
        }),
      ),
    );

    render(<App session={controller} widths={testWidths()} />);

    expect(
      await screen.findByText(
        `No pull requests by ${mockOrganization}'s members in the last 14 days.`,
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when a search fails, and retries", async () => {
    const { controller } = testController({ signedIn: true });
    server.use(
      http.post(
        graphqlUrl,
        () => HttpResponse.json({ message: "Server Error" }, { status: 502 }),
        { once: true },
      ),
    );

    render(<App session={controller} widths={testWidths()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Could not load the pull requests of ${mockOrganization}'s members`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
