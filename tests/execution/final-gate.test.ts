import { describe, expect, it } from "vitest";

import {
  evaluateFinalEntryGate,
  type FinalEntryGateSnapshot,
  type FinalGateReason,
} from "@/execution/final-gate";

const NOW = 1_700_000_000_000;

type DeepMutable<Value> = Value extends readonly (infer Entry)[]
  ? DeepMutable<Entry>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
    : Value;

type MutableSnapshot = DeepMutable<FinalEntryGateSnapshot>;

function validSnapshot(): MutableSnapshot {
  return {
    stage: "broadcast",
    nowMs: NOW,
    maximumObservationAgeMs: 5_000,
    minimumCloseBufferMs: 60_000,
    maximumClockSkewMs: 1_000,
    bindings: {
      expected: {
        opportunityHash: "opportunity-v1",
        bundleHash: "bundle-v1",
        artifactHash: "artifact-v1",
        grantVersion: "grant-v1",
        riskVersion: "risk-v1",
        walletOwnershipRevision: "wallet-v1",
        walletAuthorityHash: "authority-v1",
        certificationVersion: "cert-v1",
        eligibilityScopeHash: "scope-v1",
        contractRevision: "contract-v1",
        ruleHash: "rule-v1",
        linkRevision: "link-v1",
        bookRevision: "book-v1",
        feeScheduleVersion: "fees-v1",
        closeTimeRevision: "close-v1",
        payoutAssetRevision: "asset-v1",
        valuePolicyVersion: "value-v1",
      },
      current: {
        opportunityHash: "opportunity-v1",
        bundleHash: "bundle-v1",
        artifactHash: "artifact-v1",
        grantVersion: "grant-v1",
        riskVersion: "risk-v1",
        walletOwnershipRevision: "wallet-v1",
        walletAuthorityHash: "authority-v1",
        certificationVersion: "cert-v1",
        eligibilityScopeHash: "scope-v1",
        contractRevision: "contract-v1",
        ruleHash: "rule-v1",
        linkRevision: "link-v1",
        bookRevision: "book-v1",
        feeScheduleVersion: "fees-v1",
        closeTimeRevision: "close-v1",
        payoutAssetRevision: "asset-v1",
        valuePolicyVersion: "value-v1",
      },
    },
    authorization: {
      grantStatus: "ACTIVE",
      grantExpiresAtMs: NOW + 60_000,
      expectedAuthorityOnly: true,
      certificationStatus: "CERTIFIED",
      certificationExpiresAtMs: NOW + 60_000,
      eligibilityStatus: "ELIGIBLE",
      eligibilityObservedAtMs: NOW - 500,
      eligibilityExpiresAtMs: NOW + 60_000,
    },
    safety: {
      entryPaused: false,
      unresolvedResidual: false,
      marketDataTrusted: true,
      marketDataFresh: true,
      independentOrderStatusFresh: true,
      independentResolutionFresh: true,
      settlementValid: true,
      targetWriteIntegrity: "trusted",
      recoveryMode: "enabled",
      recoveryPathHealthy: true,
      grantCurrent: true,
      certificationCurrent: true,
      eligibilityFresh: true,
      databaseCertain: true,
      reconciliationBacklogClear: true,
    },
    quote: {
      observedAtMs: NOW - 500,
      expiresAtMs: NOW + 5_000,
      observedChainHeight: 100,
      expiresAfterChainHeight: 110,
      currentChainHeight: 105,
      tradingClosesAtMs: NOW + 120_000,
    },
    exactness: {
      canonicalShares: { numerator: "5", denominator: "1" },
      legMinimumShares: [
        { numerator: "5", denominator: "1" },
        { numerator: "5", denominator: "1" },
      ],
      legMaximumShares: [
        { numerator: "5", denominator: "1" },
        { numerator: "5", denominator: "1" },
      ],
      scaleConversionsExact: true,
    },
    economics: {
      conservativeProfitMicros: 150_000,
      minimumProfitMicros: 100_000,
      conservativeReturnBps: 125,
      minimumReturnBps: 100,
      requiredSpendMicros: 8_000_000,
      reservedSpendMicros: 8_100_000,
      availableBalanceMicros: 10_000_000,
      gasReserveMicros: 500_000,
      requiredNetworkCostMicros: 100_000,
      networkCostObservedAtMs: NOW - 500,
      networkCostExpiresAtMs: NOW + 5_000,
    },
    inventory: {
      required: true,
      lotId: "lot-1",
      expectedLotId: "lot-1",
      lotVersion: 2,
      expectedLotVersion: 2,
      reservationFence: 7,
      expectedReservationFence: 7,
      finalized: true,
      reused: false,
      balancesMatch: true,
      costEvidenceFinal: true,
      observedAtMs: NOW - 500,
      expiresAtMs: NOW + 5_000,
    },
    artifact: {
      expiresAtMs: NOW + 5_000,
      validationPassed: true,
      signatureVerified: true,
      simulationPassed: true,
    },
    health: {
      venueHealthy: true,
      rpcHealthy: true,
      databaseHealthy: true,
      clockHealthy: true,
      clockSkewMs: 100,
      observedAtMs: NOW - 500,
    },
  };
}

