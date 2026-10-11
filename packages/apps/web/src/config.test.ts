import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when the session API URL is missing", () => {
    vi.stubEnv("VITE_YAGURA_SESSION_API", "");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_API_MOCK", "");

    expect(() => loadConfig()).toThrow("VITE_YAGURA_SESSION_API");
  });

  it("throws when the client id is missing outside mock mode", () => {
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "");
    vi.stubEnv("VITE_API_MOCK", "");

    expect(() => loadConfig()).toThrow("VITE_GITHUB_CLIENT_ID");
  });

  it("accepts a missing client id in mock mode", () => {
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "");
    vi.stubEnv("VITE_API_MOCK", "1");

    expect(loadConfig()).toEqual({
      githubClientId: "",
      sessionApiBaseUrl: "https://api.example.com",
      apiMock: true,
    });
  });

  it("reads every variable", () => {
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_API_MOCK", "");

    expect(loadConfig()).toEqual({
      githubClientId: "client-id",
      sessionApiBaseUrl: "https://api.example.com",
      apiMock: false,
    });
  });
});
