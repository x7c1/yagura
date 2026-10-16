import {
  countByDay,
  countByHour,
  hoursPerDay,
  periodEndingAt,
  pullRequestsInHour,
  pullRequestsOn,
  startOfDay,
  type DayCounts,
} from "@yagura/activity";
import { mockPullRequestTitles } from "@yagura/api-mocks";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
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

const chartName = "Merged pull requests per day";

const barName = (day: DayCounts) =>
  `${dayFormat.format(startOfDay(day.day))}, merged: ${day.merged}`;

/** The titles the list shows narrowed to a day's merges, in list order. */
function narrowedTitles(day: string): string[] {
  const selected = new Set(
    pullRequestsOn(pullRequests, period, day, "merged").map(
      ({ title }) => title,
    ),
  );
  return mockPullRequestTitles.filter((title) => selected.has(title));
}

/** The days the fixtures have merges on, oldest first; at least two. */
function daysWithMerges(): [DayCounts, DayCounts, ...DayCounts[]] {
  const [first, second, ...rest] = expectedDays.filter((d) => d.merged > 0);
  if (first === undefined || second === undefined) {
    throw new Error("Fewer than two days with merges in the fixtures");
  }
  return [first, second, ...rest];
}

/**
 * The chart's layout, from two days' bars: side by side, or one above the
 * other, both starting at the axis.
 */
function chartLayout(): "columns" | "rows" {
  const [first, second] = daysWithMerges().map((day) =>
    screen.getByRole("button", { name: barName(day) }),
  );
  return first?.getAttribute("x") === second?.getAttribute("x")
    ? "rows"
    : "columns";
}

/** The fixtures' counts per hour of each day, as the heatmap should show them. */
const expectedHours = countByHour(pullRequests, period);

const heatmapName = "Merged pull requests per hour of each day";

const pad = (hour: number) => String(hour).padStart(2, "0");

/** A cell's accessible name, for example "Oct 13, 14:00 to 15:00: 2 merged". */
const cellName = (day: string, hour: number, count: number) =>
  `${dayFormat.format(startOfDay(day))}, ${pad(hour)}:00 to ` +
  `${pad(hour + 1)}:00: ${count} merged`;

/** An hour of a day, and how many pull requests were merged within it. */
interface HourCell {
  readonly day: string;
  readonly hour: number;
  readonly count: number;
}

/** The fixtures' hours, those with merges or those without. */
function hourCells(busy: boolean): HourCell[] {
  return expectedHours.flatMap(({ day, merged }) =>
    merged.flatMap((count, hour) =>
      count > 0 === busy ? [{ day, hour, count }] : [],
    ),
  );
}

/** An hour with merges in the fixtures. */
function busyHour(): HourCell {
  const [cell] = hourCells(true);
  if (cell === undefined) {
    throw new Error("No hour with merged pull requests in the fixtures");
  }
  return cell;
}

function heatmapCell({ day, hour, count }: HourCell): HTMLElement {
  return screen.getByRole("gridcell", { name: cellName(day, hour, count) });
}

/** The titles the list shows narrowed to an hour, in list order. */
function narrowedHourTitles({ day, hour }: HourCell): string[] {
  const selected = new Set(
    pullRequestsInHour(pullRequests, period, day, hour, "merged").map(
      ({ title }) => title,
    ),
  );
  return mockPullRequestTitles.filter((title) => selected.has(title));
}

/** Renders the app with the chart drawn to `widths`, a desktop's by default. */
async function renderChart(widths = testWidths()) {
  const { controller } = testController({ signedIn: true, clock: () => now });
  render(<App session={controller} widths={widths} theme={testTheme()} />);
  await screen.findByRole("group", { name: chartName });
}

