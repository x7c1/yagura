import {
  countByDay,
  periodEndingAt,
  pullRequestsOn,
  startOfDay,
  type DayCounts,
  type Measure,
} from "@yagura/activity";
import { mockPullRequestTitles } from "@yagura/api-mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  memberSummaryRows,
  mockDomainPullRequests,
  pullRequestTitles,
  showPage,
  testController,
} from "../../test-support";
import { dayFormat } from "./format";

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const now = new Date(2026, 9, 12, 15, 30);
const period = periodEndingAt(now);
const pullRequests = mockDomainPullRequests(now);

/** The fixtures' counts per day, as the chart should show them. */
const expectedDays = countByDay(pullRequests, period);

const barName = (day: DayCounts, measure: Measure) =>
  `${dayFormat.format(startOfDay(day.day))}: ${day[measure]} ${measure}`;

/** The titles the list shows narrowed to a day and kind, in list order. */
function narrowedTitles(day: string, measure: Measure): string[] {
  const selected = new Set(
    pullRequestsOn(pullRequests, period, day, measure).map(
      ({ title }) => title,
    ),
  );
  return mockPullRequestTitles.filter((title) => selected.has(title));
}

/** A day the fixtures have something of `measure` on. */
function dayWith(measure: Measure): DayCounts {
  const day = expectedDays.find((d) => d[measure] > 0);
  if (day === undefined) {
    throw new Error(`No day with ${measure} pull requests in the fixtures`);
  }
  return day;
}

async function renderChart() {
  const { controller } = testController({ signedIn: true, clock: () => now });
  render(<App session={controller} />);
  await screen.findByRole("group", {
    name: "Opened and merged pull requests per day",
  });
}

describe("DailyChart", () => {
  it("shows a group per day of the period with the fixtures' counts", async () => {
    await renderChart();

    const bars = screen.getAllByRole("button", {
      name: /^[A-Z][a-z]{2} \d{1,2}: \d+ (opened|merged)$/,
    });
    expect(expectedDays).toHaveLength(14);
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual(
      expectedDays.flatMap((day) => [
        barName(day, "opened"),
        barName(day, "merged"),
      ]),
    );
  });

  it("narrows the list to the chosen bar's pull requests, and back", async () => {
    await renderChart();
    const day = dayWith("merged");
    const bar = screen.getByRole("button", { name: barName(day, "merged") });

    fireEvent.click(bar);

    expect(await pullRequestTitles()).toEqual(
      narrowedTitles(day.day, "merged"),
    );
    expect(bar).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByText(`Merged on ${dayFormat.format(startOfDay(day.day))}`, {
        exact: false,
      }),
    ).toBeInTheDocument();

    fireEvent.click(bar);

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(bar).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByRole("button", { name: "Show all" }),
    ).not.toBeInTheDocument();
  });

  it("is chosen with the keyboard and cleared with Show all", async () => {
    await renderChart();
    const day = dayWith("opened");
    const bar = screen.getByRole("button", { name: barName(day, "opened") });
    expect(bar).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(bar, { key: "Enter" });

    expect(await pullRequestTitles()).toEqual(
      narrowedTitles(day.day, "opened"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(bar).toHaveAttribute("aria-pressed", "false");

    fireEvent.keyDown(bar, { key: " " });

    expect(bar).toHaveAttribute("aria-pressed", "true");
  });

  it("does not narrow to a bar with nothing", async () => {
    await renderChart();
    const day = expectedDays.find((d) => d.merged === 0);
    if (day === undefined) {
      throw new Error("No day without merged pull requests in the fixtures");
    }
    const bar = screen.getByRole("button", { name: barName(day, "merged") });
    expect(bar).toHaveAttribute("aria-disabled", "true");
    expect(bar).not.toHaveAttribute("tabindex");

    fireEvent.click(bar);
    fireEvent.keyDown(bar, { key: "Enter" });

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(
      screen.queryByRole("button", { name: "Show all" }),
    ).not.toBeInTheDocument();
  });

  it("leaves the summary table covering the whole period", async () => {
    await renderChart();
    showPage("Members");
    const before = await memberSummaryRows();
    showPage("Activity");

    fireEvent.click(
      await screen.findByRole("button", {
        name: barName(dayWith("merged"), "merged"),
      }),
    );
    showPage("Members");

    expect(await memberSummaryRows()).toEqual(before);
  });
});
