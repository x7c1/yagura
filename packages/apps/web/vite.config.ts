import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // The empty prefix loads variables without the VITE_ prefix too. Those are
  // for the dev server only and never reach the app or a build.
  const env = loadEnv(mode, process.cwd(), "");
  const sessionApiProxy = env.YAGURA_SESSION_API_PROXY;

  return {
    plugins: [react()],
    server: {
      // The GitHub App's callback URL is fixed to this port, so never fall
      // back to another one.
      port: 5173,
      strictPort: true,
      // The refresh token cookie is SameSite=Lax, so the browser sends it only
      // to a same-site session API. Proxying /session keeps the API on this
      // origin. changeOrigin rewrites only the Host header; the Origin header
      // the API checks is left as the browser sent it.
      proxy: sessionApiProxy
        ? { "/session": { target: sessionApiProxy, changeOrigin: true } }
        : undefined,
    },
    test: {
      environment: "jsdom",
      setupFiles: ["./src/test-setup.ts"],
    },
  };
});
