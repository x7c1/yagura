import { describe, expect, it, vi } from "vitest";
import { SessionApiClient } from "./client";
import { SessionApiError } from "./error";

const baseUrl = "http://localhost:8787";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("SessionApiClient", () => {
  it("posts the code exchange with credentials and parses the tokens", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(200, {
        access_token: "ghu_abc",
        token_type: "bearer",
        expires_in: 28800,
      }),
    );
    const client = new SessionApiClient({ baseUrl, fetch });

    const tokens = await client.createSession({
      code: "the-code",
      codeVerifier: "the-verifier",
      redirectUri: "http://localhost:5173/callback",
    });

    expect(tokens).toEqual({
      accessToken: "ghu_abc",
      tokenType: "bearer",
      expiresIn: 28800,
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${baseUrl}/session`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(JSON.parse(String(init?.body))).toEqual({
      code: "the-code",
      code_verifier: "the-verifier",
      redirect_uri: "http://localhost:5173/callback",
    });
  });

  it("maps a 400 invalid_grant body to a typed error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(400, {
        error: "invalid_grant",
        error_description: "The code has expired.",
      }),
    );
    const client = new SessionApiClient({ baseUrl, fetch });

    const error = await client
      .createSession({ code: "c", codeVerifier: "v", redirectUri: "r" })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SessionApiError);
    expect(error).toMatchObject({
      status: 400,
      code: "invalid_grant",
      description: "The code has expired.",
    });
  });

  it("maps an unreadable error body to unexpected_response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("Bad Gateway", { status: 502 }),
    );
    const client = new SessionApiClient({ baseUrl, fetch });

    await expect(client.refreshSession()).rejects.toMatchObject({
      status: 502,
      code: "unexpected_response",
    });
  });

  it("refreshes with credentials and no body", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(401, { error: "invalid_session" }),
    );
    const client = new SessionApiClient({ baseUrl, fetch });

    await expect(client.refreshSession()).rejects.toMatchObject({
      status: 401,
      code: "invalid_session",
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${baseUrl}/session/refresh`);
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBeUndefined();
  });

  it("deletes the session with credentials", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response(null, { status: 204 }),
    );
    const client = new SessionApiClient({ baseUrl, fetch });

    await client.deleteSession();

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${baseUrl}/session`);
    expect(init?.method).toBe("DELETE");
    expect(init?.credentials).toBe("include");
  });
});
