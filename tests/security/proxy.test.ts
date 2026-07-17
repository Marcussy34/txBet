import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

describe("Next.js security proxy", () => {
  it("adds a fresh nonce to upstream request and response headers", () => {
    const first = proxy(new NextRequest("https://txbet.example/dashboard"));
    const second = proxy(new NextRequest("https://txbet.example/dashboard"));
    const firstPolicy = first.headers.get("content-security-policy-report-only") ?? "";
    const secondPolicy = second.headers.get("content-security-policy-report-only") ?? "";
    const firstNonce = /'nonce-([^']+)'/.exec(firstPolicy)?.[1];
    const secondNonce = /'nonce-([^']+)'/.exec(secondPolicy)?.[1];

    expect(firstNonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(secondNonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(firstNonce).not.toBe(secondNonce);
    expect(firstPolicy).toContain(`'nonce-${firstNonce}'`);
  });

  it("does not redirect or treat proxy navigation as authorization", () => {
    const response = proxy(new NextRequest("https://txbet.example/dashboard"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
