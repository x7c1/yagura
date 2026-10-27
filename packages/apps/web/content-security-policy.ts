import { createHash } from "node:crypto";
import type { Plugin } from "vite";

/** What the policy of a build depends on. */
export interface PolicyOptions {
  /**
   * The Yagura API's base URL (`VITE_YAGURA_SESSION_API`), which serves the
   * session API and the activity API. Only its origin is allowed. Empty
   * when the variable is not set, in which case the app refuses to start
   * anyway, so nothing is allowed to be called.
   */
  readonly sessionApi: string;
  /**
   * Whether the build serves the APIs from Mock Service Worker
   * (`VITE_API_MOCK=1`). Such a build is for development only, and is the one
   * build allowed to register the worker and to draw the mocks' inline
   * avatars.
   */
  readonly apiMock: boolean;
  /**
   * The AppSync Events API's realtime host
   * (`VITE_YAGURA_SIGNAL_REALTIME_HOST`), which the page connects to for
   * live updates, or empty. It is allowed only along with its HTTP host
   * (`signalHttpHost`), and not in mock mode, since the page connects only
   * when both are set, outside mock mode.
   */
  readonly signalRealtimeHost?: string;
  /** The AppSync Events API's HTTP host (`VITE_YAGURA_SIGNAL_HTTP_HOST`). */
  readonly signalHttpHost?: string;
}

/** The host GitHub serves user and organization avatars from. */
const githubAvatars = "https://avatars.githubusercontent.com";

/** A `<script>` element, capturing its attributes and its text. */
const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

/** The charset declaration the policy is placed right after. */
const charsetPattern = /<meta\s+charset=[^>]*>/i;

/**
 * The `'sha256-…'` sources of the inline scripts in `html`, computed from
 * each script's exact text, so that editing a script changes its hash with
 * it rather than leaving the policy to refuse it.
 */
export function inlineScriptHashes(html: string): string[] {
  return [...html.matchAll(scriptPattern)]
    .filter(([, attributes]) => !/\bsrc\s*=/i.test(attributes ?? ""))
    .map(([, , text]) => {
      const digest = createHash("sha256")
        .update(text ?? "", "utf8")
        .digest("base64");
      return `'sha256-${digest}'`;
    });
}

/**
 * The Content Security Policy for a build of `html`: the page may load its
 * own scripts and styles, the inline scripts `html` carries, GitHub's
 * avatars, call the Yagura API and connect to the realtime host of the
 * signals when it is set, and nothing else.
 */
export function contentSecurityPolicy(
  html: string,
  options: PolicyOptions,
): string {
  const sessionApiOrigin = options.sessionApi
    ? new URL(options.sessionApi).origin
    : undefined;
  const { signalRealtimeHost, signalHttpHost } = options;
  if (
    signalRealtimeHost &&
    !/^[A-Za-z0-9.-]+(:\d+)?$/.test(signalRealtimeHost)
  ) {
    throw new Error(
      `VITE_YAGURA_SIGNAL_REALTIME_HOST is not a plain host name: ${signalRealtimeHost}`,
    );
  }
  const signals =
    signalRealtimeHost && signalHttpHost && !options.apiMock
      ? [`wss://${signalRealtimeHost}`]
      : [];
  const connect = [...(sessionApiOrigin ? [sessionApiOrigin] : []), ...signals];
  const directives: [string, ...string[]][] = [
    ["default-src", "'none'"],
    ["script-src", "'self'", ...inlineScriptHashes(html)],
    ["style-src", "'self'"],
    // The mocks draw the organizations' avatars as data URLs, and answer
    // for GitHub's avatar host themselves, so that mock mode loads nothing
    // from the network.
    ["img-src", "'self'", githubAvatars, ...(options.apiMock ? ["data:"] : [])],
    ["connect-src", ...(connect.length > 0 ? connect : ["'none'"])],
    ["font-src", "'self'"],
    ...(options.apiMock ? [["worker-src", "'self'"] as [string, string]] : []),
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
    ["object-src", "'none'"],
  ];
  return directives.map((directive) => directive.join(" ")).join("; ");
}

/**
 * Returns `html` with the policy in a `<meta http-equiv>` placed right after
 * the charset declaration, ahead of every script, since the policy applies
 * only to what comes after it in the document.
 */
export function addContentSecurityPolicy(
  html: string,
  options: PolicyOptions,
): string {
  const charset = charsetPattern.exec(html);
  if (!charset) {
    throw new Error(
      "index.html has no <meta charset> to place the policy after",
    );
  }
  const end = charset.index + charset[0].length;
  const meta =
    `<meta http-equiv="Content-Security-Policy" ` +
    `content="${contentSecurityPolicy(html, options)}" />`;
  return `${html.slice(0, end)}\n    ${meta}${html.slice(end)}`;
}

/**
 * Delivers the policy in the built `index.html`, since GitHub Pages cannot
 * send it as a header. It applies to builds only: the dev server injects
 * scripts and styles of its own and reloads over a WebSocket, and carries no
 * policy rather than a relaxed one that a build could inherit. It runs after
 * Vite's own transforms, so that it hashes the inline scripts as they are
 * served.
 */
export function contentSecurityPolicyPlugin(options: PolicyOptions): Plugin {
  return {
    name: "yagura:content-security-policy",
    apply: "build",
    transformIndexHtml: {
      order: "post",
      handler: (html) => addContentSecurityPolicy(html, options),
    },
  };
}
