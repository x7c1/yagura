import {
  countByDay,
  countByHour,
  countedEvents,
  hoursPerDay,
  listPullRequests,
  narrowList,
  periodEndingAt,
  requestRange,
  startOfDay,
  type DayCounts,
  type Narrowing,
} from "@yagura/activity";
import { parseOrganizationActivity } from "@yagura/activity-api";
import { mockActivityFixtures, mockActivityResponse } from "@yagura/api-mocks";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  memberSummaryRows,
  pullRequestRows,
  pullRequestTitles,
  showPage,
  testController,
  testTheme,
  testWidths,
  testPreferences,
  titlesOf,
} from "../../test-support";
import { dayFormat } from "./format";

/** 15:30 local time, so that the fixtures of the last hours fall on today. */
const now = new Date(2026, 9, 12, 15, 30);
const period = periodEndingAt(now);

/** The API mock's answer at {@link now}, as the view reads it. */
const activity = (() => {
  const { from, to } = requestRange(period);
  const parsed = parseOrganizationActivity(
    mockActivityResponse(mockActivityFixtures(now), from, to),
  );
  if (parsed === undefined) {
    throw new Error("The API mock's activity does not parse");
  }
  return parsed;
})();
const events = countedEvents(activity, period);
const listed = listPullRequests(activity, events);

/** The members' pull requests the list shows when it is not narrowed. */
const allTitles = titlesOf(listed);

/** The fixtures' counts per day, as the chart should show them. */
const expectedDays = countByDay(events, period);

/** The whole chart, the push circles, the bars and their labels. */
const figureName = "Merged pull requests and pushes per day";

/** The bars alone. */
const chartName = "Merged pull requests per day";

const dayName = (day: string) => dayFormat.format(startOfDay(day));

const barName = (day: DayCounts) =>
  `${dayName(day.day)}, merged: ${day.merged}`;

const pushName = (day: DayCounts) =>
  `${dayName(day.day)}, ${day.pushed === 1 ? "1 push" : `${day.pushed} pushes`}`;

/** The titles the list shows narrowed to `narrowing`, in list order. */
function titlesNarrowedTo(narrowing: Narrowing): string[] {
  return titlesOf(narrowList(listed, events, narrowing));
}

/** The titles the list shows narrowed to a day's merges, in list order. */
function narrowedTitles(day: string): string[] {
  return titlesNarrowedTo({ kind: "merged", day });
}

/**
 * The days the fixtures have merges of members' pull requests on, oldest
 * first; at least two.
 */
