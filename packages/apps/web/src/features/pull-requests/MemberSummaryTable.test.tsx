import {
  periodEndingAt,
  wasMerged,
  wasOpened,
  type PullRequest,
} from "@yagura/activity";
import { mockMemberLogins, mockOrganization } from "@yagura/api-mocks";
import { render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  memberSummaryRows,
  membersPageUrl,
  mockDomainPullRequests,
  pullRequestRows,
  server,
  showPage,
  testController,
  testTheme,
  testWidths,
} from "../../test-support";

const graphqlUrl = "https://api.github.com/graphql";

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const now = new Date(2026, 9, 12, 15, 30);

const emptySearch = () =>
  HttpResponse.json({
    data: {
      search: {
        pageInfo: { hasNextPage: false, endCursor: null },
        nodes: [],
      },
    },
  });

/**
 * The summary table's rows the fixtures make, worked out from the fixtures
 * themselves: per member, the pull requests opened and merged in the period,
 * and the lines of each pull request that is either, counted once.
 */
function expectedRows(): string[][] {
  const period = periodEndingAt(now);
  const pullRequests = mockDomainPullRequests(now);
  const counts = (prs: readonly PullRequest[]) => {
    const listed = prs.filter(
      (pr) => wasOpened(pr, period) || wasMerged(pr, period),
    );
    return [
      String(listed.filter((pr) => wasOpened(pr, period)).length),
      String(listed.filter((pr) => wasMerged(pr, period)).length),
      `+${listed.reduce((sum, pr) => sum + pr.additions, 0)}`,
      `−${listed.reduce((sum, pr) => sum + pr.deletions, 0)}`,
    ];
  };
  return [
    ...mockMemberLogins.map((login) => [
      login,
      ...counts(pullRequests.filter((pr) => pr.author === login)),
    ]),
    [
      "Total",
      ...counts(
        pullRequests.filter((pr) => mockMemberLogins.includes(pr.author)),
      ),
    ],
  ];
}

describe("MemberSummaryTable", () => {
  it("shows each member's counts and lines in login order, and the totals", async () => {
    const { controller } = testController({
      signedIn: true,
      clock: () => now,
      url: membersPageUrl,
    });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    expect(await memberSummaryRows()).toEqual(expectedRows());
  });

  it("shows zeros for a member with no pull requests", async () => {
    const { controller } = testController({
      signedIn: true,
      clock: () => now,
      url: membersPageUrl,
    });
    server.use(
      http.post(graphqlUrl, async ({ request }) => {
        const body: unknown = await request.clone().json();
        if (JSON.stringify(body).includes("author:mock-carol")) {
          return emptySearch();
        }
        // Anything else falls through to the API mock.
        return undefined;
      }),
    );

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    const rows = await memberSummaryRows();
    expect(rows.find(([login]) => login === "mock-carol")).toEqual([
      "mock-carol",
      "0",
      "0",
      "+0",
      "−0",
    ]);
  });

  it("comes with the list from one fetch of the pull requests", async () => {
    const { controller, mock } = testController({
      signedIn: true,
      clock: () => now,
      url: membersPageUrl,
    });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );
    await memberSummaryRows();
    showPage("Activity");
    await pullRequestRows();

    // One search per member and measure, not one set each for the table and
    // the list.
    expect(mock.searches).toHaveLength(2 * mockMemberLogins.length);
  });

  it("lists every member with zeros when the list is empty", async () => {
    const { controller } = testController({
      signedIn: true,
      url: membersPageUrl,
    });
    server.use(http.post(graphqlUrl, emptySearch));

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    expect(await memberSummaryRows()).toEqual([
      ...mockMemberLogins.map((login) => [login, "0", "0", "+0", "−0"]),
      ["Total", "0", "0", "+0", "−0"],
    ]);
    showPage("Activity");
    expect(
      screen.getByText(
        `No pull requests by ${mockOrganization}'s members in the last 14 days.`,
      ),
    ).toBeInTheDocument();
  });
});