describe("DailyChart", () => {
  it("shows a bar per day of the period with the fixtures' merged counts, and nothing opened", async () => {
    await renderChart();

    const bars = screen.getAllByRole("button", {
      name: /^[A-Z][a-z]{2} \d{1,2}, merged: \d+$/,
    });
    expect(expectedDays).toHaveLength(14);
    expect(bars.map((bar) => bar.getAttribute("aria-label"))).toEqual(
      expectedDays.map(barName),
    );
    expect(
      screen.queryByRole("button", { name: /opened/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("gridcell", { name: /opened/ }),
    ).not.toBeInTheDocument();
    // Under the chart is only the key to the heatmap's strengths: what is
    // counted is said by the card's heading, not by a legend.
    const caption = screen
      .getByRole("group", { name: chartName })
      .closest("figure")
      ?.querySelector("figcaption");
    expect(caption).toHaveTextContent(/^Per hour: 1/);
    expect(caption).not.toHaveTextContent(/Merged|Opened/);
  });

  it.each([1000, 340])(
    "writes each bar's count but a zero, which only its name carries, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const chart = screen.getByRole("group", { name: chartName });
      const counts = expectedDays.map((day) => day.merged);
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
        screen.getByRole("button", { name: barName(zero) }),
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
    const chart = screen.getByRole("group", { name: chartName });
    expect(chart).toHaveAttribute("width", "340");
  });

  it("stops measuring its width once it is gone", async () => {
    const widths = testWidths();
    await renderChart(widths);
    expect(widths.observing).toBe(1);

    showPage("Members");

    expect(
      screen.queryByRole("group", { name: chartName }),
    ).not.toBeInTheDocument();
    expect(widths.observing).toBe(0);
  });

  it.each([1000, 340])(
    "narrows the list to the chosen bar's pull requests, and back, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const [day] = daysWithMerges();
      const bar = screen.getByRole("button", { name: barName(day) });

      fireEvent.click(bar);

      expect(await pullRequestTitles()).toEqual(narrowedTitles(day.day));
      // One day's rows share the first band.
      expect(
        (await pullRequestRows()).map((row) => row.dataset["band"]),
      ).toEqual(narrowedTitles(day.day).map(() => "0"));
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
      const chart = screen.getByRole("group", { name: chartName });
      const [day] = daysWithMerges();
      const bar = screen.getByRole("button", { name: barName(day) });
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

      expect(await pullRequestTitles()).toEqual(narrowedTitles(day.day));
      expect(bar).toHaveAttribute("aria-pressed", "true");
    },
  );

  it.each([1000, 340])(
    "is chosen with the keyboard and cleared with Show all at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const [day] = daysWithMerges();
      const bar = screen.getByRole("button", { name: barName(day) });
      expect(bar).toHaveAttribute("tabindex", "0");

      fireEvent.keyDown(bar, { key: "Enter" });

      expect(await pullRequestTitles()).toEqual(narrowedTitles(day.day));
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
    const [first, second] = daysWithMerges();
    const all = scrollingArea();

    fireEvent.click(screen.getByRole("button", { name: barName(first) }));
    const narrowed = scrollingArea();
    expect(narrowed).not.toBe(all);

    fireEvent.click(screen.getByRole("button", { name: barName(second) }));
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
    const bar = screen.getByRole("button", { name: barName(day) });
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
        name: barName(daysWithMerges()[0]),
      }),
    );
    showPage("Members");

    expect(await memberSummaryRows()).toEqual(before);
  });
});

