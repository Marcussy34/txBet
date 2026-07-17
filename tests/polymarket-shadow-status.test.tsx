/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parsePolymarketShadowStatus,
  PolymarketShadowStatus,
} from "@/components/dashboard/polymarket-shadow-status";

const candidate = {
  status: "scanned",
  venue: "polymarket",
  mode: "SHADOW_ONLY",
  executable: false,
  liveData: true,
  provenance: "polymarket-public-clob",
  verification: "PINNED_IDENTITY_LIVE_BOOK",
  liveBook: {
    side: "left",
    observedAtMs: 1_784_238_770_535,
    receivedAtMs: 1_784_238_770_585,
    bookRevision: "9".repeat(40),
    quoteEvidenceHash: "a".repeat(64),
    marketIdentityHash: "b".repeat(64),
  },
  scan: {
    status: "CANDIDATE",
    candidateHash: "c".repeat(64),
    exactShares: { numerator: "2", denominator: "1" },
    totalBookCostMicros: 1_800_000,
    nominalPayoutMicros: 2_000_000,
    grossProfitMicros: 200_000,
    grossReturnBps: 1_111,
    expiresAt: 1_784_238_775_000,
    nonExecutableReasons: ["LIVE_EXECUTION_NOT_AUTHORIZED"],
  },
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("parsePolymarketShadowStatus", () => {
  it("accepts the exact, non-executable live-book status", () => {
    const parsed = parsePolymarketShadowStatus(candidate);

    expect(parsed).toEqual(candidate);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ["an executable claim", { ...candidate, executable: true }],
    ["an unexpected field", { ...candidate, apiKey: "secret" }],
    ["a negative profit", { ...candidate, scan: { ...candidate.scan, grossProfitMicros: -1 } }],
    ["an unknown blocker", { ...candidate, scan: { ...candidate.scan, nonExecutableReasons: ["MONEY_ENABLED"] } }],
  ])("fails closed for %s", (_label, value) => {
    expect(parsePolymarketShadowStatus(value)).toBeNull();
  });
});

describe("PolymarketShadowStatus", () => {
  it("shows an explicit review-required state without implying a live scan", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status: "unconfigured",
        venue: "polymarket",
        mode: "SHADOW_ONLY",
        executable: false,
        liveData: false,
        reason: "POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<PolymarketShadowStatus />);

    expect(await screen.findByText("POLYMARKET REVIEW REQUIRED")).toBeInTheDocument();
    expect(screen.getByText(/no public book is being scanned/i)).toBeInTheDocument();
    expect(screen.getByText(/NO APPROVE · NO SIGN · NO SUBMIT · NO CANCEL/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/polymarket/world-cup-shadow",
      expect.objectContaining({ method: "GET", cache: "no-store" }),
    );
  });

  it("renders a reviewed public-book candidate only as shadow evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(candidate)));

    render(<PolymarketShadowStatus />);

    expect(await screen.findByText("POLYMARKET LIVE BOOK · SHADOW ONLY")).toBeInTheDocument();
    expect(screen.getByText("PINNED IDENTITY · PUBLIC CLOB")).toBeInTheDocument();
    expect(screen.getByText("CANDIDATE · NON-EXECUTABLE")).toBeInTheDocument();
    expect(screen.getByText("$0.20")).toBeInTheDocument();
    expect(screen.getByText("11.11%")).toBeInTheDocument();
    expect(screen.getByText(/LIVE_EXECUTION_NOT_AUTHORIZED/)).toBeInTheDocument();
  });

  it.each([
    ["a network failure", () => Promise.reject(new Error("secret upstream value"))],
    ["a malformed response", () => Promise.resolve(jsonResponse({ ...candidate, executable: true }))],
    ["an HTTP failure", () => Promise.resolve(jsonResponse({}, 503))],
  ])("fails closed after %s", async (_label, request) => {
    vi.stubGlobal("fetch", vi.fn(request));

    render(<PolymarketShadowStatus />);

    expect(await screen.findByText("POLYMARKET SHADOW UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByText(/No order action is available/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret upstream value/i)).not.toBeInTheDocument();
  });
});
