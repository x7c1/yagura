import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";
import { contentSecurityPolicyPlugin } from "./content-security-policy.ts";

export default defineConfig(({ mode }) => {
  // The empty prefix loads variables without the VITE_ prefix too. Those are
  // for the dev server only and never reach the app or a build.
  const env = loadEnv(mode, process.cwd(), "");
  const sessionApiProxy = env.YAGURA_SESSION_API_PROXY;

  return {
    plugins: [
      react(),
      // Each build allows the session API it is built for. See
      // docs/guides/deployment.md.
      contentSecurityPolicyPlugin({
        sessionApi: env.VITE_YAGURA_SESSION_API ?? "",
        apiMock: env.VITE_API_MOCK === "1",
      }),
    ],
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
      // The CSS modules' rules are added to the test document, so that a
      // test can read a computed style, such as whether a box scrolls.
      css: { include: /\.module\.css$/ },
    },
  };
});
