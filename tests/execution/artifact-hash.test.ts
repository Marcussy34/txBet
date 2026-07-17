import { describe, expect, it } from "vitest";

import { canonicalJson } from "@/core/canonical-json";
import {
  asLiveMicros,
  createExactShares,
  createVenueQuantity,
  equalExactShares,
} from "@/core/live-money";
import {
  createPreparedArtifact,
  createSignedArtifact,
  verifyPreparedArtifact,
  verifySignedArtifact,
} from "@/execution/artifact-hash";

const HASH_A = "a".repeat(64);

function artifactInput() {
  return {
    schemaVersion: "prepared-artifact-v1" as const,
    venue: "polymarket" as const,
    payload: { z: [true, null, "1"], a: { y: 2, x: 1 } },
    nativeSpendAtomic: "0" as const,
    expiresAt: 2_000_000_000_000,
    locatorSeed: { clientId: "entry-attempt-1" },
  };
}

function locator() {
  return {
    schemaVersion: "venue-locator-v1" as const,
    venue: "polymarket" as const,
    primaryId: "order-1",
    clientId: "entry-attempt-1",
    transactionSignature: null,
    createdAt: 1_900_000_000_000,
    expiresAt: 2_000_000_000_000,
    evidenceHash: HASH_A,
  };
}

describe("canonical execution artifacts", () => {
  it("canonicalizes object keys recursively while preserving array order", () => {
    expect(canonicalJson({ z: 1, a: { d: 4, b: 2 }, list: [3, 2, 1] })).toBe(
      '{"a":{"b":2,"d":4},"list":[3,2,1],"z":1}',
    );
    expect(canonicalJson({ b: 2, a: 1 })).toBe(canonicalJson({ a: 1, b: 2 }));
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("produces the same prepared hash for semantically identical key order", () => {
    const first = createPreparedArtifact(artifactInput());
    const second = createPreparedArtifact({
      ...artifactInput(),
      payload: { a: { x: 1, y: 2 }, z: [true, null, "1"] },
    });

    expect(first.artifactHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.artifactHash).toBe(second.artifactHash);
    expect(verifyPreparedArtifact(first)).toBe(true);
  });

  it("changes the prepared hash when any authorized field changes", () => {
    const original = createPreparedArtifact(artifactInput()).artifactHash;
    const mutations = [
      { ...artifactInput(), venue: "kalshi-dflow" as const },
      { ...artifactInput(), payload: { changed: true } },
      { ...artifactInput(), nativeSpendAtomic: "1" as const },
      { ...artifactInput(), expiresAt: null },
      { ...artifactInput(), locatorSeed: { clientId: "other" } },
    ];

    for (const mutation of mutations) {
      expect(createPreparedArtifact(mutation).artifactHash).not.toBe(original);
    }
  });

  it("hashes the signed payload separately without changing the prepared hash", () => {
    const prepared = createPreparedArtifact(artifactInput());
    const signed = createSignedArtifact(prepared, {
      signedPayload: { signature: "0xsafe-test-signature" },
      signerAddress: "0x1111111111111111111111111111111111111111",
      locator: locator(),
    });

    expect(signed.artifactHash).toBe(prepared.artifactHash);
    expect(signed.signedArtifactHash).not.toBe(prepared.artifactHash);
    expect(verifySignedArtifact(signed)).toBe(true);
    expect(
      verifySignedArtifact({
        ...signed,
        signerAddress: "0x2222222222222222222222222222222222222222",
      }),
    ).toBe(false);
  });

  it("rejects malformed or non-canonical payload values", () => {
    expect(() => canonicalJson({ amount: 1.5 })).toThrow(/integer/i);
    expect(() => canonicalJson({ amount: Number.NaN })).toThrow(/finite/i);
    expect(() => canonicalJson({ missing: undefined } as never)).toThrow(/JSON/i);
    expect(() =>
      createPreparedArtifact({ ...artifactInput(), nativeSpendAtomic: "01" as "0" }),
    ).toThrow(/atomic/i);
    expect(() =>
      createPreparedArtifact({ ...artifactInput(), expiresAt: -1 }),
    ).toThrow(/expires/i);
  });
});

describe("live integer money and quantity", () => {
  it("accepts only nonnegative safe integer microdollars", () => {
    expect(asLiveMicros(0)).toBe(0);
    expect(asLiveMicros(100_000_000)).toBe(100_000_000);
    expect(() => asLiveMicros(-1)).toThrow(/nonnegative/i);
    expect(() => asLiveMicros(1.5)).toThrow(/safe integer/i);
  });

  it("reduces positive exact-share rationals and compares by cross multiplication", () => {
    expect(createExactShares("100", "1000000")).toEqual({
      numerator: "1",
      denominator: "10000",
    });
    expect(equalExactShares(createExactShares("1", "2"), createExactShares("2", "4"))).toBe(
      true,
    );
    expect(() => createExactShares("0", "1")).toThrow(/positive/i);
    expect(() => createExactShares("1", "0")).toThrow(/denominator/i);
  });

  it("derives a venue quantity without floating-point arithmetic", () => {
    expect(createVenueQuantity("1250000", 6, HASH_A)).toEqual({
      atomic: "1250000",
      scale: 6,
      exactShares: { numerator: "5", denominator: "4" },
      conversionEvidenceHash: HASH_A,
    });
    expect(() => createVenueQuantity("1", -1, HASH_A)).toThrow(/scale/i);
  });
});
