import {
  countByDay,
  periodEndingAt,
  pullRequestsOn,
  startOfDay,
  type DayCounts,
  type Measure,
} from "@yagura/activity";
import { mockPullRequestTitles } from "@yagura/api-mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  memberSummaryRows,
  mockDomainPullRequests,
  pullRequestRows,
  pullRequestTitles,
  showPage,
  testController,
  testTheme,
  testWidths,
} from "../../test-support";
import { dayFormat } from "./format";

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const now = new Date(2026, 9, 12, 15, 30);
const period = periodEndingAt(now);
const pullRequests = mockDomainPullRequests(now);

/** The fixtures' counts per day, as the chart should show them. */
const expectedDays = countByDay(pullRequests, period);

const barName = (day: DayCounts, measure: Measure) =>
  `${dayFormat.format(startOfDay(day.day))}, ${measure}: ${day[measure]}`;

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

/**
 * The chart's layout, from a day's bars: side by side, or one above the
 * other, both starting at the axis.
 */
function chartLayout(): "columns" | "rows" {
  const name = barName(dayWith("opened"), "opened");
  const opened = screen.getByRole("button", { name });
  const merged = opened.nextElementSibling;
  return opened.getAttribute("x") === merged?.getAttribute("x")
    ? "rows"
    : "columns";
}

/** Renders the app with the chart drawn to `widths`, a desktop's by default. */
async function renderChart(widths = testWidths()) {
  const { controller } = testController({ signedIn: true, clock: () => now });
  render(<App session={controller} widths={widths} theme={testTheme()} />);
  await screen.findByRole("group", {
    name: "Opened and merged pull requests per day",
  });
}

describe("DailyChart", () => {
  it("shows a group per day of the period with the fixtures' counts", async () => {
    await renderChart();

    const bars = screen.getAllByRole("button", {
      name: /^[A-Z][a-z]{2} \d{1,2}, (opened|merged): \d+$/,
    });
    expect(expectedDays).toHaveLength(14);
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual(
      expectedDays.flatMap((day) => [
        barName(day, "opened"),
        barName(day, "merged"),
      ]),
    );
  });

  it.each([1000, 340])(
    "writes each bar's count but a zero, which only its name carries, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const chart = screen.getByRole("group", {
        name: "Opened and merged pull requests per day",
      });
      const counts = expectedDays.flatMap((day) => [day.opened, day.merged]);
      expect(counts).toContain(0);

      const written = [...chart.querySelectorAll("text")]
        .map(({ textContent }) => textContent ?? "")
        .slice(-counts.filter((count) => count > 0).length);
      expect(written).toEqual(counts.filter((count) => count > 0).map(String));
      const zero = expectedDays.find((day) => day.merged === 0);
      if (zero === undefined) {
        throw new Error("No day without merged pull requests in the fixtures");
      }
      expect(
        screen.getByRole("button", { name: barName(zero, "merged") }),
      ).toHaveAccessibleName(/, merged: 0$/);
    },
  );

  it("lays the days out in rows when the columns have no room", async () => {
    const widths = testWidths();
    await renderChart(widths);
    expect(chartLayout()).toBe("columns");

    act(() => {
      widths.width = 340;
    });

    expect(chartLayout()).toBe("rows");
    const chart = screen.getByRole("group", {
      name: "Opened and merged pull requests per day",
    });
    expect(chart).toHaveAttribute("width", "340");
  });

  it("stops measuring its width once it is gone", async () => {
    const widths = testWidths();
    await renderChart(widths);
    expect(widths.observing).toBe(1);

    showPage("Members");

    expect(
      screen.queryByRole("group", {
        name: "Opened and merged pull requests per day",
      }),
    ).not.toBeInTheDocument();
    expect(widths.observing).toBe(0);
  });

  it.each([1000, 340])(
    "narrows the list to the chosen bar's pull requests, and back, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const day = dayWith("merged");
      const bar = screen.getByRole("button", { name: barName(day, "merged") });

      fireEvent.click(bar);

      expect(await pullRequestTitles()).toEqual(
        narrowedTitles(day.day, "merged"),
      );
      // One day's rows share the first band.
      expect(
        (await pullRequestRows()).map((row) => row.dataset["band"]),
      ).toEqual(narrowedTitles(day.day, "merged").map(() => "0"));
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
    },
  );

  it.each([1000, 340])(
    "chooses a bar when its count is clicked, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const chart = screen.getByRole("group", {
        name: "Opened and merged pull requests per day",
      });
      const day = dayWith("merged");
      const bar = screen.getByRole("button", { name: barName(day, "merged") });
      // The counts come last, in the order of the bars, but for the zeros.
      const bars = [
        ...chart.querySelectorAll(
          "rect[role=button]:not([aria-disabled=true])",
        ),
      ];
      const counts = [...chart.querySelectorAll("text")].slice(-bars.length);
      const count = counts[bars.indexOf(bar)];
      if (count === undefined) {
        throw new Error("No count written for the bar");
      }
      expect(count).toHaveTextContent(String(day.merged));

      fireEvent.click(count);

      expect(await pullRequestTitles()).toEqual(
        narrowedTitles(day.day, "merged"),
      );
      expect(bar).toHaveAttribute("aria-pressed", "true");
    },
  );

  it.each([1000, 340])(
    "is chosen with the keyboard and cleared with Show all at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
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
    },
  );

  it("draws the list afresh when the narrowing changes, so that it is read from its top", async () => {
    await renderChart();
    // jsdom keeps no scroll position, so what is seen is that the list's
    // scrolling area, around the table, is a new one each time: a new one
    // starts at its top.
    const scrollingArea = () =>
      screen.getByRole("table", { name: "Pull requests" }).parentElement;
    const opened = dayWith("opened");
    const merged = dayWith("merged");
    const all = scrollingArea();

    fireEvent.click(
      screen.getByRole("button", { name: barName(opened, "opened") }),
    );
    const narrowed = scrollingArea();
    expect(narrowed).not.toBe(all);

    fireEvent.click(
      screen.getByRole("button", { name: barName(merged, "merged") }),
    );
    expect(scrollingArea()).not.toBe(narrowed);

    const before = scrollingArea();
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(scrollingArea()).not.toBe(before);
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
