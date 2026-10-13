import { mockLogin } from "@yagura/api-mocks";
import { MemoryStore } from "@yagura/browser";
import { GitHubApiError } from "@yagura/github-api";
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import {
  redirectUri,
  server,
  sessionApi,
  testController,
} from "../../test-support";
import { loadHandoff, saveHandoff } from "./handoff";

const lastViewerKey = "yagura.last-viewer";

/** A memory store whose `failing` operation throws, as blocked storage does. */
function failingStore(failing: "get" | "set"): MemoryStore {
  const store = new MemoryStore();
  store[failing] = () => {
    throw new Error("The operation is insecure.");
  };
  return store;
}

describe("SessionController.handleCallback", () => {
  it("rejects a state mismatch without posting the code", async () => {
    const { controller, mock, storage } = testController();
    saveHandoff(storage, { state: "expected", codeVerifier: "verifier" });

    await controller.handleCallback("?code=abc&state=forged");

    expect(mock.requests).toEqual([]);
    expect(controller.accessToken).toBeUndefined();
    expect(controller.state).toMatchObject({
      status: "signed-out",
      error: expect.stringContaining("state"),
    });
    expect(loadHandoff(storage)).toBeUndefined();
  });

  it("exchanges the code, keeps the token in memory, clears the handoff, and remembers the viewer", async () => {
    const { controller, mock, storage, lastViewer } = testController();
    saveHandoff(storage, { state: "s1", codeVerifier: "verifier" });

    await controller.handleCallback("?code=abc&state=s1");

    const [request] = mock.requestsTo("POST", `${sessionApi}/session`);
    expect(request?.credentials).toBe("include");
    expect(request?.body).toEqual({
      code: "abc",
      code_verifier: "verifier",
      redirect_uri: redirectUri,
    });
    expect(controller.accessToken).toBe("ghu_mock_1");
    expect(controller.state).toEqual({
      status: "signed-in",
      login: mockLogin,
      confirmed: true,
    });
    expect(loadHandoff(storage)).toBeUndefined();
    expect(lastViewer.get(lastViewerKey)).toBe(mockLogin);
  });

  it("surfaces invalid_grant from the session API", async () => {
    const { controller, storage } = testController();
    server.use(
      http.post(`${sessionApi}/session`, () =>
        HttpResponse.json({ error: "invalid_grant" }, { status: 400 }),
      ),
    );
    saveHandoff(storage, { state: "s1", codeVerifier: "verifier" });

    await controller.handleCallback("?code=abc&state=s1");

    expect(controller.accessToken).toBeUndefined();
    expect(controller.state).toMatchObject({
      status: "signed-out",
      error: expect.stringContaining("invalid_grant"),
    });
  });

  it("ends signed out without posting the code when the store cannot be read", async () => {
    const { controller, mock } = testController({
      storage: failingStore("get"),
    });

    await controller.handleCallback("?code=abc&state=s1");

    expect(mock.requests).toEqual([]);
    expect(controller.accessToken).toBeUndefined();
    expect(controller.state).toMatchObject({
      status: "signed-out",
      error: expect.stringContaining("browser storage"),
    });
  });
});

describe("SessionController.signIn", () => {
  it("sends the browser to GitHub with state and an S256 challenge", async () => {
    const { controller, location, storage } = testController();

    await controller.signIn();

    const [url] = location.assigned;
    expect(url?.origin + (url?.pathname ?? "")).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url?.searchParams.get("client_id")).toBe("Iv1.test");
    expect(url?.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(url?.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url?.searchParams.get("state")).toBe(loadHandoff(storage)?.state);
  });

  it("ends signed out without navigating when the store cannot be written", async () => {
    const { controller, location } = testController({
      storage: failingStore("set"),
    });

    await controller.signIn();

    expect(location.assigned).toEqual([]);
    expect(location.href).toBe("http://localhost:5173/");
    expect(controller.state).toMatchObject({
      status: "signed-out",
      error: expect.stringContaining("browser storage"),
    });
  });
});

describe("SessionController token refresh", () => {
  it("refreshes the access token when the timer reaches its expiry margin", async () => {
    const { controller, mock, timer } = testController({ signedIn: true });
    await controller.restore();
    expect(controller.accessToken).toBe("ghu_mock_1");

    // The mock's tokens live 28800 s; the refresh runs 60 s before that.
    timer.advance(28_740_000 - 1);
    expect(
      mock.requestsTo("POST", `${sessionApi}/session/refresh`),
    ).toHaveLength(1);

    timer.advance(1);
    await vi.waitFor(() => {
      expect(controller.accessToken).toBe("ghu_mock_2");
    });
    expect(
      mock.requestsTo("POST", `${sessionApi}/session/refresh`),
    ).toHaveLength(2);
    expect(timer.pending).toBe(1);
  });

  it("signs out when the refresh on expiry answers 401", async () => {
    const { controller, mock, timer } = testController({ signedIn: true });
    await controller.restore();
    mock.signedIn = false;

    timer.advance(28_740_000);

    await vi.waitFor(() => {
      expect(controller.state).toEqual({ status: "signed-out" });
    });
    expect(controller.accessToken).toBeUndefined();
    expect(timer.pending).toBe(0);
  });
});

