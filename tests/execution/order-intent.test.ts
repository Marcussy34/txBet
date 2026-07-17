import { describe, expect, it } from "vitest";

import { createExactShares, venueQuantity } from "@/core/live-money";
import { createLiveOrderIntent } from "@/execution/order-intent";

const HASH = "a".repeat(64);

function baseIntent() {
  const quantity = venueQuantity("1000000", 6);
  return {
    contractVersionId: "contract-v1",
    settlementSpecVersionId: "settlement-v1",
    desiredOutcome: "YES" as const,
    acquisitionPath: {
      kind: "direct-buy" as const,
      orderSide: "BUY" as const,
      orderOutcome: "YES" as const,
    },
    exactNetShares: createExactShares("1", "1"),
    grossVenueQuantity: quantity,
    minimumNetVenueQuantity: quantity,
    maximumNetVenueQuantity: quantity,
    netOutcomeBoundsHash: HASH,
    feeScheduleVersion: "fee-v1",
    limitPriceMicros: 500_000,
    maxSpendMicros: 500_000,
    expiresAt: 2_000_000_000_000,
  };
}

describe("live order intent invariants", () => {
  it("binds a direct buy to the desired outcome", () => {
    expect(createLiveOrderIntent(baseIntent())).toMatchObject({
      desiredOutcome: "YES",
      acquisitionPath: {
        kind: "direct-buy",
        orderSide: "BUY",
        orderOutcome: "YES",
      },
    });

    for (const acquisitionPath of [
      { kind: "direct-buy", orderSide: "SELL", orderOutcome: "YES" },
      { kind: "direct-buy", orderSide: "BUY", orderOutcome: "NO" },
    ]) {
      expect(() =>
        createLiveOrderIntent({ ...baseIntent(), acquisitionPath } as never),
      ).toThrow(/direct buy/i);
    }
  });

  it("binds a complete-set sale to the complement and exact inventory fence", () => {
    const intent = createLiveOrderIntent({
      ...baseIntent(),
      acquisitionPath: {
        kind: "complete-set-sell-complement" as const,
        orderSide: "SELL" as const,
        orderOutcome: "NO" as const,
        inventoryLotId: "inventory-lot-1",
        inventoryLotVersion: 2,
        inventoryReservationFence: 7,
        inventoryEvidenceHash: HASH,
      },
    });
    expect(intent.acquisitionPath.kind).toBe("complete-set-sell-complement");

    for (const mutation of [
      { orderSide: "BUY" },
      { orderOutcome: "YES" },
      { inventoryLotId: "" },
      { inventoryLotVersion: 0 },
      { inventoryReservationFence: 0 },
      { inventoryEvidenceHash: "not-a-hash" },
    ]) {
      expect(() =>
        createLiveOrderIntent({
          ...baseIntent(),
          acquisitionPath: {
            kind: "complete-set-sell-complement",
            orderSide: "SELL",
            orderOutcome: "NO",
            inventoryLotId: "inventory-lot-1",
            inventoryLotVersion: 2,
            inventoryReservationFence: 7,
            inventoryEvidenceHash: HASH,
            ...mutation,
          },
        } as never),
      ).toThrow(/complete-set|inventory/i);
    }
  });

  it("requires both live net bounds to equal the canonical hedge quantity", () => {
    expect(() =>
      createLiveOrderIntent({
        ...baseIntent(),
        minimumNetVenueQuantity: venueQuantity("999999", 6),
      }),
    ).toThrow(/net outcome bounds/i);
    expect(() =>
      createLiveOrderIntent({
        ...baseIntent(),
        maximumNetVenueQuantity: venueQuantity("1000001", 6),
      }),
    ).toThrow(/net outcome bounds/i);
  });

  it("rejects invalid money, expiry, evidence, and identifiers", () => {
    for (const mutation of [
      { contractVersionId: "" },
      { limitPriceMicros: 1_000_001 },
      { maxSpendMicros: -1 },
      { expiresAt: 1.5 },
      { netOutcomeBoundsHash: "bad" },
      { feeScheduleVersion: "" },
    ]) {
      expect(() => createLiveOrderIntent({ ...baseIntent(), ...mutation })).toThrow();
    }
  });
});