function expectReason(
  mutate: (snapshot: MutableSnapshot) => void,
  reason: FinalGateReason,
): void {
  const snapshot = structuredClone(validSnapshot());
  mutate(snapshot);
  expect(evaluateFinalEntryGate(snapshot)).toMatchObject({
    ok: false,
    reasons: expect.arrayContaining([reason]),
  });
}

function setRuntimePath(root: unknown, path: string, value: unknown): void {
  const parts = path.split(".");
  const finalPart = parts.pop();
  if (finalPart === undefined) throw new Error("A runtime path is required");

  let cursor = root;
  for (const part of parts) {
    if (typeof cursor !== "object" || cursor === null) {
      throw new Error(`Cannot descend into ${path}`);
    }
    cursor = (cursor as Record<string, unknown>)[part];
  }
  if (typeof cursor !== "object" || cursor === null) {
    throw new Error(`Cannot assign ${path}`);
  }
  (cursor as Record<string, unknown>)[finalPart] = value;
}

function expectInvalidRuntimeEvidence(path: string, value: unknown): void {
  const snapshot = structuredClone(validSnapshot());
  setRuntimePath(snapshot, path, value);
  const runtimeSnapshot = snapshot as unknown as FinalEntryGateSnapshot;

  expect(() => evaluateFinalEntryGate(runtimeSnapshot)).not.toThrow();
  expect(evaluateFinalEntryGate(runtimeSnapshot)).toEqual({
    ok: false,
    reasons: ["INVALID_GATE_EVIDENCE"],
  });
}

const NUMERIC_RUNTIME_PATHS = [
  "nowMs",
  "maximumObservationAgeMs",
  "minimumCloseBufferMs",
  "maximumClockSkewMs",
  "authorization.grantExpiresAtMs",
  "authorization.certificationExpiresAtMs",
  "authorization.eligibilityObservedAtMs",
  "authorization.eligibilityExpiresAtMs",
  "quote.observedAtMs",
  "quote.expiresAtMs",
  "quote.observedChainHeight",
  "quote.expiresAfterChainHeight",
  "quote.currentChainHeight",
  "quote.tradingClosesAtMs",
  "economics.conservativeProfitMicros",
  "economics.minimumProfitMicros",
  "economics.conservativeReturnBps",
  "economics.minimumReturnBps",
  "economics.requiredSpendMicros",
  "economics.reservedSpendMicros",
  "economics.availableBalanceMicros",
  "economics.gasReserveMicros",
  "economics.requiredNetworkCostMicros",
  "economics.networkCostObservedAtMs",
  "economics.networkCostExpiresAtMs",
  "inventory.lotVersion",
  "inventory.expectedLotVersion",
  "inventory.reservationFence",
  "inventory.expectedReservationFence",
  "inventory.observedAtMs",
  "inventory.expiresAtMs",
  "artifact.expiresAtMs",
  "health.clockSkewMs",
  "health.observedAtMs",
] as const;

