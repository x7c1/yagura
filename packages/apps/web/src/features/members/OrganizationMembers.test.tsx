import {
  mockBotLogin,
  mockLogin,
  mockMemberLogins,
  mockOrganization,
  mockActivityResponse,
  mockOrganizationId,
} from "@yagura/api-mocks";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "../../App";
import {
  findOrganization,
  membersPageUrl,
  memberSummaryRows,
  pullRequestTitles,
  server,
  sessionApi,
  showPage,
  showsOrganization,
  signOut,
  testController,
  testTheme,
  testWidths,
  testPreferences,
} from "../../test-support";

const activityUrl = `${sessionApi}/activity`;

/** The notice the view shows while the mock organization is imported. */
const importingNotice = `Importing the last 14 days of ${mockOrganization}. This can take a few minutes.`;

/** The logins of the summary table's rows, a bot's with its mark. */
async function memberLogins(): Promise<string[]> {
  const rows = await memberSummaryRows();
  // The last row is the totals.
  return rows.slice(0, -1).map(([login]) => login ?? "");
}

/** The rows of the summary table for the mock: its members, then its bot. */
const mockRowLogins = [...mockMemberLogins, `${mockBotLogin}bot`];

describe("OrganizationMembers", () => {
  it("shows the organization and its members after sign-in", async () => {
    const { controller, mock } = testController({
      signedIn: true,
      url: membersPageUrl,
    });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    await findOrganization(mockOrganization);
    expect(await memberLogins()).toEqual(mockRowLogins);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(
      mock.requestsTo("GET", `${sessionApi}/activity/organizations`),
    ).toHaveLength(1);
    expect(
      mock.activityRequests.map(({ url }) =>
        new URL(url).searchParams.get("organization"),
      ),
    ).toEqual([mockOrganizationId(mockOrganization)]);
  });

  it("links the organization, the login and the footer's credit to GitHub, in a new tab", async () => {
    const { controller } = testController({ signedIn: true });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );
    await findOrganization(mockOrganization);

    const banner = screen.getByRole("banner");
    const footer = screen.getByRole("contentinfo");
    const links = [
      [
        within(banner).getByRole("link", { name: mockOrganization }),
        `https://github.com/${mockOrganization}`,
      ],
      [
        within(banner).getByRole("link", { name: mockLogin }),
        `https://github.com/${mockLogin}`,
      ],
      [
        within(footer).getByRole("link", { name: "Yagura" }),
        "https://github.com/x7c1/yagura",
      ],
    ] as const;
    for (const [link, href] of links) {
      expect(link).toHaveAttribute("href", href);
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noreferrer");
    }
  });

  it("hides the members after sign-out", async () => {
    const { controller } = testController({
      signedIn: true,
      url: membersPageUrl,
    });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );
    await screen.findByRole("table", { name: "Members" });
    signOut();

    await screen.findByRole("button", { name: "Sign in with GitHub" });
    expect(showsOrganization(mockOrganization)).toBe(false);
  });

  it("says so when the app is installed on none of the user's organizations", async () => {
    const { controller } = testController({
      signedIn: true,
      organizations: [],
    });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    expect(
      await screen.findByText(
        "The Yagura GitHub App is not installed on any of your organizations.",
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when the activity request fails, and retries", async () => {
    const { controller } = testController({
      signedIn: true,
      url: membersPageUrl,
    });
    server.use(
      http.get(
        activityUrl,
        () =>
          HttpResponse.json(
            { error: "internal_error", error_description: "Oops." },
            { status: 500 },
          ),
        { once: true },
      ),
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      `Could not load the activity of ${mockOrganization}'s members because GitHub or Yagura is not working right now. Retry in a moment, or reload the page if it keeps failing.`,
    );
    expect(alert).not.toHaveTextContent(/responded|GET \/|\b500\b|internal/);
    expect(warn).toHaveBeenCalledWith(
      "Could not fetch:",
      expect.objectContaining({ status: 500 }),
    );
    warn.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await memberLogins()).toEqual(mockRowLogins);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says when the activity cannot be loaded for the network being down", async () => {
    const { controller } = testController({
      signedIn: true,
      url: membersPageUrl,
    });
    server.use(
      http.get(activityUrl, () => HttpResponse.error(), {
        once: true,
      }),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      `Could not load the activity of ${mockOrganization}'s members because you appear to be offline. Check your connection, then retry.`,
    );
    expect(alert).not.toHaveTextContent("Failed to fetch");
    warn.mockRestore();
  });

  it("says so when no members are visible", async () => {
    const { controller } = testController({ signedIn: true });
    server.use(
      http.get(
        activityUrl,
        () =>
          HttpResponse.json({ members: [], pullRequests: [], activities: [] }),
        { once: true },
      ),
    );

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    expect(
      await screen.findByText(
        `No members of ${mockOrganization} are visible to you.`,
      ),
    ).toBeInTheDocument();
  });

  it("says that the organization is being imported, in place of saying that no members are visible", async () => {
    const { controller } = testController({ signedIn: true });
    server.use(
      http.get(
        activityUrl,
        () =>
          HttpResponse.json({
            importedAt: null,
            members: [],
            pullRequests: [],
            activities: [],
          }),
        { once: true },
      ),
    );

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    expect(await screen.findByText(importingNotice)).toBeInTheDocument();
    expect(screen.queryByText(/^No members of/)).not.toBeInTheDocument();
  });

  it("draws what has arrived below the notice of an import, on both pages", async () => {
    const { controller, mock } = testController({ signedIn: true });
    mock.importing = [mockOrganization];

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    expect((await pullRequestTitles()).length).toBeGreaterThan(0);
    const notice = screen.getByText(importingNotice);
    expect(
      notice.compareDocumentPosition(
        screen.getByRole("table", { name: "Pull requests" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    showPage("Members");
    expect((await memberLogins()).length).toBeGreaterThan(0);
    expect(screen.getByText(importingNotice)).toBeInTheDocument();
  });

  it("says that no members are visible once the organization is imported", async () => {
    const { controller } = testController({ signedIn: true });
    server.use(
      http.get(
        activityUrl,
        () =>
          HttpResponse.json({
            importedAt: "2026-10-27T03:00:00.000Z",
            members: [],
            pullRequests: [],
            activities: [],
          }),
        { once: true },
      ),
    );

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    expect(
      await screen.findByText(
        `No members of ${mockOrganization} are visible to you.`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(importingNotice)).not.toBeInTheDocument();
  });

  it("shows no notice of an import for an imported organization", async () => {
    const { controller } = testController({ signedIn: true });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    expect((await pullRequestTitles()).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Importing/)).not.toBeInTheDocument();
  });

  it("draws an answer without importedAt, as an older server's, as imported", async () => {
    const { controller, mock } = testController({ signedIn: true });
    // The mock's activity, as a server older than `importedAt` answers it.
    server.use(
      http.get(activityUrl, ({ request }) => {
        const params = new URL(request.url).searchParams;
        return HttpResponse.json(
          mockActivityResponse(
            mock.fixtures,
            new Date(params.get("from") ?? ""),
            new Date(params.get("to") ?? ""),
          ),
        );
      }),
    );

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    expect((await pullRequestTitles()).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Importing/)).not.toBeInTheDocument();
  });

  it("switches between several organizations", async () => {
    const { controller, mock } = testController({
      signedIn: true,
      organizations: ["other-org", mockOrganization],
      url: membersPageUrl,
    });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={testTheme()}
        preferences={testPreferences()}
      />,
    );

    await findOrganization(mockOrganization);
    await memberLogins();
    fireEvent.change(screen.getByRole("combobox", { name: "Organization" }), {
      target: { value: mockOrganizationId("other-org") },
    });

    await findOrganization("other-org");
    expect(await memberLogins()).toEqual(mockRowLogins);
    expect(
      mock.activityRequests.map(({ url }) =>
        new URL(url).searchParams.get("organization"),
      ),
    ).toEqual([
      mockOrganizationId(mockOrganization),
      mockOrganizationId("other-org"),
    ]);
  });
});
