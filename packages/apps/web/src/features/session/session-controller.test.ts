import { mockLogin } from "@yagura/api-mocks";
import {
  MemoryJsonStore,
  MemoryStore,
  MemoryTabChannel,
} from "@yagura/browser";
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

/** The method and URL of each request the API mock answered, in order. */
function requestLines(
  requests: readonly { method: string; url: string }[],
): string[] {
  return requests.map(({ method, url }) => `${method} ${url}`);
}

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

  it("exchanges the code, keeps the token in memory, clears the handoff, and remembers the viewer without asking GitHub", async () => {
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
    expect(requestLines(mock.requests)).toEqual([`POST ${sessionApi}/session`]);
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

describe("SessionController.restore", () => {
  it("confirms the viewer from the refresh alone, without asking GitHub", async () => {
    const { controller, mock, lastViewer } = testController({
      signedIn: true,
    });

    await controller.restore();

    expect(controller.state).toEqual({
      status: "signed-in",
      login: mockLogin,
      confirmed: true,
    });
    expect(lastViewer.get(lastViewerKey)).toBe(mockLogin);
    expect(requestLines(mock.requests)).toEqual([
      `POST ${sessionApi}/session/refresh`,
    ]);
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

  it("switches to the login a refresh on expiry answers with", async () => {
    const { controller, timer } = testController({ signedIn: true });
    await controller.restore();
    server.use(
      http.post(`${sessionApi}/session/refresh`, () =>
        HttpResponse.json({
          access_token: "ghu_other",
          token_type: "bearer",
          expires_in: 28800,
          login: "someone-else",
        }),
      ),
    );

    timer.advance(28_740_000);

    await vi.waitFor(() => {
      expect(controller.state).toEqual({
        status: "signed-in",
        login: "someone-else",
        confirmed: true,
      });
    });
    expect(controller.accessToken).toBe("ghu_other");
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

  it("does not retry for a refresh that answers with another login", async () => {
    const { controller, lastViewer } = testController({ signedIn: true });
    await controller.restore();
    server.use(
      http.post(`${sessionApi}/session/refresh`, () =>
        HttpResponse.json({
          access_token: "ghu_other",
          token_type: "bearer",
          expires_in: 28800,
          login: "someone-else",
        }),
      ),
    );

    let calls = 0;
    await expect(
      controller.withAccessToken(async () => {
        calls += 1;
        throw new GitHubApiError(401, "expired");
      }),
    ).rejects.toThrow("Signed in as someone-else instead");
    expect(calls).toBe(1);
    expect(controller.state).toEqual({
      status: "signed-in",
      login: "someone-else",
      confirmed: true,
    });
    expect(lastViewer.get(lastViewerKey)).toBe("someone-else");
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
    const { controller, mock, lastViewer, release } = remembering(
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
    expect(requestLines(mock.requests)).toEqual([`POST ${refreshUrl}`]);
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
    // The sign-in screen does not wait for DELETE /session.
    expect(controller.state).toEqual({ status: "signed-out" });
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

describe("SessionController.signOut in another tab", () => {
  const refreshUrl = `${sessionApi}/session/refresh`;
  const deleteUrl = `${sessionApi}/session`;

  /** Two tabs of one browser, both signed in as the mock's viewer. */
  async function twoTabs() {
    const tabs = new MemoryTabChannel();
    const cache = new MemoryJsonStore();
    const lastViewer = new MemoryStore();
    const first = testController({ signedIn: true, cache, lastViewer, tabs });
    const second = testController({
      mock: first.mock,
      cache,
      lastViewer,
      tabs: tabs.openTab(),
    });
    await first.controller.restore();
    await second.controller.restore();
    return { first, second, cache, lastViewer };
  }

  it("signs out the other tab at once, which sends no DELETE /session", async () => {
    const { first, second, lastViewer } = await twoTabs();
    expect(second.controller.state).toMatchObject({ status: "signed-in" });
    expect(second.timer.pending).toBe(1);

    const signedOut = first.controller.signOut();

    expect(second.controller.state).toEqual({ status: "signed-out" });
    expect(second.controller.accessToken).toBeUndefined();
    expect(second.timer.pending).toBe(0);
    await signedOut;
    expect(first.mock.requestsTo("DELETE", deleteUrl)).toHaveLength(1);
    expect(second.tabs.posted).toEqual([]);
    expect(lastViewer.get(lastViewerKey)).toBeUndefined();
  });

  it("keeps a load or refresh in the other tab that answers afterwards from storing anything, and ends the session again after that refresh", async () => {
    const { first, second, cache, lastViewer } = await twoTabs();
    const viewerCache = second.controller.viewerCache();
    await viewerCache.set("before", 1);
    expect(await cache.get(`${mockLogin}/before`)).toBe(1);
    // The refresh on expiry answers only after the sign-out, and with new
    // tokens, as one the server answered just before the cookie was
    // cleared would.
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    let served = false;
    server.use(
      http.post(refreshUrl, async () => {
        await answered;
        served = true;
        return HttpResponse.json({
          access_token: "ghu_late",
          token_type: "bearer",
          expires_in: 28800,
          login: mockLogin,
        });
      }),
    );
    second.timer.advance(28_740_000);
    let loaded!: () => void;
    const load = second.controller.withAccessToken(async (token) => {
      await new Promise<void>((resolve) => {
        loaded = resolve;
      });
      await viewerCache.set("late", token);
    });
    await vi.waitFor(() => {
      expect(loaded).toBeDefined();
    });

    await first.controller.signOut();
    // The other tab drops its token and timers at once, but waits for its
    // refresh before deciding whether to end the session again.
    expect(second.controller.accessToken).toBeUndefined();
    expect(second.timer.pending).toBe(0);
    expect(first.mock.requestsTo("DELETE", deleteUrl)).toHaveLength(1);
    answer();
    loaded();
    await load;
    await vi.waitFor(() => {
      expect(served).toBe(true);
    });
    // The refresh's answer set the cookie again, with the rotated token,
    // after the first DELETE cleared it, so the other tab clears it again.
    await vi.waitFor(() => {
      expect(first.mock.requestsTo("DELETE", deleteUrl)).toHaveLength(2);
    });
    expect(second.tabs.posted).toEqual([]);

    expect(second.controller.state).toEqual({ status: "signed-out" });
    expect(second.controller.accessToken).toBeUndefined();
    expect(second.timer.pending).toBe(0);
    expect(lastViewer.get(lastViewerKey)).toBeUndefined();
    expect(cache.keys).toEqual([]);
  });

  it("sends no DELETE /session from the other tab when its refresh in flight fails", async () => {
    const { first, second, cache, lastViewer } = await twoTabs();
    // The refresh on expiry answers after the sign-out, which has cleared
    // the cookie, so it fails and sets no cookie.
    let answer!: () => void;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    let served = false;
    server.use(
      http.post(refreshUrl, async () => {
        await answered;
        served = true;
        return HttpResponse.json({ error: "invalid_session" }, { status: 401 });
      }),
    );
    second.timer.advance(28_740_000);

    await first.controller.signOut();
    answer();
    await vi.waitFor(() => {
      expect(served).toBe(true);
    });
    // Let the controller take the answer in.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(first.mock.requestsTo("DELETE", deleteUrl)).toHaveLength(1);
    expect(second.controller.state).toEqual({ status: "signed-out" });
    expect(second.controller.accessToken).toBeUndefined();
    expect(second.timer.pending).toBe(0);
    expect(lastViewer.get(lastViewerKey)).toBeUndefined();
    expect(cache.keys).toEqual([]);
  });
});
