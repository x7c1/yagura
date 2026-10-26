import { ActivityApiError } from "@yagura/activity-api";
import { SessionApiError } from "@yagura/session-api";
import { describe, expect, it } from "vitest";
import { classifyLoadFailure } from "./load-failure";

describe("classifyLoadFailure", () => {
  it.each([
    [
      "an activity API request without a response",
      new ActivityApiError(0, "network_error"),
      "offline",
    ],
    [
      "a session API request without a response",
      new SessionApiError(0, "network_error"),
      "offline",
    ],
    [
      "an organization the viewer cannot use",
      new ActivityApiError(403, "forbidden"),
      "denied",
    ],
    ["a 404", new ActivityApiError(404, "not_found"), "denied"],
    [
      "a 502 from the activity API",
      new ActivityApiError(502, "upstream_error"),
      "unavailable",
    ],
    [
      "a 500 from the activity API",
      new ActivityApiError(500, "internal_error"),
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
