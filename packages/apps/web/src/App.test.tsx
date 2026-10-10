import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App";
import { callsTo, fakeFetch, json } from "./testing/fake-fetch";
import { sessionApi, testController } from "./testing/session";

const tokens = {
  access_token: "ghu_1",
  token_type: "bearer",
  expires_in: 28800,
};

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("App", () => {
  it("shows the sign-in button when refresh answers 401", async () => {
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session/refresh`]: () =>
        json(401, { error: "invalid_session" }),
    });
    const { controller } = testController(fetch);

    render(<App session={controller} />);

    expect(screen.getByRole("heading", { name: "yagura" })).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(callsTo(fetch, `POST ${sessionApi}/session/refresh`)).toHaveLength(
      1,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restores the session on reload and signs out", async () => {
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session/refresh`]: () => json(200, tokens),
      "GET https://api.github.com/user": () => json(200, { login: "octocat" }),
      [`DELETE ${sessionApi}/session`]: () =>
        new Response(null, { status: 204 }),
    });
    const { controller } = testController(fetch);

    render(<App session={controller} />);
    expect(await screen.findByText("octocat")).toBeInTheDocument();
    expect(controller.accessToken).toBe("ghu_1");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    const [[, init]] = callsTo(fetch, `DELETE ${sessionApi}/session`) as [
      [unknown, RequestInit],
    ];
    expect(init.credentials).toBe("include");
    expect(controller.accessToken).toBeUndefined();
  });

  it("completes the callback and leaves the callback URL", async () => {
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session`]: () => json(200, tokens),
      "GET https://api.github.com/user": () => json(200, { login: "octocat" }),
    });
    const { controller, navigate } = testController(fetch);
    await controller.signIn();
    const state = navigate.mock.calls[0]?.[0].searchParams.get("state");
    window.history.replaceState(null, "", `/callback?code=abc&state=${state}`);

    render(<App session={controller} />);

    expect(await screen.findByText("octocat")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
    expect(callsTo(fetch, `POST ${sessionApi}/session`)).toHaveLength(1);
    expect(callsTo(fetch, `POST ${sessionApi}/session/refresh`)).toHaveLength(
      0,
    );
  });

  it("keeps a failed callback's error after leaving the callback URL", async () => {
    const fetch = fakeFetch({
      [`POST ${sessionApi}/session/refresh`]: () =>
        json(401, { error: "invalid_session" }),
    });
    const { controller } = testController(fetch);
    window.history.replaceState(null, "", "/callback?code=abc&state=forged");

    render(<App session={controller} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("state");
    expect(window.location.pathname).toBe("/");
    expect(
      screen.getByRole("button", { name: "Sign in with GitHub" }),
    ).toBeInTheDocument();
    expect(callsTo(fetch, `POST ${sessionApi}/session/refresh`)).toHaveLength(
      0,
    );
  });
});
