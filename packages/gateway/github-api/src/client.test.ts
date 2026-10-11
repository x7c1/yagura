import { describe, expect, it, vi } from "vitest";
import { GitHubApiClient } from "./client";
import { GitHubApiError } from "./error";

describe("GitHubApiClient.getViewer", () => {
  it("sends the bearer token and returns the login", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ login: "octocat", id: 1 }), {
          status: 200,
        }),
    );
    const client = new GitHubApiClient({ fetch });

    await expect(client.getViewer("ghu_abc")).resolves.toEqual({
      login: "octocat",
    });
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe("https://api.github.com/user");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer ghu_abc",
    );
  });

  it("turns a 401 into an unauthorized error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("{}", { status: 401 }),
    );
    const client = new GitHubApiClient({ fetch });

    const error = await client.getViewer("expired").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).isUnauthorized).toBe(true);
  });
});