function daysWithMerges(): [DayCounts, DayCounts, ...DayCounts[]] {
  const [first, second, ...rest] = expectedDays.filter(
    (d) => d.merged > 0 && narrowedTitles(d.day).length > 0,
  );
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
const expectedHours = countByHour(events, period);

const heatmapName = "Pushes and merged pull requests per hour of each day";

const pad = (hour: number) => String(hour).padStart(2, "0");

/**
 * A cell's accessible name, for example "Oct 13, 14:00 to 15:00: 5 pushes,
 * 1 merged".
 */
const cellName = (day: string, hour: number, pushed: number, merged: number) =>
  `${dayName(day)}, ${pad(hour)}:00 to ${pad(hour + 1)}:00: ` +
  `${pushed === 1 ? "1 push" : `${pushed} pushes`}, ${merged} merged`;

/** An hour of a day, and how many pushes and merges it had. */
interface HourCell {
  readonly day: string;
  readonly hour: number;
  readonly pushed: number;
  readonly merged: number;
}

/** The fixtures' hours, those with pushes or merges or those without. */
function hourCells(busy: boolean): HourCell[] {
  return expectedHours.flatMap(({ day, merged, pushed }) =>
    merged.flatMap((count, hour) => {
      const pushes = pushed[hour] ?? 0;
      return count + pushes > 0 === busy
        ? [{ day, hour, pushed: pushes, merged: count }]
        : [];
    }),
  );
}

/** An hour with both a push and a merge of members' pull requests. */
function busyHour(): HourCell {
  const cell = hourCells(true).find(
    (candidate) =>
      candidate.pushed > 0 &&
      candidate.merged > 0 &&
      narrowedHourTitles(candidate).length > 0,
  );
  if (cell === undefined) {
    throw new Error("No hour with pushes and merges in the fixtures");
  }
  return cell;
}

function heatmapCell({ day, hour, pushed, merged }: HourCell): HTMLElement {
  return screen.getByRole("gridcell", {
    name: cellName(day, hour, pushed, merged),
  });
}

/** The titles the list shows narrowed to an hour, in list order. */
function narrowedHourTitles({ day, hour }: HourCell): string[] {
  return titlesNarrowedTo({ kind: "hour", day, hour });
}

/** Renders the app with the chart drawn to `widths`, a desktop's by default. */
async function renderChart(widths = testWidths()) {
  const { controller } = testController({ signedIn: true, clock: () => now });
  render(
    <App
      session={controller}
      widths={widths}
      theme={testTheme()}
      preferences={testPreferences()}
    />,
  );
  await screen.findByRole("group", { name: chartName });
}

/** The chart's drawing: the push circles, the bars and their labels. */
function chartFigure(): HTMLElement {
  return screen.getByRole("group", { name: figureName });
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
    // The figure draws no legend: its caption only describes the heatmap's
    // strengths to assistive technology, and what is counted is said by
    // the card's heading.
    const figure = screen
      .getByRole("group", { name: chartName })
      .closest("figure");
    expect(figure).not.toBeNull();
    const caption = figure?.querySelector("figcaption");
    expect(caption?.textContent).toMatch(
      /^Hours shaded in 4 steps, from 1 up to the busiest hour's \d+$/,
    );
    expect(caption?.querySelector("svg, [aria-hidden]")).toBeNull();
    expect(figure).not.toHaveTextContent(/Per hour/);
  });

  it.each([1000, 340])(
    "writes each bar's count but a zero, which only its name carries, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const chart = chartFigure();
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
    expect(chartFigure()).toHaveAttribute("width", "340");
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

      expect(await pullRequestTitles()).toEqual(allTitles);
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
      const chart = chartFigure();
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

      expect(await pullRequestTitles()).toEqual(allTitles);
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

    expect(await pullRequestTitles()).toEqual(allTitles);
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

describe("The push circles", () => {
  const pushDays = () => expectedDays.filter((day) => day.pushed > 0);

  it.each([1000, 340])(
    'draw a circle per day with the members\' pushes, labelled "Pushes", at %ipx',
    async (width) => {
      await renderChart(testWidths(width));
      const circles = within(
        screen.getByRole("group", { name: "Pushes per day" }),
      ).getAllByRole("button");

      expect(
        circles.map((circle) => circle.getAttribute("aria-label")),
      ).toEqual(pushDays().map(pushName));
      for (const [index, circle] of circles.entries()) {
        expect(circle).toHaveTextContent(String(pushDays()[index]?.pushed));
      }
      expect(within(chartFigure()).getByText("Pushes")).toBeInTheDocument();
      // A day without pushes has no circle, though a bot pushed on Oct 7.
      expect(expectedDays.find(({ day }) => day === "2026-10-07")?.pushed).toBe(
        0,
      );
      expect(
        screen.queryByRole("button", { name: /^Oct 7, \d+ push/ }),
      ).not.toBeInTheDocument();
    },
  );

  it.each([1000, 340])(
    "sit above the bars, or next to the dates, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const day = pushDays().find((d) => d.merged > 0);
      if (day === undefined) {
        throw new Error("No day with pushes and merges in the fixtures");
      }
      const circle = screen
        .getByRole("button", { name: pushName(day) })
        .querySelector("circle");
      const bar = screen.getByRole("button", { name: barName(day) });
      const cx = Number(circle?.getAttribute("cx"));
      const cy = Number(circle?.getAttribute("cy"));
      const r = Number(circle?.getAttribute("r"));
      const x = Number(bar.getAttribute("x"));
      const y = Number(bar.getAttribute("y"));
      const barWidth = Number(bar.getAttribute("width"));
      const barHeight = Number(bar.getAttribute("height"));

      if (width === 1000) {
        expect(cx).toBeCloseTo(x + barWidth / 2);
        expect(cy + r).toBeLessThan(y);
      } else {
        expect(cx + r).toBeLessThan(x);
        expect(cy).toBeCloseTo(y + barHeight / 2);
      }
    },
  );

  it.each([1000, 340])(
    "narrow the list to the pull requests a member pushed to that day, and back, at %ipx",
    async (width) => {
      await renderChart(testWidths(width));
      const [day] = pushDays() as [DayCounts];
      const circle = screen.getByRole("button", { name: pushName(day) });

      fireEvent.click(circle);

      const pushed = titlesNarrowedTo({ kind: "pushed", day: day.day });
      expect(pushed.length).toBeGreaterThan(0);
      expect(await pullRequestTitles()).toEqual(pushed);
      expect(circle).toHaveAttribute("aria-pressed", "true");
      expect(
        screen.getByText(`Pushed on ${dayName(day.day)}`, { exact: false }),
      ).toBeInTheDocument();

      fireEvent.keyDown(circle, { key: "Enter" });

      expect(await pullRequestTitles()).toEqual(allTitles);
      expect(circle).toHaveAttribute("aria-pressed", "false");
    },
  );

  it("replace a chosen bar, and a bar replaces them", async () => {
    await renderChart();
    const day = pushDays().find((d) => d.merged > 0) as DayCounts;
    const circle = screen.getByRole("button", { name: pushName(day) });
    const bar = screen.getByRole("button", { name: barName(day) });

    fireEvent.click(bar);
    fireEvent.click(circle);

    expect(circle).toHaveAttribute("aria-pressed", "true");
    expect(bar).toHaveAttribute("aria-pressed", "false");
    expect(await pullRequestTitles()).toEqual(
      titlesNarrowedTo({ kind: "pushed", day: day.day }),
    );

    fireEvent.click(bar);

    expect(circle).toHaveAttribute("aria-pressed", "false");
    expect(await pullRequestTitles()).toEqual(narrowedTitles(day.day));
  });
});

