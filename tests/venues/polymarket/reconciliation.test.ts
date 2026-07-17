import { describe, expect, it, vi } from "vitest";

import {
  classifyPolymarketOrderState,
  classifyPolymarketTradeState,
  submitPolymarketOrderOnce,
} from "@/venues/polymarket/reconciliation";

const HASH = "a".repeat(64);

describe("Polymarket submit-once and sports reconciliation", () => {
  it("treats accepted live, delayed, and matched responses as nonterminal acknowledgements", async () => {
    for (const status of ["live", "delayed", "matched"] as const) {
      const post = vi.fn(async () => ({
        ok: true as const,
        orderId: `order-${status}`,
        status,
        makingAmount: "1.25",
        takingAmount: "0.4875",
        tradeIds: status === "matched" ? ["trade-1"] : [],
        transactionsHashes: [],
      }));
      const result = await submitPolymarketOrderOnce({
        post,
        signedOrder: { safe: "test-order" },
        signedArtifactHash: HASH,
        submittedAt: 1_000,
      });

      expect(post).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        kind: "acked",
        terminal: false,
        orderId: `order-${status}`,
        status,
      });
    }
  });

  it("returns an authoritative rejection without retrying the POST", async () => {
    const post = vi.fn(async () => ({
      ok: false as const,
      code: "fok_not_filled",
      message: "not enough liquidity",
    }));

    await expect(
      submitPolymarketOrderOnce({
        post,
        signedOrder: {},
        signedArtifactHash: HASH,
        submittedAt: 1_000,
      }),
    ).resolves.toEqual({
      kind: "rejected",
      retryable: false,
      code: "fok_not_filled",
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it("normalizes timeout, disconnect, malformed response, and rate limit to unknown", async () => {
    for (const failure of [
      new Error("timeout with secret body"),
      new Error("ECONNRESET"),
      new Error("429"),
    ]) {
      const post = vi.fn(async () => Promise.reject(failure));
      const result = await submitPolymarketOrderOnce({
        post,
        signedOrder: {},
        signedArtifactHash: HASH,
        submittedAt: 1_000,
      });
      expect(result).toEqual({
        kind: "unknown",
        reason: "POLYMARKET_SUBMISSION_AMBIGUOUS",
        signedArtifactHash: HASH,
        submittedAt: 1_000,
      });
      expect(JSON.stringify(result)).not.toContain(failure.message);
      expect(post).toHaveBeenCalledTimes(1);
    }

    const malformedPost = vi.fn(async () => ({ ok: true, status: "matched" }));
    await expect(
      submitPolymarketOrderOnce({
        post: malformedPost,
        signedOrder: {},
        signedArtifactHash: HASH,
        submittedAt: 1_000,
      }),
    ).resolves.toMatchObject({ kind: "unknown" });
    expect(malformedPost).toHaveBeenCalledTimes(1);
  });

  it("does not allow cancellation while a sports order is delayed", () => {
    expect(classifyPolymarketOrderState("DELAYED")).toEqual({
      terminal: false,
      cancelable: false,
      requiresRestConfirmation: true,
    });
    expect(classifyPolymarketOrderState("MATCHED")).toEqual({
      terminal: false,
      cancelable: false,
      requiresRestConfirmation: true,
    });
    expect(classifyPolymarketOrderState("LIVE")).toEqual({
      terminal: false,
      cancelable: true,
      requiresRestConfirmation: true,
    });
  });

  it("recognizes only CONFIRMED as terminal success", () => {
    for (const status of [
      "TRADE_STATUS_MATCHED",
      "TRADE_STATUS_MATCHED_NOT_BROADCASTED",
      "TRADE_STATUS_MINED",
      "TRADE_STATUS_RETRYING",
    ] as const) {
      expect(classifyPolymarketTradeState(status)).toEqual({
        terminal: false,
        outcome: "unknown",
        requiresRestAndBalanceConfirmation: true,
      });
    }
    expect(classifyPolymarketTradeState("TRADE_STATUS_CONFIRMED")).toEqual({
      terminal: true,
      outcome: "confirmed",
      requiresRestAndBalanceConfirmation: true,
    });
    expect(classifyPolymarketTradeState("TRADE_STATUS_FAILED")).toEqual({
      terminal: true,
      outcome: "failed",
      requiresRestAndBalanceConfirmation: true,
    });
  });
});
