import {
  mockMemberLogins,
  mockOrganization,
  mockPullRequestTitles,
} from "@yagura/api-mocks";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  pullRequestRows,
  pullRequestTitles,
  server,
  testController,
} from "../../test-support";

const graphqlUrl = "https://api.github.com/graphql";

describe("MembersActivity", () => {
  it("lists the members' pull requests of the period, newest first", async () => {
    const { controller, mock } = testController({ signedIn: true });

    render(<App session={controller} />);

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    // Opened and merged in the period: found by both searches, listed once.
    expect(
      screen.getAllByRole("link", { name: "Fix the sign-out redirect" }),
    ).toHaveLength(1);
    expect(mock.searches).toHaveLength(2 * mockMemberLogins.length);
    expect(
      screen.getByText(/^[A-Z][a-z]{2} \d{1,2} – [A-Z][a-z]{2} \d{1,2}$/),
    ).toBeInTheDocument();
  });

  it("shows a pull request's details and links to it", async () => {
    const { controller } = testController({ signedIn: true });

    render(<App session={controller} />);

    const [, row] = await pullRequestRows();
    const cells = within(row as HTMLElement).getAllByRole("cell");
    expect(cells.map((cell) => cell.textContent)).toEqual([
      "Fix the sign-out redirect",
      "mock-org/web",
      "mock-alice",
      "merged",
      "+18 −4",
      expect.stringMatching(/^[A-Z][a-z]{2} \d{1,2}$/),
    ]);
    const link = within(row as HTMLElement).getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/mock-org/web/pull/2",
    );
    expect(link).toHaveAttribute("target", "_blank");
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

    render(<App session={controller} />);

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

    render(<App session={controller} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Could not load the pull requests of ${mockOrganization}'s members`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
