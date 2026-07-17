import { describe, expect, it, vi } from "vitest";

import {
  createPolymarketCancellationHeaders,
  createPolymarketCancellationRequestArtifact,
  preparePolymarketCancellation,
  proveFinalZeroCancellationCost,
  submitPolymarketCancellationOnce,
} from "@/venues/polymarket/cancellation";
import type { PolymarketClobCredentials } from "@/venues/polymarket/hmac";

const NOW = 1_700_000_000_000;
const ORDER_ID = `0x${"ab".repeat(32)}`;
const HASH = "a".repeat(64);
const ADDRESS = "0x1111111111111111111111111111111111111111";
const CREDENTIALS = Object.freeze({
  apiKey: "api-key",
  secret: "c3VwZXItc2VjcmV0LWtleQ==",
  passphrase: "passphrase",
}) satisfies PolymarketClobCredentials;

function artifact() {
  return preparePolymarketCancellation({
    orderId: ORDER_ID,
    originalOrderIntentHash: HASH,
    originalSignedArtifactHash: "b".repeat(64),
    originalSubmissionKey: "submission-1",
    venueAccountRevision: "account-v1",
    preparedAtMs: NOW,
    expiresAtMs: NOW + 5_000,
  });
}

async function authenticatedRequest(timestamp = NOW / 1_000) {
  return createPolymarketCancellationRequestArtifact({
    artifact: artifact(),
    address: ADDRESS,
    credentials: CREDENTIALS,
    timestamp,
  });
}

