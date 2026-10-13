import { mockAuthorize, mockLogin } from "@yagura/api-mocks";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";
import { saveHandoff } from "./features/session/handoff";
import { sessionApi, testController, testWidths } from "./test-support";

describe("App", () => {
  it("shows the sign-in button when refresh answers 401", async () => {
    const { controller, mock } = testController();

    render(<App session={controller} widths={testWidths()} />);

    expect(screen.getByRole("heading", { name: "yagura" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(
      mock.requestsTo("POST", `${sessionApi}/session/refresh`),
    ).toHaveLength(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restores the session on reload and signs out", async () => {
    const { controller, mock } = testController({ signedIn: true });

    render(<App session={controller} widths={testWidths()} />);
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(controller.accessToken).toBe("ghu_mock_1");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
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

    expect(screen.getByText("Signing in…")).toBeInTheDocument();
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
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

    expect(await screen.findByRole("alert")).toHaveTextContent("state");
    expect(location.pathname).toBe("/");
    expect(
      screen.getByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(mock.requests).toEqual([]);
  });
});
