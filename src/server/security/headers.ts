import { Buffer } from "node:buffer";

export type CspEnforcement = "report-only" | "enforce";

export interface SecurityHeaderOptions {
  readonly enforcement: CspEnforcement;
  readonly development: boolean;
}

export function createRequestNonce(): string {
  return Buffer.from(globalThis.crypto.randomUUID()).toString("base64");
}

function contentSecurityPolicy(
  nonce: string,
  development: boolean,
  enforcement: CspEnforcement,
): string {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(nonce)) {
    throw new Error("CSP nonce must be base64");
  }
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://challenges.cloudflare.com${development ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' blob: data: https://auth.privy.io",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "child-src https://auth.privy.io https://challenges.cloudflare.com",
    "frame-src https://auth.privy.io https://challenges.cloudflare.com",
    "connect-src 'self' https://auth.privy.io https://*.rpc.privy.systems https://api.mainnet-beta.solana.com",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    ...(!development && enforcement === "enforce"
      ? ["upgrade-insecure-requests"]
      : []),
  ];
  return `${directives.join("; ")};`;
}

/** Explicit sources only; Privy's documented RPC wildcard is required for embedded wallets. */
export function buildSecurityHeaders(
  nonce: string,
  options: SecurityHeaderOptions,
): Headers {
  const headers = new Headers();
  const cspName =
    options.enforcement === "enforce"
      ? "content-security-policy"
      : "content-security-policy-report-only";
  headers.set(
    cspName,
    contentSecurityPolicy(nonce, options.development, options.enforcement),
  );
  headers.set(
    "strict-transport-security",
    "max-age=63072000; includeSubDomains; preload",
  );
  headers.set("x-content-type-options", "nosniff");
  headers.set("x-frame-options", "DENY");
  headers.set("referrer-policy", "no-referrer");
  headers.set("cross-origin-opener-policy", "same-origin-allow-popups");
  headers.set(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  return headers;
}