describe("A narrowed list's Pushes and Date", () => {
  /** The Pushes and Date cells of the row titled `title`, as shown. */
  async function pushesAndDate(title: string): Promise<[string, string]> {
    const row = (await pullRequestRows()).find(
      (candidate) =>
        within(candidate).queryByRole("link", { name: title, hidden: true }) !==
        null,
    );
    if (row === undefined) {
      throw new Error(`No row titled "${title}"`);
    }
    const cells = [...row.children].map(
      (cell) => cell.textContent?.trim() ?? "",
    );
    return [cells[4] ?? "", cells[6] ?? ""];
  }

  const yesterday = expectedDays.find(
    (d) => d.day === "2026-10-11",
  ) as DayCounts;

  it("are those of the chosen day, and of the period again once cleared", async () => {
    await renderChart();
    // Four pushes in the period, the last one an hour ago.
    expect(await pushesAndDate("Draw the activity chart")).toEqual([
      "4 pushes",
      "Pushed 2026-10-12 14:30",
    ]);
    // Pushed to two days ago, merged yesterday.
    expect(await pushesAndDate("Document the API mock")).toEqual([
      "1 push",
      "Merged 2026-10-11 11:30",
    ]);

    fireEvent.click(screen.getByRole("button", { name: pushName(yesterday) }));

    expect(await pushesAndDate("Draw the activity chart")).toEqual([
      "1 push",
      "Pushed 2026-10-11 10:05",
    ]);

    fireEvent.click(screen.getByRole("button", { name: barName(yesterday) }));

    expect(await pushesAndDate("Document the API mock")).toEqual([
      "0 pushes",
      "Merged 2026-10-11 11:30",
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Show all" }));

    expect(await pushesAndDate("Draw the activity chart")).toEqual([
      "4 pushes",
      "Pushed 2026-10-12 14:30",
    ]);
  });

  it("are those of the chosen hour", async () => {
    await renderChart();
    const hours = expectedHours.find(({ day }) => day === "2026-10-11");
    const pushed = hours?.pushed[10] ?? 0;
    const merged = hours?.merged[10] ?? 0;

    fireEvent.click(
      heatmapCell({ day: "2026-10-11", hour: 10, pushed, merged }),
    );

    expect(await pushesAndDate("Draw the activity chart")).toEqual([
      "1 push",
      "Pushed 2026-10-11 10:05",
    ]);
  });
});

describe("Bots' pull requests in a narrowed list", () => {
  it("are counted in the narrowing's button, and shown on request", async () => {
    await renderChart();
    // On Oct 7, only Dependabot's pull request was merged.
    const day = expectedDays.find((d) => d.day === "2026-10-07") as DayCounts;
    expect(day.merged).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: barName(day) }));

    expect(
      await screen.findByText("Only bots' pull requests here."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Pull requests" }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show 1 bot pull request" }),
    );

    expect(await pullRequestTitles()).toEqual([
      "Bump vite from 8.3.4 to 8.3.5",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(
      screen.getByRole("button", { name: "Hide 3 bot pull requests" }),
    ).toBeInTheDocument();
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
        name: cellName(day.day, 0, 0, 0),
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
      expect(cell).toHaveAttribute("aria-selected", "true");
      expect(
        screen.getByText(
          `Merged or pushed on ${dayFormat.format(startOfDay(hour.day))}, ` +
            `${pad(hour.hour)}:00–${pad(hour.hour + 1)}:00`,
          { exact: false },
        ),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Show all" }));

      expect(await pullRequestTitles()).toEqual(allTitles);
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

    expect(await pullRequestTitles()).toEqual(allTitles);
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
      cellName(earliest.day, earliest.hour, earliest.pushed, earliest.merged),
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
        return cellName(
          counts.day,
          hour,
          counts.pushed[hour] ?? 0,
          counts.merged[hour] ?? 0,
        );
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

      expect(await pullRequestTitles()).toEqual(allTitles);
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

    expect(await pullRequestTitles()).toEqual(allTitles);
    expect(
      screen.queryByRole("button", { name: "Show all" }),
    ).not.toBeInTheDocument();
  });
});
