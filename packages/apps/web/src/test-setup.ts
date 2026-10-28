import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./test-support";

/** A request a test started that has neither reached MSW nor settled. */
interface PendingRequest {
  readonly method: string;
  readonly url: string;
  readonly finish: () => void;
  readonly finished: Promise<void>;
}

const pending: PendingRequest[] = [];
/** The `fetch` MSW intercepts, which {@link trackingFetch} calls. */
let originalFetch: typeof fetch;

/**
 * The global `fetch`, keeping each request in {@link pending} until MSW
 * starts resolving it or it settles. MSW picks a request's handler only
 * when the request reaches its interceptor, a few turns after `fetch` is
 * called, so a request one test leaves behind would otherwise be answered
 * by the next test's mock.
 */
function trackingFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input, init);
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const entry = { method: request.method, url: request.url, finish, finished };
  pending.push(entry);
  const response = originalFetch(input, init);
  const settle = () => {
    finishPending(entry);
  };
  response.then(settle, settle);
  return response;
}

function finishPending(entry: PendingRequest) {
  const index = pending.indexOf(entry);
  if (index !== -1) {
    pending.splice(index, 1);
  }
  entry.finish();
}

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  // MSW has chosen the handlers for a request once it starts resolving it.
  server.events.on("request:start", ({ request }) => {
    const entry = pending.find(
      ({ method, url }) => method === request.method && url === request.url,
    );
    if (entry !== undefined) {
      finishPending(entry);
    }
  });
  originalFetch = globalThis.fetch;
  globalThis.fetch = trackingFetch;
});

afterEach(async () => {
  cleanup();
  // An answer may make the app start another request: wait until none is
  // left before the next test's handlers are installed.
  while (pending.length > 0) {
    await Promise.all(pending.map(({ finished }) => finished));
  }
  server.resetHandlers();
});

afterAll(() => {
  globalThis.fetch = originalFetch;
  server.close();
});
