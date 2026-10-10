import { vi } from "vitest";

type Route = (init: RequestInit | undefined) => Response;

/**
 * A fetch fake answering `"<METHOD> <url>"` routes; unknown routes fail the
 * test with a 599 so they are easy to spot.
 */
export function fakeFetch(routes: Record<string, Route>) {
  return vi.fn<typeof fetch>(async (input, init) => {
    const key = `${init?.method ?? "GET"} ${String(input)}`;
    const route = routes[key];
    return route
      ? route(init)
      : new Response(`no route for ${key}`, { status: 599 });
  });
}

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function callsTo(fetch: ReturnType<typeof fakeFetch>, key: string) {
  return fetch.mock.calls.filter(
    ([input, init]) => `${init?.method ?? "GET"} ${String(input)}` === key,
  );
}
