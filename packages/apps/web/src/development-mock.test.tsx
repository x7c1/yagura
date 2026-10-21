import { mockDevelopmentOrganizations } from "@yagura/api-mocks";
import { startBrowserApiMock } from "@yagura/api-mocks/browser";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  membersPageUrl,
  sessionApi,
  testController,
  testTheme,
  testWidths,
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
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
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
});
