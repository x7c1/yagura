import { mockMemberLogins, mockOrganization } from "@yagura/api-mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import {
  memberSummaryRows,
  membersPageUrl,
  server,
  testController,
  testWidths,
} from "../../test-support";

const membersUrl = (org: string) =>
  `https://api.github.com/orgs/${org}/members`;

async function memberLogins(): Promise<string[]> {
  const rows = await memberSummaryRows();
  // The last row is the totals.
  return rows.slice(0, -1).map(([login]) => login ?? "");
}

describe("OrganizationMembers", () => {
  it("shows the organization and its members after sign-in", async () => {
    const { controller, mock } = testController({
      signedIn: true,
      url: membersPageUrl,
    });

    render(<App session={controller} widths={testWidths()} />);

    expect(
      await screen.findByRole("heading", { name: mockOrganization }),
    ).toBeInTheDocument();
    expect(await memberLogins()).toEqual(mockMemberLogins);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      mock.requestsTo(
        "GET",
        "https://api.github.com/user/installations?per_page=100",
      ),
    ).toHaveLength(1);
  });

  it("hides the members after sign-out", async () => {
    const { controller } = testController({
      signedIn: true,
      url: membersPageUrl,
    });

    render(<App session={controller} widths={testWidths()} />);
    await screen.findByRole("table", { name: "Members" });
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(
      screen.queryByRole("heading", { name: mockOrganization }),
    ).not.toBeInTheDocument();
  });

  it("says so when the app is installed on none of the user's organizations", async () => {
    const { controller } = testController({
      signedIn: true,
      organizations: [],
    });

    render(<App session={controller} widths={testWidths()} />);

    expect(
      await screen.findByText(
        "The yagura GitHub App is not installed on any of your organizations.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when the members request fails, and retries", async () => {
    const { controller } = testController({
      signedIn: true,
      url: membersPageUrl,
    });
    server.use(
      http.get(
        membersUrl(mockOrganization),
        () => HttpResponse.json({ message: "Server Error" }, { status: 500 }),
        { once: true },
      ),
    );

    render(<App session={controller} widths={testWidths()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      `Could not load the members of ${mockOrganization}`,
    );
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await memberLogins()).toEqual(mockMemberLogins);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when no members are visible", async () => {
    const { controller } = testController({ signedIn: true });
    server.use(
      http.get(membersUrl(mockOrganization), () => HttpResponse.json([]), {
        once: true,
      }),
    );

    render(<App session={controller} widths={testWidths()} />);

    expect(
      await screen.findByText(
        `No members of ${mockOrganization} are visible to you.`,
      ),
    ).toBeInTheDocument();
  });

  it("switches between several organizations", async () => {
    const { controller, mock } = testController({
      signedIn: true,
      organizations: ["other-org", mockOrganization],
      url: membersPageUrl,
    });

    render(<App session={controller} widths={testWidths()} />);

    expect(
      await screen.findByRole("heading", { name: mockOrganization }),
    ).toBeInTheDocument();
    await memberLogins();
    fireEvent.change(screen.getByRole("combobox", { name: "Organization" }), {
      target: { value: "other-org" },
    });

    expect(
      await screen.findByRole("heading", { name: "other-org" }),
    ).toBeInTheDocument();
    expect(await memberLogins()).toEqual(mockMemberLogins);
    expect(
      mock.requestsTo("GET", `${membersUrl("other-org")}?per_page=100`),
    ).toHaveLength(1);
  });
});
