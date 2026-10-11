import { describe, expect, it } from "vitest";
import {
  base64UrlEncode,
  deriveCodeChallenge,
  generateCodeVerifier,
} from "./pkce";

describe("PKCE", () => {
  it("derives the S256 challenge of the RFC 7636 example verifier", async () => {
    // RFC 7636, Appendix B.
    await expect(
      deriveCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).resolves.toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("generates verifiers in the allowed alphabet and length", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
    expect(generateCodeVerifier()).not.toBe(verifier);
  });

  it("encodes base64url without padding", () => {
    expect(base64UrlEncode(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });
});
