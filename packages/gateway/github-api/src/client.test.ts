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

const graphqlUrl = "https://api.github.com/graphql";

function pullRequestNode(overrides: Record<string, unknown> = {}) {
  return {
    __typename: "PullRequest",
    id: "PR_1",
    title: "Add the chart",
    url: "https://github.com/acme/app/pull/1",
    repository: { nameWithOwner: "acme/app" },
    author: { login: "octocat" },
    state: "MERGED",
    createdAt: "2026-10-01T10:00:00Z",
    mergedAt: "2026-10-02T11:30:00Z",
    additions: 12,
    deletions: 3,
    ...overrides,
  };
}

function searchPage(
  nodes: unknown[],
  endCursor: string | null = null,
): Response {
  return json({
    data: {
      search: {
        pageInfo: { hasNextPage: endCursor !== null, endCursor },
        nodes,
      },
    },
  });
}

function requestBody(init: RequestInit | undefined): {
  query: string;
  variables: Record<string, unknown>;
} {
  return JSON.parse(String(init?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
}

describe("GitHubApiClient.searchPullRequests", () => {
  it("follows the end cursor and maps the fields", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
      requestBody(init).variables.after === "cursor-1"
        ? searchPage([
            pullRequestNode({
              id: "PR_2",
              title: "Fix a typo",
              url: "https://github.com/someone/dotfiles/pull/7",
              repository: { nameWithOwner: "someone/dotfiles" },
              author: null,
              state: "OPEN",
              mergedAt: null,
            }),
            pullRequestNode({ id: "PR_3", state: "CLOSED", mergedAt: null }),
          ])
        : searchPage([pullRequestNode(), { __typename: "Issue" }], "cursor-1"),
    );
    const client = new GitHubApiClient({ fetch });

    await expect(
      client.searchPullRequests("ghu_abc", "is:pr author:octocat"),
    ).resolves.toEqual([
      {
        id: "PR_1",
        title: "Add the chart",
        url: "https://github.com/acme/app/pull/1",
        repository: "acme/app",
        author: "octocat",
        state: "merged",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        mergedAt: new Date("2026-10-02T11:30:00Z"),
        additions: 12,
        deletions: 3,
      },
      {
        id: "PR_2",
        title: "Fix a typo",
        url: "https://github.com/someone/dotfiles/pull/7",
        repository: "someone/dotfiles",
        author: "ghost",
        state: "open",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        mergedAt: null,
        additions: 12,
        deletions: 3,
      },
      expect.objectContaining({ id: "PR_3", state: "closed", mergedAt: null }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe(graphqlUrl);
      expect(init?.method).toBe("POST");
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer ghu_abc",
      );
      const { query, variables } = requestBody(init);
      expect(query).toContain("search(type: ISSUE");
      expect(query).toContain("first: 100");
      expect(variables.query).toBe("is:pr author:octocat");
    }
    expect(
      fetch.mock.calls.map(([, init]) => requestBody(init).variables.after),
    ).toEqual([null, "cursor-1"]);
  });

  it("turns GraphQL errors into an error with the first message", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      json({
        data: null,
        errors: [
          { type: "RATE_LIMITED", message: "API rate limit exceeded" },
          { message: "Another error" },
        ],
      }),
    );
    const client = new GitHubApiClient({ fetch });

    const error = await client
      .searchPullRequests("ghu_abc", "is:pr")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).message).toBe("API rate limit exceeded");
    expect((error as GitHubApiError).isUnauthorized).toBe(false);
  });

  it("turns a 401 into an unauthorized error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(JSON.stringify({ message: "Bad credentials" }), {
          status: 401,
        }),
    );
    const client = new GitHubApiClient({ fetch });

    const error = await client
      .searchPullRequests("expired", "is:pr")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).isUnauthorized).toBe(true);
    expect((error as GitHubApiError).message).toContain("POST /graphql");
  });

  it("rejects a pull request with an unknown state", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      searchPage([pullRequestNode({ state: "DRAFT" })]),
    );
    const client = new GitHubApiClient({ fetch });

    const error = await client
      .searchPullRequests("ghu_abc", "is:pr")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
  });
});

describe("GitHubApiClient.getPullRequests", () => {
  function nodesPage(nodes: unknown[], errors?: unknown[]): Response {
    return json({ data: { nodes }, ...(errors && { errors }) });
  }

  it("looks up 100 ids per request and maps the fields", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => `PR_${i}`);
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
      nodesPage(
        (requestBody(init).variables.ids as string[]).map((id) =>
          pullRequestNode({ id }),
        ),
      ),
    );
    const client = new GitHubApiClient({ fetch });

    const pullRequests = await client.getPullRequests("ghu_abc", ids);

    expect(pullRequests.map(({ id }) => id)).toEqual(ids);
    expect(pullRequests[0]).toEqual({
      id: "PR_0",
      title: "Add the chart",
      url: "https://github.com/acme/app/pull/1",
      repository: "acme/app",
      author: "octocat",
      state: "merged",
      createdAt: new Date("2026-10-01T10:00:00Z"),
      mergedAt: new Date("2026-10-02T11:30:00Z"),
      additions: 12,
      deletions: 3,
    });
    expect(
      fetch.mock.calls.map(
        ([, init]) => (requestBody(init).variables.ids as string[]).length,
      ),
    ).toEqual([100, 50]);
    for (const [url, init] of fetch.mock.calls) {
      expect(url).toBe(graphqlUrl);
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer ghu_abc",
      );
      expect(requestBody(init).query).toContain("nodes(ids: $ids)");
    }
  });

  it("leaves out ids that come back null, and other nodes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      nodesPage(
        [null, pullRequestNode({ id: "PR_2" }), { __typename: "Issue" }],
        [
          {
            type: "NOT_FOUND",
            path: ["nodes", 0],
            message: "Could not resolve to a node with the global id of 'PR_1'",
          },
        ],
      ),
    );
    const client = new GitHubApiClient({ fetch });

    const pullRequests = await client.getPullRequests("ghu_abc", [
      "PR_1",
      "PR_2",
      "I_3",
    ]);

    expect(pullRequests.map(({ id }) => id)).toEqual(["PR_2"]);
  });

  it("turns other GraphQL errors into an error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      nodesPage(
        [null],
        [{ type: "RATE_LIMITED", message: "API rate limit exceeded" }],
      ),
    );
    const client = new GitHubApiClient({ fetch });

    const error = await client
      .getPullRequests("ghu_abc", ["PR_1"])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).message).toBe("API rate limit exceeded");
  });

  it("makes no request for no ids", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new GitHubApiClient({ fetch });

    await expect(client.getPullRequests("ghu_abc", [])).resolves.toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