const INVALID_NUMBERS = [
  ["NaN", Number.NaN],
  ["positive infinity", Number.POSITIVE_INFINITY],
  ["negative infinity", Number.NEGATIVE_INFINITY],
  ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ["fractional", 0.5],
  ["negative", -1],
] as const;

const BOOLEAN_RUNTIME_PATHS = [
  "authorization.expectedAuthorityOnly",
  "safety.entryPaused",
  "safety.unresolvedResidual",
  "safety.marketDataTrusted",
  "safety.marketDataFresh",
  "safety.independentOrderStatusFresh",
  "safety.independentResolutionFresh",
  "safety.settlementValid",
  "safety.recoveryPathHealthy",
  "safety.grantCurrent",
  "safety.certificationCurrent",
  "safety.eligibilityFresh",
  "safety.databaseCertain",
  "safety.reconciliationBacklogClear",
  "exactness.scaleConversionsExact",
  "inventory.required",
  "inventory.finalized",
  "inventory.reused",
  "inventory.balancesMatch",
  "inventory.costEvidenceFinal",
  "artifact.validationPassed",
  "artifact.signatureVerified",
  "artifact.simulationPassed",
  "health.venueHealthy",
  "health.rpcHealthy",
  "health.databaseHealthy",
  "health.clockHealthy",
] as const;

const ENUM_RUNTIME_PATHS = [
  "stage",
  "authorization.grantStatus",
  "authorization.certificationStatus",
  "authorization.eligibilityStatus",
  "safety.targetWriteIntegrity",
  "safety.recoveryMode",
] as const;

