import { describe, expect, it } from "vitest";

import { createExecutionCostObservation } from "@/execution/observations";

const HASH = "a".repeat(64);

describe("execution cost observations", () => {
  it("accepts an exact positive final cost with complete provenance", () => {
    expect(
      createExecutionCostObservation({
        kind: "final",
        networkCostMicros: 90,
        setupCostMicros: 10,
        totalCostMicros: 100,
        chargedAssetId: "polygon:MATIC",
        chargedAtomic: "5000",
        valuationPolicyVersion: "matic-usd-v1",
        receiptId: "receipt-1",
        finalityRevision: "polygon-finality-v1",
        evidenceHash: HASH,
      }),
    ).toMatchObject({ kind: "final", totalCostMicros: 100 });
  });

  it("rejects arithmetic mismatch and incomplete positive-cost provenance", () => {
    const valid = {
      kind: "final" as const,
      networkCostMicros: 90,
      setupCostMicros: 10,
      totalCostMicros: 100,
      chargedAssetId: "polygon:MATIC",
      chargedAtomic: "5000" as const,
      valuationPolicyVersion: "matic-usd-v1",
      receiptId: "receipt-1",
      finalityRevision: "polygon-finality-v1",
      evidenceHash: HASH,
    };
    expect(() =>
      createExecutionCostObservation({ ...valid, totalCostMicros: 99 }),
    ).toThrow(/sum/i);
    for (const mutation of [
      { chargedAssetId: null },
      { chargedAtomic: null },
      { valuationPolicyVersion: null },
      { receiptId: null },
    ]) {
      expect(() =>
        createExecutionCostObservation({ ...valid, ...mutation }),
      ).toThrow(/positive/i);
    }
  });

  it("accepts a proven zero without inventing a charged asset", () => {
    expect(
      createExecutionCostObservation({
        kind: "final",
        networkCostMicros: 0,
        setupCostMicros: 0,
        totalCostMicros: 0,
        chargedAssetId: null,
        chargedAtomic: null,
        valuationPolicyVersion: null,
        receiptId: null,
        finalityRevision: "offchain-rejection-v1",
        evidenceHash: HASH,
      }),
    ).toMatchObject({ kind: "final", totalCostMicros: 0 });
  });

  it("retains the full unknown reservation and validates optional evidence", () => {
    expect(
      createExecutionCostObservation({
        kind: "unknown",
        heldReservedCostMicros: 50_000,
        evidenceHash: null,
      }),
    ).toEqual({
      kind: "unknown",
      heldReservedCostMicros: 50_000,
      evidenceHash: null,
    });
    expect(() =>
      createExecutionCostObservation({
        kind: "unknown",
        heldReservedCostMicros: -1,
        evidenceHash: null,
      }),
    ).toThrow(/nonnegative/i);
    expect(() =>
      createExecutionCostObservation({
        kind: "unknown",
        heldReservedCostMicros: 1,
        evidenceHash: "bad",
      }),
    ).toThrow(/SHA-256/i);
  });
});
