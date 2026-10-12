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

function json(body: unknown, link?: string): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: link === undefined ? {} : { Link: link },
  });
}

describe("GitHubApiClient.listOrganizationInstallations", () => {
  it("follows the next link and keeps organizations, sorted by login", async () => {
    const next =
      "https://api.github.com/user/installations?per_page=100&page=2";
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
      url === next
        ? json({
            total_count: 3,
            installations: [
              { account: { login: "beta", type: "Organization" } },
            ],
          })
        : json(
            {
              total_count: 3,
              installations: [
                { account: { login: "gamma", type: "Organization" } },
                { account: { login: "someone", type: "User" } },
              ],
            },
            `<${next}>; rel="next", <${next}>; rel="last"`,
          ),
    );
    const client = new GitHubApiClient({ fetch });

    await expect(
      client.listOrganizationInstallations("ghu_abc"),
    ).resolves.toEqual([{ login: "beta" }, { login: "gamma" }]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/user/installations?per_page=100",
      next,
    ]);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer ghu_abc",
      );
    }
  });

  it("rejects a body without installations", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => json({}));
    const client = new GitHubApiClient({ fetch });

    const error = await client
      .listOrganizationInstallations("ghu_abc")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
  });
});

describe("GitHubApiClient.listOrganizationMembers", () => {
  it("follows the next link and returns members sorted by login", async () => {
    const next = "https://api.github.com/orgs/acme/members?per_page=100&page=2";
    const fetch = vi.fn<typeof globalThis.fetch>(async (url) =>
      url === next
        ? json([{ login: "Bob", avatar_url: "https://avatars/bob" }])
        : json(
            [
              { login: "carol", avatar_url: "https://avatars/carol" },
              { login: "alice", avatar_url: "https://avatars/alice" },
            ],
            `<${next}>; rel="next"`,
          ),
    );
    const client = new GitHubApiClient({ fetch });

    await expect(
      client.listOrganizationMembers("ghu_abc", "acme"),
    ).resolves.toEqual([
      { login: "alice", avatarUrl: "https://avatars/alice" },
      { login: "Bob", avatarUrl: "https://avatars/bob" },
      { login: "carol", avatarUrl: "https://avatars/carol" },
    ]);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.github.com/orgs/acme/members?per_page=100",
      next,
    ]);
  });

  it("turns a non-2xx response into an error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("{}", { status: 404 }),
    );
    const client = new GitHubApiClient({ fetch });

    const error = await client
      .listOrganizationMembers("ghu_abc", "acme")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).status).toBe(404);
    expect((error as GitHubApiError).message).toContain(
      "GET /orgs/acme/members",
    );
  });
});