describe("The hours' heatmap", () => {
  it("is drawn under the bars in the chart's card, a cell per hour of each day", async () => {
    await renderChart();
    const bars = screen.getByRole("group", { name: chartName });
    const heatmap = screen.getByRole("grid", { name: heatmapName });

    expect(bars.closest("section")).toBe(heatmap.closest("section"));
    expect(
      bars.compareDocumentPosition(heatmap) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const cells = within(heatmap).getAllByRole("gridcell");
    expect(cells).toHaveLength(14 * hoursPerDay);
    // Found by its accessible name: its day, hour, count and kind.
    expect(heatmapCell(busyHour())).toBeInTheDocument();
  });

  it("rules the labelled hours behind the cells, hidden from assistive technology, where the days are columns", async () => {
    await renderChart(testWidths(1000));
    const heatmap = screen.getByRole("grid", { name: heatmapName });
    const lines = heatmap.querySelectorAll("line");

    expect(lines).toHaveLength(4);
    const [first] = lines as unknown as [SVGLineElement];
    for (const line of lines) {
      expect(line.parentElement).toBe(first.parentElement);
    }
    expect(first.parentElement).toHaveAttribute("aria-hidden", "true");
    const [cell] = within(heatmap).getAllByRole("gridcell") as [HTMLElement];
    expect(
      first.compareDocumentPosition(cell) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("rules no hours where the days are rows", async () => {
    await renderChart(testWidths(340));
    const heatmap = screen.getByRole("grid", { name: heatmapName });

    expect(heatmap.querySelectorAll("line")).toHaveLength(0);
  });

  it.each([1000, 340])(
    "puts each day's cells under or beside its bar, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const [day] = daysWithMerges();
      const bar = screen.getByRole("button", { name: barName(day) });
      const cell = screen.getByRole("gridcell", {
        name: cellName(day.day, 0, 0),
      });
      const right =
        Number(cell.getAttribute("x")) + Number(cell.getAttribute("width"));
      const heatmap = screen.getByRole("grid", { name: heatmapName });

      expect(heatmap).toHaveAttribute("width", String(width));
      expect(right).toBeLessThanOrEqual(width);
      if (width === 1000) {
        // Under the columns, the cell's column is its bar's.
        expect(cell.getAttribute("x")).toBe(bar.getAttribute("x"));
        expect(cell.getAttribute("width")).toBe(bar.getAttribute("width"));
      }
    },
  );

  it.each([1000, 340])(
    "narrows the list to the chosen cell's hour, and Show all clears it, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const hour = busyHour();
      const cell = heatmapCell(hour);

      fireEvent.click(cell);

      expect(await pullRequestTitles()).toEqual(narrowedHourTitles(hour));
      expect(narrowedHourTitles(hour)).toHaveLength(hour.count);
      expect(cell).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByText(
          `Merged on ${dayFormat.format(startOfDay(hour.day))}, ` +
            `${pad(hour.hour)}:00–${pad(hour.hour + 1)}:00`,
          { exact: false },
        ),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Show all" }));

      expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
      expect(cell).toHaveAttribute("aria-selected", "false");
    },
  );

  it("replaces a chosen cell with a chosen bar, and a chosen bar with a cell", async () => {
    await renderChart();
    const hour = busyHour();
    const cell = heatmapCell(hour);
    const day =
      daysWithMerges().find((d) => d.day !== hour.day) ?? daysWithMerges()[0];
    const bar = screen.getByRole("button", { name: barName(day) });

    fireEvent.click(cell);
    fireEvent.click(bar);

    expect(await pullRequestTitles()).toEqual(narrowedTitles(day.day));
    expect(bar).toHaveAttribute("aria-pressed", "true");
    expect(cell).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByText(`Merged on ${dayFormat.format(startOfDay(day.day))} ·`, {
        exact: false,
      }),
    ).toBeInTheDocument();

    fireEvent.click(cell);

    expect(await pullRequestTitles()).toEqual(narrowedHourTitles(hour));
    expect(bar).toHaveAttribute("aria-pressed", "false");
    expect(cell).toHaveAttribute("aria-selected", "true");
  });

  it("clears the choice when the chosen cell is chosen again", async () => {
    await renderChart();
    const cell = heatmapCell(busyHour());

    fireEvent.click(cell);
    fireEvent.click(cell);

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(
      screen.queryByRole("button", { name: "Show all" }),
    ).not.toBeInTheDocument();
  });

  it("is one tab stop, the first cell with something", async () => {
    await renderChart();
    const heatmap = screen.getByRole("grid", { name: heatmapName });

    const stops = within(heatmap)
      .getAllByRole("gridcell")
      .filter((cell) => cell.getAttribute("tabindex") === "0");

    expect(stops).toHaveLength(1);
    // The earliest hour with something, the leftmost of its row.
    const earliest = [...hourCells(true)].sort((a, b) => a.hour - b.hour)[0];
    if (earliest === undefined) {
      throw new Error("No hour with merged pull requests in the fixtures");
    }
    expect(stops[0]).toHaveAccessibleName(
      cellName(earliest.day, earliest.hour, earliest.count),
    );
  });

  it.each([
    [1000, "ArrowRight", "ArrowDown"],
    [340, "ArrowDown", "ArrowRight"],
  ])(
    "moves between the cells with the arrow keys and chooses with Enter, at %ipx",
    async (width, nextDay, nextHour) => {
      await renderChart(testWidths(width));
      const heatmap = screen.getByRole("grid", { name: heatmapName });
      const name = (day: number, hour: number) => {
        const counts = expectedHours[day];
        if (counts === undefined) {
          throw new Error(`No day ${day} in the period`);
        }
        return cellName(counts.day, hour, counts.merged[hour] ?? 0);
      };
      const first = screen.getByRole("gridcell", { name: name(0, 0) });
      act(() => {
        first.focus();
      });

      fireEvent.keyDown(first, { key: nextDay });
      expect(document.activeElement).toHaveAccessibleName(name(1, 0));

      fireEvent.keyDown(document.activeElement as Element, { key: nextHour });
      expect(document.activeElement).toHaveAccessibleName(name(1, 1));
      // The cell moved to becomes the one tab stop.
      expect(
        within(heatmap)
          .getAllByRole("gridcell")
          .filter((cell) => cell.getAttribute("tabindex") === "0"),
      ).toEqual([document.activeElement]);

      // Home goes to the start of the line: under the columns, a line is an
      // hour across the days; beside the rows, a day across the hours.
      fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
      expect(document.activeElement).toHaveAccessibleName(
        width === 1000 ? name(0, 1) : name(1, 0),
      );
      // Moving back past the first hour stays at it.
      const previousHour = nextHour === "ArrowDown" ? "ArrowUp" : "ArrowLeft";
      fireEvent.keyDown(document.activeElement as Element, {
        key: previousHour,
      });
      fireEvent.keyDown(document.activeElement as Element, {
        key: previousHour,
      });
      expect(document.activeElement).toHaveAccessibleName(
        width === 1000 ? name(0, 0) : name(1, 0),
      );

      // To a cell with something, and choose it.
      const busy = busyHour();
      const target = heatmapCell(busy);
      act(() => {
        target.focus();
      });
      fireEvent.keyDown(target, { key: "Enter" });

      expect(await pullRequestTitles()).toEqual(narrowedHourTitles(busy));
      expect(target).toHaveAttribute("aria-selected", "true");

      fireEvent.keyDown(target, { key: " " });

      expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    },
  );

  it("does not narrow to a cell with nothing", async () => {
    await renderChart();
    const [empty] = hourCells(false);
    if (empty === undefined) {
      throw new Error("No empty hour in the fixtures");
    }
    const cell = heatmapCell(empty);
    expect(cell).toHaveAttribute("aria-disabled", "true");
    expect(cell).not.toHaveAttribute("aria-selected");

    fireEvent.click(cell);
    act(() => {
      cell.focus();
    });
    fireEvent.keyDown(cell, { key: "Enter" });

    expect(await pullRequestTitles()).toEqual(mockPullRequestTitles);
    expect(
      screen.queryByRole("button", { name: "Show all" }),
    ).not.toBeInTheDocument();
  });
});
