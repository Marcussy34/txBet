import { describe, expect, it } from "vitest";

import {
  buildSecurityHeaders,
  createRequestNonce,
} from "@/server/security/headers";

describe("security headers", () => {
  it("builds a strict nonce policy in report-only mode by default", () => {
    const nonce = createRequestNonce();
    const headers = buildSecurityHeaders(nonce, {
      enforcement: "report-only",
      development: false,
    });
    const csp = headers.get("content-security-policy-report-only");

    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(csp).toContain(`'nonce-${nonce}'`);
    expect(csp).toContain("https://auth.privy.io");
    expect(csp).toContain("https://*.rpc.privy.systems");
    expect(csp).toContain("https://api.mainnet-beta.solana.com");
    expect(csp).toContain("https://challenges.cloudflare.com");
    expect(csp).not.toMatch(/(?:^|;)\s*connect-src\s+\*(?:\s|;|$)/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(headers.has("content-security-policy")).toBe(false);
  });

  it("uses explicit enforcement and allows unsafe-eval only for development tooling", () => {
    const nonce = createRequestNonce();
    const enforced = buildSecurityHeaders(nonce, {
      enforcement: "enforce",
      development: false,
    });
    expect(enforced.get("content-security-policy")).toContain("script-src");
    expect(enforced.get("content-security-policy")).toContain(
      "upgrade-insecure-requests",
    );
    expect(enforced.has("content-security-policy-report-only")).toBe(false);

    const development = buildSecurityHeaders(nonce, {
      enforcement: "report-only",
      development: true,
    });
    expect(development.get("content-security-policy-report-only")).toContain(
      "'unsafe-eval'",
    );
  });

  it("sets the remaining browser isolation headers", () => {
    const headers = buildSecurityHeaders(createRequestNonce(), {
      enforcement: "report-only",
      development: false,
    });
    expect(headers.get("strict-transport-security")).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers.get("x-content-type-options")).toBe("nosniff");
    expect(headers.get("x-frame-options")).toBe("DENY");
    expect(headers.get("referrer-policy")).toBe("no-referrer");
    expect(headers.get("cross-origin-opener-policy")).toBe(
      "same-origin-allow-popups",
    );
    expect(headers.get("permissions-policy")).toContain("camera=()");
  });
});
