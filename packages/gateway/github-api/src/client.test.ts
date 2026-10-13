import { describe, expect, it, vi } from "vitest";
import { GitHubApiClient } from "./client";
import { GitHubApiError } from "./error";

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
              {
                account: {
                  login: "beta",
                  type: "Organization",
                  avatar_url: "https://avatars/beta",
                },
              },
            ],
          })
        : json(
            {
              total_count: 3,
              installations: [
                {
                  account: {
                    login: "gamma",
                    type: "Organization",
                    avatar_url: "https://avatars/gamma",
                  },
                },
                { account: { login: "someone", type: "User" } },
              ],
            },
            `<${next}>; rel="next", <${next}>; rel="last"`,
          ),
    );
    const client = new GitHubApiClient({ fetch });

    await expect(
      client.listOrganizationInstallations("ghu_abc"),
    ).resolves.toEqual([
      { login: "beta", avatarUrl: "https://avatars/beta" },
      { login: "gamma", avatarUrl: "https://avatars/gamma" },
    ]);
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

  it("leaves out an avatar the account does not have", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      json({
        total_count: 1,
        installations: [{ account: { login: "beta", type: "Organization" } }],
      }),
    );
    const client = new GitHubApiClient({ fetch });

    const [organization] =
      await client.listOrganizationInstallations("ghu_abc");

    expect(organization).toStrictEqual({ login: "beta" });
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

/** A pull request node as the search answers it: the id, state and times. */
function foundNode(overrides: Record<string, unknown> = {}) {
  const { __typename, id, state, createdAt, mergedAt } = pullRequestNode();
  return { __typename, id, state, createdAt, mergedAt, ...overrides };
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

describe("GitHubApiClient.searchPullRequestIds", () => {
  it("follows the end cursor and maps the id, state and times", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) =>
      requestBody(init).variables.after === "cursor-1"
        ? searchPage([
            foundNode({ id: "PR_2", state: "OPEN", mergedAt: null }),
            foundNode({ id: "PR_3", state: "CLOSED", mergedAt: null }),
          ])
        : searchPage([foundNode(), { __typename: "Issue" }], "cursor-1"),
    );
    const client = new GitHubApiClient({ fetch });

    await expect(
      client.searchPullRequestIds("ghu_abc", "is:pr author:octocat"),
    ).resolves.toEqual([
      {
        id: "PR_1",
        state: "merged",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        mergedAt: new Date("2026-10-02T11:30:00Z"),
      },
      {
        id: "PR_2",
        state: "open",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        mergedAt: null,
      },
      {
        id: "PR_3",
        state: "closed",
        createdAt: new Date("2026-10-01T10:00:00Z"),
        mergedAt: null,
      },
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
      // The lines are computed per pull request; the search leaves them out.
      expect(query).not.toContain("additions");
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
      .searchPullRequestIds("ghu_abc", "is:pr")
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
      .searchPullRequestIds("expired", "is:pr")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(GitHubApiError);
    expect((error as GitHubApiError).isUnauthorized).toBe(true);
    expect((error as GitHubApiError).message).toContain("POST /graphql");
  });

  it("rejects a pull request with an unknown state", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      searchPage([foundNode({ state: "DRAFT" })]),
    );
    const client = new GitHubApiClient({ fetch });

    const error = await client
      .searchPullRequestIds("ghu_abc", "is:pr")
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
        [
          null,
          pullRequestNode({ id: "PR_2", author: null }),
          { __typename: "Issue" },
        ],
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
    // A deleted account's pull request has no author.
    expect(pullRequests[0]?.author).toBe("ghost");
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
