import { describe, expect, it, vi } from "vitest";
import { ActivityApiClient } from "./client";
import { ActivityApiError } from "./error";
import { encodeOrganizationActivity, parseOrganizationActivity } from "./parse";

const baseUrl = "http://localhost:8787";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const activityBody = {
  members: [
    { id: "u1", login: "octocat", type: "User" },
    { id: 49699333, login: "dependabot[bot]", type: "Bot" },
  ],
  pullRequests: [
    {
      id: "pr1",
      repository: { id: "r1", ownerLogin: "acme", name: "web" },
      number: 12,
      title: "Draw the chart",
      state: "open",
      draft: true,
      additions: 30,
      deletions: 4,
      authorId: "u1",
      createdAt: "2026-10-12T13:00:00.000Z",
    },
  ],
  activities: [
    {
      kind: "opened",
      pullRequestId: "pr1",
      actorId: "u1",
      occurredAt: "2026-10-12T13:00:00.000Z",
    },
    {
      kind: "pushed",
      pullRequestId: "pr1",
      actorId: "u1",
      occurredAt: "2026-10-12T14:05:00.000Z",
    },
  ],
};

describe("ActivityApiClient", () => {
  it("lists the organizations with the bearer token and no cookies", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(200, {
        organizations: [
          { id: 7, login: "acme", avatarUrl: "https://example.com/a.png" },
        ],
      }),
    );
    const client = new ActivityApiClient({ baseUrl, fetch });

    await expect(client.listOrganizations("ghu_abc")).resolves.toEqual([
      { id: "7", login: "acme", avatarUrl: "https://example.com/a.png" },
    ]);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe(`${baseUrl}/activity/organizations`);
    expect(init?.method).toBe("GET");
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer ghu_abc",
    );
  });

  it("asks for the activity of an organization over a range, and reads it", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(200, activityBody),
    );
    const client = new ActivityApiClient({ baseUrl, fetch });
    const from = new Date("2026-09-29T04:00:00Z");
    const to = new Date("2026-10-13T04:00:00Z");

    const activity = await client.getActivity("ghu_abc", {
      organization: "7",
      from,
      to,
    });

    const [url, init] = fetch.mock.calls[0] ?? [];
    const requested = new URL(String(url));
    expect(requested.origin + requested.pathname).toBe(`${baseUrl}/activity`);
    expect(requested.searchParams.get("organization")).toBe("7");
    // The bounds carry the local offset, and denote the same instants.
    const params = ["from", "to"].map(
      (name) => requested.searchParams.get(name) ?? "",
    );
    for (const param of params) {
      expect(param).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
    }
    expect(params.map((param) => new Date(param))).toEqual([from, to]);
    expect(init?.credentials).toBe("omit");
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer ghu_abc",
    );

    expect(activity.members).toEqual([
      { id: "u1", login: "octocat", type: "User" },
      { id: "49699333", login: "dependabot[bot]", type: "Bot" },
    ]);
    expect(activity.pullRequests[0]).toMatchObject({
      id: "pr1",
      number: 12,
      draft: true,
      createdAt: new Date("2026-10-12T13:00:00.000Z"),
    });
    expect(activity.activities.map(({ kind }) => kind)).toEqual([
      "opened",
      "pushed",
    ]);
  });

  it.each([
    [400, "invalid_request"],
    [401, "invalid_token"],
    [403, "forbidden"],
    [404, "not_found"],
    [500, "internal_error"],
    [502, "upstream_error"],
  ] as const)("maps a %i %s body to a typed error", async (status, code) => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(status, { error: code, error_description: "Because." }),
    );
    const client = new ActivityApiClient({ baseUrl, fetch });

    const error = await client
      .listOrganizations("ghu_abc")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ActivityApiError);
    expect(error).toMatchObject({ status, code, description: "Because." });
  });

  it("marks a 401 as unauthorized, for the session to be refreshed", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(401, { error: "invalid_token" }),
    );
    const client = new ActivityApiClient({ baseUrl, fetch });

    const error = await client
      .listOrganizations("ghu_old")
      .catch((e: unknown) => e);

    expect((error as ActivityApiError).isUnauthorized).toBe(true);
    expect(new ActivityApiError(403, "forbidden").isUnauthorized).toBe(false);
  });

  it("maps an unreadable error body to unexpected_response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("Bad Gateway", { status: 502 }),
    );
    const client = new ActivityApiClient({ baseUrl, fetch });

    await expect(client.listOrganizations("ghu_abc")).rejects.toMatchObject({
      status: 502,
      code: "unexpected_response",
    });
  });

  it("maps a successful body of another shape to unexpected_response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      jsonResponse(200, { ...activityBody, members: [{ id: "u1" }] }),
    );
    const client = new ActivityApiClient({ baseUrl, fetch });

    await expect(
      client.getActivity("ghu_abc", {
        organization: "7",
        from: new Date(),
        to: new Date(),
      }),
    ).rejects.toMatchObject({ status: 200, code: "unexpected_response" });
  });

  it("maps a request that got no response to network_error", async () => {
    const failure = new TypeError("Failed to fetch");
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw failure;
    });
    const client = new ActivityApiClient({ baseUrl, fetch });

    const error = await client
      .listOrganizations("ghu_abc")
      .catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0, code: "network_error" });
    expect((error as ActivityApiError).cause).toBe(failure);
  });
});

describe("encodeOrganizationActivity", () => {
  it("writes the activity back as the API does, so that it reads back the same", () => {
    const activity = parseOrganizationActivity(activityBody);
    if (activity === undefined) {
      throw new Error("The fixture does not parse");
    }

    const encoded = encodeOrganizationActivity(activity);

    expect(parseOrganizationActivity(encoded)).toEqual(activity);
    expect(JSON.parse(JSON.stringify(encoded))).toEqual({
      ...activityBody,
      members: [
        activityBody.members[0],
        { id: "49699333", login: "dependabot[bot]", type: "Bot" },
      ],
    });
  });
});
