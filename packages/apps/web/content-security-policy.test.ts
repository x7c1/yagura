import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import indexHtml from "./index.html?raw";
import {
  addContentSecurityPolicy,
  contentSecurityPolicy,
  contentSecurityPolicyPlugin,
} from "./content-security-policy.ts";

const production = {
  sessionApi: "https://api.yagura.module.codes",
  apiMock: false,
};

/**
 * The hash source of the early theme script, computed here from the script
 * as the browser reads it rather than with the code under test.
 */
function themeScriptHash(): string {
  const page = new DOMParser().parseFromString(indexHtml, "text/html");
  const scripts = [...page.querySelectorAll("script:not([src])")];
  expect(scripts).toHaveLength(1);
  const digest = createHash("sha256")
    .update(scripts[0]?.textContent ?? "", "utf8")
    .digest("base64");
  return `'sha256-${digest}'`;
}

/** The policy's directives, by name, each with its sources. */
function directives(policy: string): Map<string, string[]> {
  return new Map(
    policy.split(";").map((directive) => {
      const [name = "", ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    }),
  );
}

describe("the production Content Security Policy", () => {
  it("allows exactly what the page needs", () => {
    expect(contentSecurityPolicy(indexHtml, production)).toBe(
      [
        "default-src 'none'",
        `script-src 'self' ${themeScriptHash()}`,
        "style-src 'self'",
        "img-src 'self' https://avatars.githubusercontent.com",
        "connect-src https://api.github.com https://api.yagura.module.codes",
        "font-src 'self'",
        "base-uri 'none'",
        "form-action 'none'",
        "object-src 'none'",
      ].join("; "),
    );
  });

  it("allows no inline code, no eval, and no wildcard or bare scheme", () => {
    const sources = [
      ...directives(contentSecurityPolicy(indexHtml, production)).values(),
    ].flat();
    expect(sources).not.toContain("'unsafe-inline'");
    expect(sources).not.toContain("'unsafe-eval'");
    expect(sources.filter((source) => source.includes("*"))).toEqual([]);
    expect(sources.filter((source) => /^[a-z-]+:$/.test(source))).toEqual([]);
  });

  it("allows only the origin of the session API it is built for", () => {
    const policy = contentSecurityPolicy(indexHtml, {
      sessionApi: "https://session.example.test:8443/base/",
      apiMock: false,
    });
    expect(directives(policy).get("connect-src")).toEqual([
      "https://api.github.com",
      "https://session.example.test:8443",
    ]);
  });

  it("allows no session API when the build has none", () => {
    const policy = contentSecurityPolicy(indexHtml, {
      sessionApi: "",
      apiMock: false,
    });
    expect(directives(policy).get("connect-src")).toEqual([
      "https://api.github.com",
    ]);
  });

  it("follows the theme script when the script changes", () => {
    const edited = indexHtml.replace("yagura.theme", "yagura.other");
    expect(contentSecurityPolicy(edited, production)).not.toBe(
      contentSecurityPolicy(indexHtml, production),
    );
  });
});

describe("a build with VITE_API_MOCK=1", () => {
  it("also allows the mock worker and the mocks' inline avatars", () => {
    const policy = directives(
      contentSecurityPolicy(indexHtml, { ...production, apiMock: true }),
    );
    expect(policy.get("worker-src")).toEqual(["'self'"]);
    expect(policy.get("img-src")).toEqual([
      "'self'",
      "https://avatars.githubusercontent.com",
      "data:",
    ]);
  });
});

describe("addContentSecurityPolicy", () => {
  it("puts the policy in a meta element ahead of every script", () => {
    const html = addContentSecurityPolicy(indexHtml, production);
    const page = new DOMParser().parseFromString(html, "text/html");
    const head = [...page.head.children];
    const meta = page.head.querySelector(
      'meta[http-equiv="Content-Security-Policy"]',
    );
    expect(meta?.getAttribute("content")).toBe(
      contentSecurityPolicy(indexHtml, production),
    );
    const firstScript = head.findIndex(
      (element) => element.tagName === "SCRIPT",
    );
    expect(head.indexOf(meta as Element)).toBeLessThan(firstScript);
  });

  it("applies to builds only, leaving the dev server without a policy", () => {
    expect(contentSecurityPolicyPlugin(production).apply).toBe("build");
  });
});
