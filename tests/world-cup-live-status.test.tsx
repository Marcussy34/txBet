/** @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  parseWorldCupStatus,
  WorldCupLiveStatus,
} from "@/components/dashboard/world-cup-live-status";

const liveStatus = {
  status: "live",
  provenance: "txline-mainnet-rest",
  verification: "LIVE_UNVERIFIED",
  fixtureId: "12345",
  competitionId: "678",
  action: "GOAL",
  gameState: "IN_PLAY",
  observedAtMs: 1_750_000_000_000,
  sequence: 42,
  confirmed: true,
  ageMs: 12_500,
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

describe("parseWorldCupStatus", () => {
  it("accepts and freezes an exact live REST observation", () => {
    const parsed = parseWorldCupStatus(liveStatus);

    expect(parsed).toEqual(liveStatus);
    expect(Object.isFrozen(parsed)).toBe(true);
  });

  it.each([
    ["an unexpected field", { ...liveStatus, solanaVerified: true }],
    ["a forged verification tag", { ...liveStatus, verification: "VERIFIED" }],
    ["a negative age", { ...liveStatus, ageMs: -1 }],
    ["a stale observation", { ...liveStatus, ageMs: 30_001 }],
    ["an unconfirmed live observation", { ...liveStatus, confirmed: false }],
    ["a fractional sequence", { ...liveStatus, sequence: 1.5 }],
    ["control characters", { ...liveStatus, action: "GOAL\nFORGED" }],
    [
      "a mismatched unavailable reason",
      {
        status: "unavailable",
        provenance: "txline-mainnet-rest",
        verification: "LIVE_UNVERIFIED",
        reason: "TXLINE_MVP_NOT_CONFIGURED",
      },
    ],
  ])("fails closed for %s", (_label, payload) => {
    expect(parseWorldCupStatus(payload)).toBeNull();
  });
});

describe("WorldCupLiveStatus", () => {
  it("shows an honest deterministic-replay state when TxLINE is unconfigured", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        status: "unconfigured",
        provenance: "deterministic-replay",
        verification: "REPLAY_NOT_LIVE",
        reason: "TXLINE_MVP_NOT_CONFIGURED",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<WorldCupLiveStatus />);

    expect(await screen.findByText("DETERMINISTIC REPLAY")).toBeInTheDocument();
    expect(screen.getByText(/TxLINE not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/REPLAY-ONLY STRATEGY/i)).toBeInTheDocument();
    expect(screen.getByText(/SIMULATED EXECUTION/i)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/world-cup",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
      }),
    );
  });

  it.each([
    ["a network failure", () => Promise.reject(new Error("secret upstream error"))],
    ["malformed JSON", () => Promise.resolve(jsonResponse({ ...liveStatus, extra: true }))],
    ["a non-success response", () => Promise.resolve(jsonResponse({}, 503))],
  ])("uses the disclosed replay fallback after %s", async (_label, request) => {
    vi.stubGlobal("fetch", vi.fn(request));

    render(<WorldCupLiveStatus />);

    expect(await screen.findByText("LIVE DATA UNAVAILABLE")).toBeInTheDocument();
    expect(screen.getByText(/Replay fallback remains active/i)).toBeInTheDocument();
    expect(screen.getByText(/SIMULATED EXECUTION/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret upstream error/i)).not.toBeInTheDocument();
  });

  it("labels live REST data as unverified and renders its bounded facts", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(liveStatus)));

    render(<WorldCupLiveStatus />);

    expect(await screen.findByText("TXLINE LIVE · UNVERIFIED")).toBeInTheDocument();
    expect(screen.getByText("GOAL")).toBeInTheDocument();
    expect(screen.getByText("IN_PLAY")).toBeInTheDocument();
    expect(screen.getByText("12s old")).toBeInTheDocument();
    expect(screen.getByText("Sequence 42")).toBeInTheDocument();
    expect(screen.getByText(/not Solana\/on-chain verified/i)).toBeInTheDocument();
    expect(screen.getByText(/REPLAY-ONLY STRATEGY/i)).toBeInTheDocument();
    expect(screen.getByText(/SIMULATED EXECUTION/i)).toBeInTheDocument();
  });
});
