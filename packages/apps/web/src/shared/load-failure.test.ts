import { GitHubApiError } from "@yagura/github-api";
import { SessionApiError } from "@yagura/session-api";
import { describe, expect, it } from "vitest";
import { classifyLoadFailure } from "./load-failure";

describe("classifyLoadFailure", () => {
  it.each([
    [
      "a GitHub request without a response",
      new GitHubApiError(0, "GitHub API could not be reached: POST /graphql"),
      "offline",
    ],
    [
      "a session API request without a response",
      new SessionApiError(0, "network_error"),
      "offline",
    ],
    [
      "a GraphQL rate limit",
      new GitHubApiError(200, "API rate limit exceeded"),
      "rate-limited",
    ],
    [
      "a 429",
      new GitHubApiError(429, "GitHub API responded 429 to POST /graphql"),
      "rate-limited",
    ],
    [
      "a REST rate limit's 403",
      new GitHubApiError(
        403,
        "GitHub API responded 403 to GET /orgs/a/members: " +
          "API rate limit exceeded for user ID 1.",
      ),
      "rate-limited",
    ],
    [
      "a 403 that is not a rate limit",
      new GitHubApiError(
        403,
        "GitHub API responded 403 to GET /orgs/a/members: " +
          "Resource not accessible by integration",
      ),
      "denied",
    ],
    [
      "a 404",
      new GitHubApiError(404, "GitHub API responded 404 to GET /orgs/a"),
      "denied",
    ],
    [
      "a 502 from GitHub",
      new GitHubApiError(502, "GitHub API responded 502 to POST /graphql"),
      "unavailable",
    ],
    [
      "a 502 from the session API",
      new SessionApiError(502, "upstream_error"),
      "unavailable",
    ],
    ["any other error", new Error("The session has ended"), "unavailable"],
  ] as const)("takes %s as %s", (_, error, failure) => {
    expect(classifyLoadFailure(error)).toBe(failure);
  });
});
