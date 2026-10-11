import { GitHubApiError } from "@yagura/github-api";
import { afterEach, describe, expect, it } from "vitest";
import { callsTo, fakeFetch, json } from "../../testing/fake-fetch";
import { sessionApi, testController } from "../../testing/session";
import { clearHandoff, loadHandoff, saveHandoff } from "./handoff";

const tokens = {
  access_token: "ghu_1",
  token_type: "bearer",
  expires_in: 28800,
};
const viewer = () => json(200, { login: "octocat" });

afterEach(() => {
  clearHandoff();
});

describe("SessionController.handleCallback", () => {
  it("rejects a state mismatch without posting the code", async () => {
    const fetch = fakeFetch({});
    const { controller } = testController(fetch);
    saveHandoff({ state: "expected", codeVerifier: "verifier" });

    await controller.handleCallback("?code=abc&state=forged");

    expect(fetch).not.toHaveBeenCalled();
    expect(controller.accessToken).toBeUndefined();
    expect(controller.state).toMatchObject({
      status: "signed-out",
      error: expect.stringContaining("state"),
    });
    expect(loadHandoff()).toBeUndefined();
  });

  it("exchanges the code, keeps the token in memory, and clears the handoff", async () => {
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session`]: () => json(200, tokens),
      "GET https://api.github.com/user": viewer,
    });
    const { controller } = testController(fetch);
    saveHandoff({ state: "s1", codeVerifier: "verifier" });

    await controller.handleCallback("?code=abc&state=s1");

    const [[, init]] = callsTo(fetch, `POST ${sessionApi}/session`) as [
      [unknown, RequestInit],
    ];
    expect(init.credentials).toBe("include");
    expect(JSON.parse(String(init.body))).toEqual({
      code: "abc",
      code_verifier: "verifier",
      redirect_uri: "http://localhost:5173/callback",
    });
    expect(controller.accessToken).toBe("ghu_1");
    expect(controller.state).toEqual({ status: "signed-in", login: "octocat" });
    expect(loadHandoff()).toBeUndefined();
  });

  it("surfaces invalid_grant from the session API", async () => {
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session`]: () =>
        json(400, { error: "invalid_grant" }),
    });
    const { controller } = testController(fetch);
    saveHandoff({ state: "s1", codeVerifier: "verifier" });

    await controller.handleCallback("?code=abc&state=s1");

    expect(controller.accessToken).toBeUndefined();
    expect(controller.state).toMatchObject({
      status: "signed-out",
      error: expect.stringContaining("invalid_grant"),
    });
  });
});

describe("SessionController.signIn", () => {
  it("sends the browser to GitHub with state and an S256 challenge", async () => {
    const { controller, navigate } = testController(fakeFetch({}));

    await controller.signIn();

    const url = navigate.mock.calls[0]?.[0];
    expect(url?.origin + (url?.pathname ?? "")).toBe(
      "https://github.com/login/oauth/authorize",
    );
    expect(url?.searchParams.get("client_id")).toBe("Iv1.test");
    expect(url?.searchParams.get("redirect_uri")).toBe(
      "http://localhost:5173/callback",
    );
    expect(url?.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url?.searchParams.get("state")).toBe(loadHandoff()?.state);
  });
});

describe("SessionController.withAccessToken", () => {
  it("refreshes once on a GitHub 401 and retries with the new token", async () => {
    let refreshes = 0;
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session/refresh`]: () => {
        refreshes += 1;
        return json(200, { ...tokens, access_token: `ghu_r${refreshes}` });
      },
      "GET https://api.github.com/user": viewer,
    });
    const { controller } = testController(fetch);
    await controller.restore();
    expect(controller.accessToken).toBe("ghu_r1");

    const seen: string[] = [];
    const result = await controller.withAccessToken(async (token) => {
      seen.push(token);
      if (seen.length === 1) {
        throw new GitHubApiError(401, "expired");
      }
      return token;
    });

    expect(result).toBe("ghu_r2");
    expect(seen).toEqual(["ghu_r1", "ghu_r2"]);
    expect(refreshes).toBe(2);
  });

  it("does not retry a second 401", async () => {
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session/refresh`]: () => json(200, tokens),
      "GET https://api.github.com/user": viewer,
    });
    const { controller } = testController(fetch);
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
