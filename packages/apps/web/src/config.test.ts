import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config";

describe("loadConfig", () => {
  // Unset unless a test sets them, whatever the local env files hold.
  beforeEach(() => {
    vi.stubEnv("VITE_API_MOCK", "");
    vi.stubEnv("VITE_YAGURA_SIGNAL_HTTP_HOST", "");
    vi.stubEnv("VITE_YAGURA_SIGNAL_REALTIME_HOST", "");
  });

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
      signalHosts: undefined,
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
      signalHosts: undefined,
    });
  });

  it("reads no signal hosts when either is missing, so that the page is not live", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_YAGURA_SIGNAL_HTTP_HOST", "events.example.com");
    vi.stubEnv("VITE_YAGURA_SIGNAL_REALTIME_HOST", "");

    expect(loadConfig().signalHosts).toBeUndefined();

    vi.stubEnv("VITE_YAGURA_SIGNAL_HTTP_HOST", "");
    vi.stubEnv("VITE_YAGURA_SIGNAL_REALTIME_HOST", "realtime.example.com");

    expect(loadConfig().signalHosts).toBeUndefined();
    warn.mockRestore();
  });

  it("warns when only one signal host is set, and not when neither is", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "client-id");

    loadConfig();
    expect(warn).not.toHaveBeenCalled();

    vi.stubEnv("VITE_YAGURA_SIGNAL_HTTP_HOST", "events.example.com");
    loadConfig();
    expect(warn).toHaveBeenCalledWith(
      "VITE_YAGURA_SIGNAL_HTTP_HOST is set but VITE_YAGURA_SIGNAL_REALTIME_HOST is not, so the page does not update live.",
    );
    warn.mockRestore();
  });

  it("reads the signal hosts", () => {
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_YAGURA_SIGNAL_HTTP_HOST", "events.example.com");
    vi.stubEnv("VITE_YAGURA_SIGNAL_REALTIME_HOST", "realtime.example.com");

    expect(loadConfig().signalHosts).toEqual({
      http: "events.example.com",
      realtime: "realtime.example.com",
    });
  });

  it("throws when a signal host carries a scheme", () => {
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_GITHUB_CLIENT_ID", "client-id");
    vi.stubEnv("VITE_YAGURA_SIGNAL_HTTP_HOST", "events.example.com");
    vi.stubEnv(
      "VITE_YAGURA_SIGNAL_REALTIME_HOST",
      "wss://realtime.example.com",
    );

    expect(() => loadConfig()).toThrow("VITE_YAGURA_SIGNAL_REALTIME_HOST");
  });

  it("reads no signal hosts in mock mode, whose API mock has no realtime endpoint", () => {
    vi.stubEnv("VITE_YAGURA_SESSION_API", "https://api.example.com");
    vi.stubEnv("VITE_API_MOCK", "1");
    vi.stubEnv("VITE_YAGURA_SIGNAL_HTTP_HOST", "events.example.com");
    vi.stubEnv("VITE_YAGURA_SIGNAL_REALTIME_HOST", "realtime.example.com");

    expect(loadConfig().signalHosts).toBeUndefined();
  });
});
