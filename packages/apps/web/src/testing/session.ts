import { GitHubApiClient } from "@yagura/github-api";
import { SessionApiClient } from "@yagura/session-api";
import { vi } from "vitest";
import { SessionController } from "../features/session";
import type { fakeFetch } from "./fake-fetch";

export const sessionApi = "http://localhost:8787";
export const redirectUri = "http://localhost:5173/callback";

/** A controller wired to the given fetch fake. */
export function testController(fetch: ReturnType<typeof fakeFetch>) {
  const navigate = vi.fn<(url: URL) => void>();
  const controller = new SessionController({
    sessionApi: new SessionApiClient({ baseUrl: sessionApi, fetch }),
    githubApi: new GitHubApiClient({ fetch }),
    clientId: "Iv1.test",
    redirectUri,
    navigate,
  });
  return { controller, navigate };
}
