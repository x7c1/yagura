import {
  mockBotLogin,
  mockMemberLogins,
  mockMembers,
  mockOrganization,
} from "@yagura/api-mocks";
import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  memberSummaryRows,
  membersPageUrl,
  pullRequestRows,
  server,
  sessionApi,
  showPage,
  testController,
  testPreferences,
  testTheme,
  testWidths,
} from "../../test-support";

const activityUrl = `${sessionApi}/activity`;

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const now = new Date(2026, 9, 12, 15, 30);

/** Renders the members page signed in at {@link now}. */
function open(...handlers: Parameters<typeof server.use>) {
  const test = testController({
    signedIn: true,
    clock: () => now,
    url: membersPageUrl,
  });
  server.use(...handlers);
  render(
    <App
      session={test.controller}
      widths={testWidths()}
      theme={testTheme()}
      preferences={testPreferences()}
    />,
  );
  return test;
}

describe("MemberSummaryTable", () => {
  it("shows each member's counts, pushes and lines in login order, then the bot, and the totals", async () => {
    open();

    // Worked out by hand from the API mock's fixtures (see `activity.ts` in
    // the api-mocks package): merging someone else's pull request does not
    // count for the merger, and pushes count whosever pull request they
    // were to.
    expect(await memberSummaryRows()).toEqual([
      ["mock-alice", "5", "4", "9", "+503", "−99"],
      ["mock-bob", "4", "4", "5", "+536", "−164"],
      ["mock-carol", "4", "3", "2", "+146", "−52"],
      ["mock-user", "4", "3", "4", "+370", "−43"],
      [`${mockBotLogin}bot`, "3", "2", "—", "+19", "−19"],
      ["Total", "20", "16", "20", "+1574", "−377"],
    ]);
    const table = screen.getByRole("table", { name: "Members" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((heading) => heading.textContent),
    ).toEqual([
      "Member",
      "Opened",
      "Merged",
      "Pushed",
      "Additions",
      "Deletions",
    ]);
  });

  it("shows each member's and bot's avatar, found by the account's id", async () => {
    const { mock } = open();
    await memberSummaryRows();

    const table = screen.getByRole("table", { name: "Members" });
    const accounts = [...mock.fixtures.members, ...mock.fixtures.bots];
    expect(
      within(table)
        .getAllByRole("rowheader")
        .map((cell) => cell.querySelector("img")?.getAttribute("src")),
    ).toEqual([
      ...accounts.map(
        ({ id }) => `https://avatars.githubusercontent.com/u/${id}?v=4`,
      ),
      // The totals row.
      undefined,
    ]);
  });

  it("totals as many merges as the chart's bars count", async () => {
    open();
    const rows = await memberSummaryRows();
    showPage("Activity");
    await pullRequestRows();

    const bars = within(
      screen.getByRole("group", { name: "Merged pull requests per day" }),
    ).getAllByRole("button");
    const merged = bars
      .map((bar) => Number(/merged: (\d+)$/.exec(bar.ariaLabel ?? "")?.[1]))
      .reduce((sum, count) => sum + count, 0);
    expect(rows.at(-1)?.[2]).toBe(String(merged));
  });

  it("shows zeros for a member with no activity, and no row for a bot without a pull request", async () => {
    open(
      http.get(activityUrl, () =>
        HttpResponse.json({
          members: mockMembers,
          pullRequests: [],
          activities: [],
        }),
      ),
    );

    expect(await memberSummaryRows()).toEqual([
      ...mockMemberLogins.map((login) => [login, "0", "0", "0", "+0", "−0"]),
      ["Total", "0", "0", "0", "+0", "−0"],
    ]);
    showPage("Activity");
    expect(
      screen.getByText(
        `No pull requests by ${mockOrganization}'s members in the last 14 days.`,
      ),
    ).toBeInTheDocument();
  });

  it("comes with the list from one request for the activity", async () => {
    const { mock } = open();
    await memberSummaryRows();
    showPage("Activity");
    await pullRequestRows();

    expect(mock.activityRequests).toHaveLength(1);
  });
});