describe("Polymarket cancellation", () => {
  it("prepares a deterministic fixed-host DELETE artifact", () => {
    const prepared = artifact();
    expect(prepared).toMatchObject({
      schemaVersion: "polymarket-cancellation-v1",
      host: "https://clob.polymarket.com",
      method: "DELETE",
      requestPath: "/order",
      orderId: ORDER_ID,
      body: `{"orderID":"${ORDER_ID}"}`,
      originalOrderIntentHash: HASH,
    });
    expect(prepared.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(artifact()).toEqual(prepared);
    expect(Object.isFrozen(prepared)).toBe(true);
  });

  it("HMAC-authenticates the exact immutable method, path, and body", async () => {
    const prepared = artifact();
    await expect(
      createPolymarketCancellationHeaders({
        artifact: prepared,
        address: ADDRESS,
        credentials: CREDENTIALS,
        timestamp: 1_700_000_000,
      }),
    ).resolves.toMatchObject({
      POLY_ADDRESS: "0x1111111111111111111111111111111111111111",
      POLY_API_KEY: "api-key",
      POLY_TIMESTAMP: "1700000000",
      POLY_PASSPHRASE: "passphrase",
      POLY_SIGNATURE: expect.stringMatching(/^[A-Za-z0-9_-]+=*$/),
    });

    await expect(
      createPolymarketCancellationHeaders({
        artifact: { ...prepared, body: "{}" },
        address: ADDRESS,
        credentials: CREDENTIALS,
        timestamp: 1_700_000_000,
      }),
    ).rejects.toThrow(/artifact hash/i);
  });

  it("persists the submit marker before the one and only DELETE", async () => {
    const calls: string[] = [];
    const requestArtifact = await authenticatedRequest();
    const send = vi.fn(async (request) => {
      calls.push("send");
      expect(request).toEqual({
        requestArtifactHash: requestArtifact.requestArtifactHash,
        authTimestamp: NOW / 1_000,
        url: "https://clob.polymarket.com/order",
        method: "DELETE",
        body: `{"orderID":"${ORDER_ID}"}`,
        headers: requestArtifact.headers,
      });
      return { canceled: [ORDER_ID], not_canceled: {} };
    });

    await expect(
      submitPolymarketCancellationOnce({
        artifact: artifact(),
        authenticatedRequest: requestArtifact,
        nowMs: NOW + 1,
        claimSubmitStarted: async (marker) => {
          calls.push("persist");
          expect(marker).toEqual({
            cancellationArtifactHash: artifact().artifactHash,
            requestArtifactHash: requestArtifact.requestArtifactHash,
            orderId: ORDER_ID,
            authTimestamp: NOW / 1_000,
            submittedAtMs: NOW + 1,
            originalSubmissionKey: "submission-1",
          });
          return "claimed";
        },
        send,
      }),
    ).resolves.toEqual({
      kind: "acked",
      terminal: false,
      orderId: ORDER_ID,
      requiresAuthoritativeReconciliation: true,
    });
    expect(calls).toEqual(["persist", "send"]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("does not issue a second DELETE after a persisted marker is recovered", async () => {
    const send = vi.fn();

    await expect(
      submitPolymarketCancellationOnce({
        artifact: artifact(),
        authenticatedRequest: await authenticatedRequest(),
        nowMs: NOW + 1,
        claimSubmitStarted: async () => "already_started",
        send,
      }),
    ).resolves.toEqual({
      kind: "unknown",
      terminal: false,
      orderId: ORDER_ID,
      artifactHash: artifact().artifactHash,
      reason: "POLYMARKET_CANCELLATION_AMBIGUOUS",
      requiresAuthoritativeReconciliation: true,
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send when the durable marker fails", async () => {
    const send = vi.fn();
    await expect(
      submitPolymarketCancellationOnce({
        artifact: artifact(),
        authenticatedRequest: await authenticatedRequest(),
        nowMs: NOW + 1,
        claimSubmitStarted: async () => {
          throw new Error("database unavailable");
        },
        send,
      }),
    ).resolves.toMatchObject({
      kind: "unknown",
      reason: "POLYMARKET_CANCELLATION_AMBIGUOUS",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { name: "timeout", response: new Error("upstream sensitive body") },
    { name: "malformed", response: { canceled: "wrong", not_canceled: {} } },
    { name: "not canceled", response: { canceled: [], not_canceled: { [ORDER_ID]: "filled" } } },
    { name: "contradictory", response: { canceled: [ORDER_ID], not_canceled: { [ORDER_ID]: "filled" } } },
  ])("returns non-retryable unknown after $name", async ({ response }) => {
    const send = vi.fn(async () => {
      if (response instanceof Error) throw response;
      return response;
    });
    const result = await submitPolymarketCancellationOnce({
      artifact: artifact(),
      authenticatedRequest: await authenticatedRequest(),
      nowMs: NOW + 1,
      claimSubmitStarted: async () => "claimed",
      send,
    });

    expect(result).toEqual({
      kind: "unknown",
      terminal: false,
      orderId: ORDER_ID,
      artifactHash: artifact().artifactHash,
      reason: "POLYMARKET_CANCELLATION_AMBIGUOUS",
      requiresAuthoritativeReconciliation: true,
    });
    expect(JSON.stringify(result)).not.toContain("sensitive");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("refuses expired or tampered artifacts before persistence", async () => {
    const claimSubmitStarted = vi.fn();
    const send = vi.fn();
    await expect(
      submitPolymarketCancellationOnce({
        artifact: artifact(),
        authenticatedRequest: await authenticatedRequest(),
        nowMs: NOW + 5_000,
        claimSubmitStarted,
        send,
      }),
    ).rejects.toThrow(/expired/i);
    await expect(
      submitPolymarketCancellationOnce({
        artifact: { ...artifact(), artifactHash: "c".repeat(64) },
        authenticatedRequest: await authenticatedRequest(),
        nowMs: NOW + 1,
        claimSubmitStarted,
        send,
      }),
    ).rejects.toThrow(/artifact hash/i);
    expect(claimSubmitStarted).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("binds every transmitted header and Content-Type into the persisted request hash", async () => {
    const requestArtifact = await authenticatedRequest();
    expect(requestArtifact.headers).toEqual({
      POLY_ADDRESS: ADDRESS,
      POLY_SIGNATURE: expect.stringMatching(/^[A-Za-z0-9_-]+=*$/),
      POLY_TIMESTAMP: String(NOW / 1_000),
      POLY_API_KEY: CREDENTIALS.apiKey,
      POLY_PASSPHRASE: CREDENTIALS.passphrase,
      "Content-Type": "application/json",
    });
    expect(Object.isFrozen(requestArtifact)).toBe(true);
    expect(Object.isFrozen(requestArtifact.headers)).toBe(true);

    const claimSubmitStarted = vi.fn(async () => "claimed" as const);
    const send = vi.fn(async () => ({ canceled: [ORDER_ID], not_canceled: {} }));
    const tampered = {
      ...requestArtifact,
      headers: { ...requestArtifact.headers, "Content-Type": "text/plain" },
    };

    await expect(
      submitPolymarketCancellationOnce({
        artifact: artifact(),
        authenticatedRequest: tampered as unknown as typeof requestArtifact,
        nowMs: NOW + 1,
        claimSubmitStarted,
        send,
      }),
    ).rejects.toThrow(/authenticated request/i);
    expect(claimSubmitStarted).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    { name: "stale", timestamp: NOW / 1_000 - 31 },
    { name: "future", timestamp: NOW / 1_000 + 1 },
  ])("rejects a $name HMAC timestamp before the atomic claim", async ({ timestamp }) => {
    const claimSubmitStarted = vi.fn();
    const send = vi.fn();

    await expect(
      submitPolymarketCancellationOnce({
        artifact: artifact(),
        authenticatedRequest: await authenticatedRequest(timestamp),
        nowMs: NOW + 1,
        claimSubmitStarted,
        send,
      }),
    ).rejects.toThrow(/timestamp/i);
    expect(claimSubmitStarted).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("proves zero cancellation cost only from exact authoritative terminal evidence", () => {
    expect(
      proveFinalZeroCancellationCost({
        orderId: ORDER_ID,
        status: "CANCELED",
        terminal: true,
        observedAtMs: NOW,
        finalityRevision: "rest-order-v3",
        evidenceHash: HASH,
      }),
    ).toEqual({
      kind: "final",
      networkCostMicros: 0,
      setupCostMicros: 0,
      totalCostMicros: 0,
      chargedAssetId: null,
      chargedAtomic: null,
      valuationPolicyVersion: null,
      receiptId: null,
      finalityRevision: "rest-order-v3",
      evidenceHash: HASH,
    });
    expect(() =>
      proveFinalZeroCancellationCost({
        orderId: ORDER_ID,
        status: "LIVE",
        terminal: false,
        observedAtMs: NOW,
        finalityRevision: "rest-order-v3",
        evidenceHash: HASH,
      }),
    ).toThrow(/terminal/i);
  });
});
