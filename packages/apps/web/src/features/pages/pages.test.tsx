import { mockLogin } from "@yagura/api-mocks";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../../App";
import { saveHandoff } from "../session/handoff";
import {
  memberSummaryRows,
  membersPageUrl,
  pullRequestTitles,
  showPage,
  testController,
  testTheme,
  testWidths,
} from "../../test-support";
import { pageAt } from "./pages";

const chart = () =>
  screen.queryByRole("group", {
    name: "Opened and merged pull requests per day",
  });
const summaryTable = () => screen.queryByRole("table", { name: "Members" });
const tab = (name: "Activity" | "Members") =>
  screen.getByRole("link", { name });

describe("pageAt", () => {
  it("knows the pages' paths and nothing else", () => {
    expect(pageAt("/")).toBe("activity");
    expect(pageAt("/members")).toBe("members");
    expect(pageAt("/members/")).toBeUndefined();
    expect(pageAt("/callback")).toBeUndefined();
  });
});

describe("Pages", () => {
  it("opens the activity at the root: the chart and the list, without the summary table", async () => {
    const { controller } = testController({ signedIn: true });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    await pullRequestTitles();
    expect(chart()).toBeInTheDocument();
    expect(summaryTable()).not.toBeInTheDocument();
    expect(tab("Activity")).toHaveAttribute("aria-current", "page");
    expect(tab("Members")).not.toHaveAttribute("aria-current");
  });

  it("opens the members at /members: the summary table, without the chart", async () => {
    const { controller } = testController({
      signedIn: true,
      url: membersPageUrl,
    });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    await memberSummaryRows();
    expect(
      screen.getByRole("heading", { name: "Per member" }),
    ).toBeInTheDocument();
    expect(chart()).not.toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Pull requests" }),
    ).not.toBeInTheDocument();
    expect(tab("Members")).toHaveAttribute("aria-current", "page");
    expect(tab("Activity")).not.toHaveAttribute("aria-current");
  });

  it("links the tabs to the pages' addresses", async () => {
    const { controller } = testController({ signedIn: true });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    expect(
      await screen.findByRole("navigation", { name: "Pages" }),
    ).toBeInTheDocument();
    expect(tab("Activity")).toHaveAttribute("href", "/");
    expect(tab("Members")).toHaveAttribute("href", "/members");
  });

  it("switches pages with the tabs and the history, without fetching again", async () => {
    const { controller, mock, location } = testController({ signedIn: true });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );
    await pullRequestTitles();
    const requests = mock.requests.length;

    showPage("Members");

    expect(location.href).toBe(membersPageUrl);
    expect(location.entries).toHaveLength(2);
    expect(summaryTable()).toBeInTheDocument();
    expect(chart()).not.toBeInTheDocument();
    expect(tab("Members")).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("Members · Yagura");
    // Drawn at once from what the activity page loaded.
    expect(screen.queryByText("…")).not.toBeInTheDocument();

    act(() => location.back());

    expect(location.pathname).toBe("/");
    expect(chart()).toBeInTheDocument();
    expect(summaryTable()).not.toBeInTheDocument();
    expect(tab("Activity")).toHaveAttribute("aria-current", "page");
    expect(document.title).toBe("Activity · Yagura");

    act(() => location.forward());

    expect(summaryTable()).toBeInTheDocument();

    showPage("Activity");

    expect(location.pathname).toBe("/");
    expect(location.entries).toHaveLength(3);
    expect(chart()).toBeInTheDocument();

    // The current page's tab adds no history entry.
    showPage("Activity");

    expect(location.entries).toHaveLength(3);
    expect(mock.requests).toHaveLength(requests);
  });

  it("leaves a click that asks for a new tab to the browser", async () => {
    const { controller, location } = testController({ signedIn: true });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );
    await pullRequestTitles();

    // Note whether the app took the click, then keep jsdom, which cannot
    // open a tab, from following the link.
    let handled: boolean | undefined;
    const afterApp = (event: Event) => {
      handled = event.defaultPrevented;
      event.preventDefault();
    };
    window.addEventListener("click", afterApp);
    try {
      fireEvent.click(tab("Members"), { ctrlKey: true });
    } finally {
      window.removeEventListener("click", afterApp);
    }

    expect(handled).toBe(false);
    expect(location.pathname).toBe("/");
    expect(chart()).toBeInTheDocument();
  });

  it("shows the activity at an unknown path and replaces the address with the root", async () => {
    const { controller, location } = testController({
      signedIn: true,
      url: "http://localhost:5173/nowhere?x=1",
    });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    await pullRequestTitles();
    expect(chart()).toBeInTheDocument();
    expect(location.href).toBe("http://localhost:5173/");
    expect(location.entries).toEqual(["http://localhost:5173/"]);
    expect(tab("Activity")).toHaveAttribute("aria-current", "page");
  });

  it.each(["http://localhost:5173/", membersPageUrl])(
    "shows no tabs while signed out, at %s",
    async (url) => {
      const { controller, location } = testController({ url });

      render(
        <App session={controller} widths={testWidths()} theme={testTheme()} />,
      );

      await screen.findByRole("button", { name: "Sign in with GitHub" });
      expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
      for (const name of ["Activity", "Members"]) {
        expect(screen.queryByRole("link", { name })).not.toBeInTheDocument();
      }
      expect(summaryTable()).not.toBeInTheDocument();
      expect(document.title).not.toContain("·");
      expect(location.href).toBe(url);
    },
  );

  it("lands on the activity after the callback completes sign-in", async () => {
    const { controller, storage, location } = testController({
      url: "http://localhost:5173/callback?code=abc&state=s1",
    });
    saveHandoff(storage, { state: "s1", codeVerifier: "verifier" });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(location.href).toBe("http://localhost:5173/");
    await pullRequestTitles();
    expect(chart()).toBeInTheDocument();
    expect(tab("Activity")).toHaveAttribute("aria-current", "page");
  });
});