describe("final live entry gate", () => {
  it("accepts only a completely fresh and exactly bound snapshot", () => {
    expect(evaluateFinalEntryGate(validSnapshot())).toEqual({
      ok: true,
      reasons: [],
    });
  });

  it.each([
    ["opportunityHash", "OPPORTUNITY_DRIFT"],
    ["bundleHash", "BUNDLE_DRIFT"],
    ["artifactHash", "ARTIFACT_DRIFT"],
    ["grantVersion", "GRANT_VERSION_DRIFT"],
    ["riskVersion", "RISK_VERSION_DRIFT"],
    ["walletOwnershipRevision", "WALLET_OWNERSHIP_DRIFT"],
    ["walletAuthorityHash", "WALLET_AUTHORITY_DRIFT"],
    ["certificationVersion", "CERTIFICATION_DRIFT"],
    ["eligibilityScopeHash", "ELIGIBILITY_SCOPE_DRIFT"],
    ["contractRevision", "CONTRACT_DRIFT"],
    ["ruleHash", "RULE_DRIFT"],
    ["linkRevision", "LINK_DRIFT"],
    ["bookRevision", "BOOK_DRIFT"],
    ["feeScheduleVersion", "FEE_DRIFT"],
    ["closeTimeRevision", "CLOSE_TIME_DRIFT"],
    ["payoutAssetRevision", "PAYOUT_ASSET_DRIFT"],
    ["valuePolicyVersion", "VALUE_POLICY_DRIFT"],
  ] as const)("rejects %s binding drift", (field, reason) => {
    expectReason((snapshot) => {
      snapshot.bindings.current[field] = "drifted";
    }, reason);
  });

  it("rejects expired/revoked authority and unexpected wallet authority", () => {
    expectReason((snapshot) => {
      snapshot.authorization.grantStatus = "REVOKED";
    }, "GRANT_NOT_ACTIVE");
    expectReason((snapshot) => {
      snapshot.authorization.grantExpiresAtMs = NOW;
    }, "GRANT_EXPIRED");
    expectReason((snapshot) => {
      snapshot.authorization.expectedAuthorityOnly = false;
    }, "UNEXPECTED_WALLET_AUTHORITY");
    expectReason((snapshot) => {
      snapshot.authorization.certificationStatus = "QUARANTINED";
    }, "CERTIFICATION_NOT_CURRENT");
    expectReason((snapshot) => {
      snapshot.authorization.eligibilityStatus = "UNKNOWN";
    }, "ELIGIBILITY_NOT_ELIGIBLE");
  });

  it("rejects stale, expired, chain-expired, or close-buffered quotes", () => {
    expectReason((snapshot) => {
      snapshot.quote.observedAtMs = NOW - 5_001;
    }, "QUOTE_STALE");
    expectReason((snapshot) => {
      snapshot.quote.expiresAtMs = NOW;
    }, "QUOTE_EXPIRED");
    expectReason((snapshot) => {
      snapshot.quote.currentChainHeight = 111;
    }, "QUOTE_CHAIN_EXPIRED");
    expectReason((snapshot) => {
      snapshot.quote.tradingClosesAtMs = NOW + 59_999;
    }, "MARKET_CLOSE_BUFFER");
  });

  it("requires equal exact net shares on both legs without rounding", () => {
    expectReason((snapshot) => {
      snapshot.exactness.legMaximumShares[1] = {
        numerator: "5000001",
        denominator: "1000000",
      };
    }, "UNEQUAL_NET_DEPTH");
    expectReason((snapshot) => {
      snapshot.exactness.scaleConversionsExact = false;
    }, "INEXACT_SCALE_CONVERSION");
  });

  it("rejects profit, balance, reservation, gas, and cost-evidence regressions", () => {
    expectReason((snapshot) => {
      snapshot.economics.conservativeProfitMicros = 99_999;
    }, "MINIMUM_PROFIT_NOT_MET");
    expectReason((snapshot) => {
      snapshot.economics.conservativeReturnBps = 99;
    }, "MINIMUM_RETURN_NOT_MET");
    expectReason((snapshot) => {
      snapshot.economics.reservedSpendMicros = 7_999_999;
    }, "RESERVATION_INSUFFICIENT");
    expectReason((snapshot) => {
      snapshot.economics.availableBalanceMicros = 8_499_999;
    }, "BALANCE_OR_GAS_RESERVE_INSUFFICIENT");
    expectReason((snapshot) => {
      snapshot.economics.requiredNetworkCostMicros = 500_001;
    }, "GAS_RESERVE_INSUFFICIENT");
    expectReason((snapshot) => {
      snapshot.economics.networkCostExpiresAtMs = NOW;
    }, "NETWORK_COST_EXPIRED");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1])(
    "returns a closed decision for invalid monetary evidence: %s",
    (invalid) => {
      const snapshot = validSnapshot();
      snapshot.economics.availableBalanceMicros = invalid;
      expect(() => evaluateFinalEntryGate(snapshot)).not.toThrow();
      expect(evaluateFinalEntryGate(snapshot)).toEqual({
        ok: false,
        reasons: ["INVALID_GATE_EVIDENCE"],
      });
    },
  );

  describe("strict runtime evidence boundary", () => {
    it.each(
      NUMERIC_RUNTIME_PATHS.flatMap((path) =>
        INVALID_NUMBERS.map(([label, value]) => [path, label, value] as const),
      ),
    )("rejects %s when it is %s", (path, _label, value) => {
      expectInvalidRuntimeEvidence(path, value);
    });

    it.each(BOOLEAN_RUNTIME_PATHS)(
      "rejects non-boolean runtime value at %s",
      (path) => {
        expectInvalidRuntimeEvidence(path, "true");
      },
    );

    it.each(ENUM_RUNTIME_PATHS)("rejects invalid runtime enum at %s", (path) => {
      expectInvalidRuntimeEvidence(path, "INVALID");
    });

    it.each(
      (["expected", "current"] as const).flatMap((side) =>
        Object.keys(validSnapshot().bindings[side]).map(
          (field) => [`bindings.${side}.${field}`] as const,
        ),
      ),
    )("rejects non-string runtime binding at %s", (path) => {
      expectInvalidRuntimeEvidence(path, 123);
    });

    it.each([
      ["exactness.canonicalShares.numerator", 5],
      ["exactness.canonicalShares.denominator", "0"],
      ["exactness.legMinimumShares", {}],
      ["inventory.lotId", 1],
      ["inventory.required", null],
    ] as const)("rejects malformed runtime structure at %s", (path, value) => {
      expectInvalidRuntimeEvidence(path, value);
    });

    it.each([null, undefined, [], "snapshot", 1])(
      "rejects a malformed root without throwing: %s",
      (snapshot) => {
        const runtimeSnapshot = snapshot as unknown as FinalEntryGateSnapshot;
        expect(() => evaluateFinalEntryGate(runtimeSnapshot)).not.toThrow();
        expect(evaluateFinalEntryGate(runtimeSnapshot)).toEqual({
          ok: false,
          reasons: ["INVALID_GATE_EVIDENCE"],
        });
      },
    );

    it("rejects unexpected runtime fields", () => {
      const snapshot = validSnapshot() as MutableSnapshot & { unexpected?: string };
      snapshot.unexpected = "not bound";
      expect(evaluateFinalEntryGate(snapshot)).toEqual({
        ok: false,
        reasons: ["INVALID_GATE_EVIDENCE"],
      });
    });
  });

  it("requires current finalized, single-use complete-set inventory", () => {
    expectReason((snapshot) => {
      snapshot.inventory.lotVersion = 3;
    }, "INVENTORY_VERSION_DRIFT");
    expectReason((snapshot) => {
      snapshot.inventory.reservationFence = 8;
    }, "INVENTORY_FENCE_DRIFT");
    expectReason((snapshot) => {
      snapshot.inventory.finalized = false;
    }, "INVENTORY_NOT_FINAL");
    expectReason((snapshot) => {
      snapshot.inventory.reused = true;
    }, "INVENTORY_REUSED");
    expectReason((snapshot) => {
      snapshot.inventory.balancesMatch = false;
    }, "INVENTORY_BALANCE_DRIFT");
    expectReason((snapshot) => {
      snapshot.inventory.costEvidenceFinal = false;
    }, "INVENTORY_COST_UNKNOWN");
  });

  it("requires validated, signed, simulated, unexpired artifacts at broadcast", () => {
    expectReason((snapshot) => {
      snapshot.artifact.expiresAtMs = NOW;
    }, "ARTIFACT_EXPIRED");
    expectReason((snapshot) => {
      snapshot.artifact.signatureVerified = false;
    }, "SIGNATURE_NOT_VERIFIED");
    expectReason((snapshot) => {
      snapshot.artifact.simulationPassed = false;
    }, "SIMULATION_NOT_PASSED");

    const signing = validSnapshot();
    signing.stage = "signing";
    signing.artifact.signatureVerified = false;
    signing.artifact.simulationPassed = false;
    expect(evaluateFinalEntryGate(signing)).toEqual({ ok: true, reasons: [] });
  });

  it("fails closed on kill switches, unhealthy dependencies, and future evidence", () => {
    expectReason((snapshot) => {
      snapshot.safety.entryPaused = true;
    }, "ENTRY_PAUSED");
    expectReason((snapshot) => {
      snapshot.health.rpcHealthy = false;
    }, "RPC_UNHEALTHY");
    expectReason((snapshot) => {
      snapshot.health.databaseHealthy = false;
    }, "DATABASE_UNHEALTHY");
    expectReason((snapshot) => {
      snapshot.health.observedAtMs = NOW + 1_001;
    }, "HEALTH_EVIDENCE_FROM_FUTURE");
  });

  it("returns deterministic, de-duplicated reason order", () => {
    const snapshot = validSnapshot();
    snapshot.bindings.current.ruleHash = "drifted";
    snapshot.authorization.grantStatus = "PAUSED";
    snapshot.safety.entryPaused = true;
    snapshot.health.rpcHealthy = false;

    expect(evaluateFinalEntryGate(snapshot)).toEqual({
      ok: false,
      reasons: [
        "RULE_DRIFT",
        "GRANT_NOT_ACTIVE",
        "ENTRY_PAUSED",
        "RPC_UNHEALTHY",
      ],
    });
  });
});
