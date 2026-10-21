import { mockAuthorize, mockLogin } from "@yagura/api-mocks";
import {
  MemoryJsonStore,
  MemoryStore,
  MemoryTabChannel,
} from "@yagura/browser";
import { render, screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { saveHandoff } from "./features/session/handoff";
import { signOutUnconfirmedNote } from "./features/session/SignInScreen";
import {
  server,
  sessionApi,
  signOut,
  testController,
  testTheme,
  testWidths,
} from "./test-support";

/** That `alert` says `title`, then `text`, and nothing else. */
function expectFailure(alert: HTMLElement, title: string, text: string) {
  expect(Array.from(alert.querySelectorAll("p"), (p) => p.textContent)).toEqual(
    [title, text],
  );
}

const description =
  "See your organization's development activity on GitHub at a glance.";

describe("App", () => {
  it("shows the sign-in screen when refresh answers 401", async () => {
    const { controller, mock } = testController();

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

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

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

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

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(controller.accessToken).toBe("ghu_mock_1");

    // Signed in, the page frame stays, with the app's name heading it for
    // assistive tech.
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yagura" })).toBeInTheDocument();
    signOut();

    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    // The session is ended behind the sign-in screen.
    await vi.waitFor(() => {
      expect(mock.signedIn).toBe(false);
    });
    const [request] = mock.requestsTo("DELETE", `${sessionApi}/session`);
    expect(request?.credentials).toBe("include");
    expect(controller.accessToken).toBeUndefined();
  });

  it("renders the callback screen from the location and leaves the callback URL", async () => {
    const { controller, mock, location, storage } = testController({
      url: "http://localhost:5173/callback?code=abc&state=s1",
    });
    saveHandoff(storage, { state: "s1", codeVerifier: "verifier" });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

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

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("");
    expect(mock.signedIn).toBe(true);
  });

  it("keeps a failed callback's error after leaving the callback URL", async () => {
    const { controller, mock, location } = testController({
      url: "http://localhost:5173/callback?code=abc&state=forged",
    });

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const alert = await screen.findByRole("alert");
    expectFailure(
      alert,
      "Could not sign you in.",
      "This sign-in link is out of date, was already used, or was opened in another tab. Please sign in again.",
    );
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

  it("says the sign-in was cancelled when the viewer cancels on GitHub", async () => {
    const { controller, storage, mock } = testController({
      url: "http://localhost:5173/callback?error=access_denied&state=s1",
    });
    saveHandoff(storage, { state: "s1", codeVerifier: "verifier" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );

    expectFailure(
      await screen.findByRole("alert"),
      "Sign-in cancelled.",
      "You cancelled the sign-in on GitHub. Sign in again whenever you are ready.",
    );
    expect(
      screen.getByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(mock.requests).toEqual([]);
    warn.mockRestore();
  });

  it.each([
    [
      "the network is down",
      () => HttpResponse.error(),
      "Yagura could not reach the network. Check your connection, then try signing in again.",
    ],
    [
      "GitHub fails behind the session API",
      () => HttpResponse.json({ error: "upstream_error" }, { status: 502 }),
      "GitHub or Yagura is not working right now. Try signing in again in a moment.",
    ],
  ])(
    "says what happened, without the technical detail, when %s",
    async (_, answer, message) => {
      const { controller, storage } = testController({
        url: "http://localhost:5173/callback?code=abc&state=s1",
      });
      saveHandoff(storage, { state: "s1", codeVerifier: "verifier" });
      server.use(http.post(`${sessionApi}/session`, answer));
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

      render(
        <App session={controller} widths={testWidths()} theme={testTheme()} />,
      );

      expectFailure(
        await screen.findByRole("alert"),
        "Could not sign you in.",
        message,
      );
      // The detail stays in the console.
      expect(warn).toHaveBeenCalledWith(
        "Could not sign in:",
        expect.any(Error),
      );
      warn.mockRestore();
    },
  );
});

describe("Signing out", () => {
  const deleteUrl = `${sessionApi}/session`;

  it("shows the sign-in screen before DELETE /session answers", async () => {
    const { controller, mock } = testController({ signedIn: true });
    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    const release = mock.holdRequests(
      ({ method, url }) => method === "DELETE" && url === deleteUrl,
    );

    signOut();

    expect(
      screen.getByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(controller.accessToken).toBeUndefined();
    await vi.waitFor(() => {
      expect(mock.requestsTo("DELETE", deleteUrl)).toHaveLength(1);
    });
    expect(mock.signedIn).toBe(true);

    release();
    await vi.waitFor(() => {
      expect(mock.signedIn).toBe(false);
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says on the sign-in screen when DELETE /session fails", async () => {
    const { controller } = testController({ signedIn: true });
    render(
      <App session={controller} widths={testWidths()} theme={testTheme()} />,
    );
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    server.use(
      http.delete(deleteUrl, () =>
        HttpResponse.json({ error: "upstream_error" }, { status: 502 }),
      ),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    signOut();

    expect(
      screen.getByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    const alert = await screen.findByRole("alert");
    expectFailure(
      alert,
      "Your sign-out may not be complete.",
      signOutUnconfirmedNote,
    );
    expect(controller.accessToken).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("words a failed sign-out apart from a failed sign-in", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failing = () =>
      HttpResponse.json({ error: "upstream_error" }, { status: 502 });

    const signingIn = testController({
      url: "http://localhost:5173/callback?code=abc&state=s1",
    });
    server.use(http.post(`${sessionApi}/session`, failing));
    saveHandoff(signingIn.storage, { state: "s1", codeVerifier: "verifier" });
    const failedSignIn = render(
      <App
        session={signingIn.controller}
        widths={testWidths()}
        theme={testTheme()}
      />,
    );
    const signInFailure = (await screen.findByRole("alert")).textContent;
    failedSignIn.unmount();

    const signingOut = testController({ signedIn: true });
    server.use(http.delete(deleteUrl, failing));
    render(
      <App
        session={signingOut.controller}
        widths={testWidths()}
        theme={testTheme()}
      />,
    );
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    signOut();
    const signOutFailure = (await screen.findByRole("alert")).textContent;

    expect(signInFailure).toMatch(/^Could not sign you in\./);
    expect(signOutFailure).toMatch(/^Your sign-out may not be complete\./);
    expect(signOutFailure).not.toBe(signInFailure);
    warn.mockRestore();
  });

  it("shows the sign-in screen and keeps nothing in a tab that missed another tab's sign-out, once its refresh answers 401", async () => {
    const cache = new MemoryJsonStore();
    const lastViewer = new MemoryStore();
    // The two tabs share the browser's cookie, storage and cache, but the
    // message never reaches the second tab, as when it was asleep.
    const first = testController({ signedIn: true, cache, lastViewer });
    const second = testController({
      mock: first.mock,
      cache,
      lastViewer,
      tabs: new MemoryTabChannel(),
    });
    await first.controller.restore();
    render(
      <App
        session={second.controller}
        widths={testWidths()}
        theme={testTheme()}
      />,
    );
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(cache.keys).not.toEqual([]);
    });

    await first.controller.signOut();
    expect(cache.keys).toEqual([]);
    expect(second.controller.state).toMatchObject({ status: "signed-in" });

    // The mock's tokens live 28800 s; the refresh runs 60 s before that.
    second.timer.advance(28_740_000);

    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("banner")).not.toBeInTheDocument();
    expect(second.controller.accessToken).toBeUndefined();
    expect(second.timer.pending).toBe(0);
    expect(lastViewer.get("yagura.last-viewer")).toBeUndefined();
    expect(cache.keys).toEqual([]);
  });
});