describe("SessionController.withAccessToken", () => {
  it("refreshes once on a GitHub 401 and retries with the new token", async () => {
    const { controller, mock } = testController({ signedIn: true });
    await controller.restore();
    expect(controller.accessToken).toBe("ghu_mock_1");

    const seen: string[] = [];
    const result = await controller.withAccessToken(async (token) => {
      seen.push(token);
      if (seen.length === 1) {
        throw new GitHubApiError(401, "expired");
      }
      return token;
    });

    expect(result).toBe("ghu_mock_2");
    expect(seen).toEqual(["ghu_mock_1", "ghu_mock_2"]);
    expect(
      mock.requestsTo("POST", `${sessionApi}/session/refresh`),
    ).toHaveLength(2);
  });

  it("does not retry a second 401", async () => {
    const { controller } = testController({ signedIn: true });
    await controller.restore();

    let calls = 0;
    await expect(
      controller.withAccessToken(async () => {
        calls += 1;
        throw new GitHubApiError(401, "expired");
      }),
    ).rejects.toBeInstanceOf(GitHubApiError);
    expect(calls).toBe(2);
  });
});

describe("SessionController.restore with a remembered last viewer", () => {
  const refreshUrl = `${sessionApi}/session/refresh`;

  function remembering(login: string, signedIn: boolean) {
    const lastViewer = new MemoryStore();
    lastViewer.set(lastViewerKey, login);
    const test = testController({ signedIn, lastViewer });
    const release = test.mock.holdRequests(({ url }) => url === refreshUrl);
    return { ...test, release };
  }

  it("signs the last viewer in unconfirmed at once, then confirms them", async () => {
    const { controller, release } = remembering(mockLogin, true);

    const restored = controller.restore();

    expect(controller.state).toEqual({
      status: "signed-in",
      login: mockLogin,
      confirmed: false,
    });
    release();
    await restored;
    expect(controller.state).toEqual({
      status: "signed-in",
      login: mockLogin,
      confirmed: true,
    });
  });

  it("drops cache writes until the session is confirmed", async () => {
    const { controller, cache, release } = remembering(mockLogin, true);
    const restored = controller.restore();

    await controller.viewerCache().set("before", 1);
    release();
    await restored;
    await controller.viewerCache().set("after", 2);

    expect(await controller.viewerCache().get("before")).toBeUndefined();
    expect(await controller.viewerCache().get("after")).toBe(2);
    expect(await cache.get(`${mockLogin}/after`)).toBe(2);
  });

  it("runs a GitHub call once the restore has the token", async () => {
    const { controller, mock, release } = remembering(mockLogin, true);
    void controller.restore();

    const token = controller.withAccessToken(async (token) => token);
    await vi.waitFor(() => {
      expect(mock.requestsTo("POST", refreshUrl)).toHaveLength(1);
    });
    release();

    expect(await token).toBe("ghu_mock_1");
  });

  it("forgets the last viewer and fails waiting calls when the session has ended", async () => {
    const { controller, lastViewer, release } = remembering(mockLogin, false);
    const restored = controller.restore();
    const call = controller.withAccessToken(async (token) => token);

    release();
    await restored;

    expect(controller.state).toEqual({ status: "signed-out" });
    expect(lastViewer.get(lastViewerKey)).toBeUndefined();
    await expect(call).rejects.toThrow("The session has ended");
  });

  it("keeps the last viewer when the refresh fails otherwise", async () => {
    const { controller, lastViewer, release } = remembering(mockLogin, true);
    server.use(
      http.post(refreshUrl, () =>
        HttpResponse.json({ error: "upstream_error" }, { status: 502 }),
      ),
    );

    release();
    await controller.restore();

    expect(controller.state).toMatchObject({ status: "signed-out" });
    expect(lastViewer.get(lastViewerKey)).toBe(mockLogin);
  });

  it("switches to the login the session is confirmed as", async () => {
    const { controller, lastViewer, release } = remembering(
      "someone-else",
      true,
    );
    const restored = controller.restore();
    const call = controller.withAccessToken(async (token) => token);

    release();
    await restored;

    expect(controller.state).toEqual({
      status: "signed-in",
      login: mockLogin,
      confirmed: true,
    });
    expect(lastViewer.get(lastViewerKey)).toBe(mockLogin);
    await expect(call).rejects.toThrow(`Signed in as ${mockLogin} instead`);
  });

  it("stays signed out when the viewer signs out before the restore answers", async () => {
    const { controller, mock, lastViewer, release } = remembering(
      mockLogin,
      true,
    );
    const restored = controller.restore();
    await vi.waitFor(() => {
      expect(mock.requestsTo("POST", refreshUrl)).toHaveLength(1);
    });

    const signedOut = controller.signOut();
    // The refresh's cookie must not land after the one DELETE clears.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mock.requestsTo("DELETE", `${sessionApi}/session`)).toEqual([]);
    release();
    await Promise.all([signedOut, restored]);

    expect(mock.requestsTo("DELETE", `${sessionApi}/session`)).toHaveLength(1);
    expect(controller.state).toEqual({ status: "signed-out" });
    expect(controller.accessToken).toBeUndefined();
    expect(lastViewer.get(lastViewerKey)).toBeUndefined();
  });

  it("reads a failing store as nothing remembered", async () => {
    const lastViewer = failingStore("get");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { controller } = testController({ signedIn: true, lastViewer });

    const restored = controller.restore();
    expect(controller.state).toEqual({ status: "pending" });
    await restored;

    expect(controller.state).toMatchObject({ status: "signed-in" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
