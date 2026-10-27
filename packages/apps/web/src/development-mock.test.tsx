import {
  mockDevelopmentOrganizations,
  mockImportingOrganization,
  mockOrganizationId,
} from "@yagura/api-mocks";
import { startBrowserApiMock } from "@yagura/api-mocks/browser";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  membersPageUrl,
  memberSummaryRows,
  pullRequestRows,
  sessionApi,
  testController,
  testTheme,
  testWidths,
  testPreferences,
  showPage,
} from "./test-support";

// There is no service worker here: the mock's handlers are served by the
// tests' MSW server instead, through `testController`.
vi.mock("msw/browser", () => ({
  setupWorker: () => ({ start: () => Promise.resolve() }),
}));

describe("The development server's API mock", () => {
  it("offers several organizations, so that the header's selector shows", async () => {
    expect(mockDevelopmentOrganizations.length).toBeGreaterThanOrEqual(2);
    const mock = await startBrowserApiMock({
      sessionApiBaseUrl: sessionApi,
      signedIn: true,
    });
    const { controller } = testController({ mock, url: membersPageUrl });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    const selector = await screen.findByRole("combobox", {
      name: "Organization",
    });
    expect(screen.getByRole("banner")).toContainElement(selector);
    // The app lists the organizations in the order of their logins.
    expect(
      within(selector)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual([...mockDevelopmentOrganizations].sort());
  });

  it("serves drafts, pushes, merges and a bot's pull requests, so that every part of the view shows", async () => {
    const mock = await startBrowserApiMock({
      sessionApiBaseUrl: sessionApi,
      signedIn: true,
    });
    const { controller } = testController({ mock });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    const rows = await pullRequestRows();
    expect(rows.some((row) => within(row).queryByText("draft"))).toBe(true);
    expect(
      rows.some((row) =>
        /^Pushed /.test(row.lastElementChild?.textContent ?? ""),
      ),
    ).toBe(true);
    expect(
      within(
        screen.getByRole("group", { name: "Pushes per day" }),
      ).getAllByRole("button").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /^Show \d+ bot pull requests$/ }),
    ).toBeInTheDocument();
    showPage("Members");
    const summary = await memberSummaryRows();
    expect(summary.some((row) => row[3] === "—")).toBe(true);
  });

  it("serves an organization still being imported, so that the notice of an import shows", async () => {
    const mock = await startBrowserApiMock({
      sessionApiBaseUrl: sessionApi,
      signedIn: true,
    });
    const { controller } = testController({ mock });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );
    const selector = await screen.findByRole("combobox", {
      name: "Organization",
    });
    await pullRequestRows();
    expect(screen.queryByText(/^Importing/)).not.toBeInTheDocument();
    fireEvent.change(selector, {
      target: { value: mockOrganizationId(mockImportingOrganization) },
    });

    expect(
      await screen.findByText(
        `Importing the last 14 days of ${mockImportingOrganization}. This can take a few minutes.`,
      ),
    ).toBeInTheDocument();
    expect((await pullRequestRows()).length).toBeGreaterThan(0);
  });
});
