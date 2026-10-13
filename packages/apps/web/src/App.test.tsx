import { mockAuthorize, mockLogin } from "@yagura/api-mocks";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { saveHandoff } from "./features/session/handoff";
import { sessionApi, testController, testWidths } from "./test-support";

const description =
  "See your organization's development activity on GitHub at a glance.";

describe("App", () => {
  it("shows the sign-in screen when refresh answers 401", async () => {
    const { controller, mock } = testController();

    render(<App session={controller} widths={testWidths()} />);

    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Yagura" }),
    ).toBeVisible();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByText(/stores nothing/)).toBeInTheDocument();
    // The screen is for signing in alone, with no page frame around it.
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      mock.requestsTo("POST", `${sessionApi}/session/refresh`),
    ).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says it is loading, without the sign-in button, while the session is restored", async () => {
    const { controller, mock } = testController();
    const release = mock.holdRequests(
      ({ url }) => url === `${sessionApi}/session/refresh`,
    );

    render(<App session={controller} widths={testWidths()} />);

    expect(screen.getByRole("heading", { name: "Yagura" })).toBeVisible();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading…");
    // The note stays under it, so that the panel keeps its size.
    expect(screen.getByText(/stores nothing/)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign in with GitHub" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();

    release();
    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("restores the session on reload and signs out", async () => {
    const { controller, mock } = testController({ signedIn: true });

    render(<App session={controller} widths={testWidths()} />);
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(controller.accessToken).toBe("ghu_mock_1");

    // Signed in, the page frame stays, with the app's name heading it for
    // assistive tech.
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yagura" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    const [request] = mock.requestsTo("DELETE", `${sessionApi}/session`);
    expect(request?.credentials).toBe("include");
    expect(mock.signedIn).toBe(false);
    expect(controller.accessToken).toBeUndefined();
  });

  it("renders the callback screen from the location and leaves the callback URL", async () => {
    const { controller, mock, location, storage } = testController({
      url: "http://localhost:5173/callback?code=abc&state=s1",
    });
    saveHandoff(storage, { state: "s1", codeVerifier: "verifier" });

    render(<App session={controller} widths={testWidths()} />);

    expect(screen.getByRole("status")).toHaveTextContent("Signing in…");
    expect(screen.getByRole("heading", { name: "Yagura" })).toBeVisible();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(location.href).toBe("http://localhost:5173/");
    expect(mock.requestsTo("POST", `${sessionApi}/session`)).toHaveLength(1);
    expect(
      mock.requestsTo("POST", `${sessionApi}/session/refresh`),
    ).toHaveLength(0);
  });

  it("signs in through the authorize stand-in", async () => {
    const { controller, mock, location } = testController();
    await controller.signIn();
    const [authorizeUrl] = location.assigned;
    if (!authorizeUrl) {
      throw new Error("signIn did not navigate");
    }
    location.assign(mockAuthorize(authorizeUrl));

    render(<App session={controller} widths={testWidths()} />);

    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("");
    expect(mock.signedIn).toBe(true);
  });

  it("keeps a failed callback's error after leaving the callback URL", async () => {
    const { controller, mock, location } = testController({
      url: "http://localhost:5173/callback?code=abc&state=forged",
    });

    render(<App session={controller} widths={testWidths()} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("state");
    expect(location.pathname).toBe("/");
    // The failure is shown on the sign-in screen, above the button.
    const button = screen.getByRole("button", { name: "Sign in with GitHub" });
    const panel = screen.getByRole("main");
    expect(within(panel).getByRole("alert")).toBe(alert);
    expect(
      alert.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(mock.requests).toEqual([]);
  });
});
