import { equalExactShares, type ExactShares } from "@/core/live-money";
import { z } from "zod";

import {
  evaluateExecutionAction,
  type ExecutionBlockReason,
  type ExecutionSafetySnapshot,
} from "./kill-switch";

export const FINAL_GATE_BINDING_FIELDS = [
  "opportunityHash",
  "bundleHash",
  "artifactHash",
  "grantVersion",
  "riskVersion",
  "walletOwnershipRevision",
  "walletAuthorityHash",
  "certificationVersion",
  "eligibilityScopeHash",
  "contractRevision",
  "ruleHash",
  "linkRevision",
  "bookRevision",
  "feeScheduleVersion",
  "closeTimeRevision",
  "payoutAssetRevision",
  "valuePolicyVersion",
] as const;

export type FinalGateBindingField = (typeof FINAL_GATE_BINDING_FIELDS)[number];

export interface FinalGateBindings {
  readonly opportunityHash: string;
  readonly bundleHash: string;
  readonly artifactHash: string;
  readonly grantVersion: string;
  readonly riskVersion: string;
  readonly walletOwnershipRevision: string;
  readonly walletAuthorityHash: string;
  readonly certificationVersion: string;
  readonly eligibilityScopeHash: string;
  readonly contractRevision: string;
  readonly ruleHash: string;
  readonly linkRevision: string;
  readonly bookRevision: string;
  readonly feeScheduleVersion: string;
  readonly closeTimeRevision: string;
  readonly payoutAssetRevision: string;
  readonly valuePolicyVersion: string;
}

export interface FinalEntryGateSnapshot {
  readonly stage: "signing" | "broadcast";
  readonly nowMs: number;
  readonly maximumObservationAgeMs: number;
  readonly minimumCloseBufferMs: number;
  readonly maximumClockSkewMs: number;
  readonly bindings: Readonly<{
    expected: FinalGateBindings;
    current: FinalGateBindings;
  }>;
  readonly authorization: Readonly<{
    grantStatus: "ACTIVE" | "PAUSED" | "REVOKED" | "EXPIRED" | "UNKNOWN";
    grantExpiresAtMs: number;
    expectedAuthorityOnly: boolean;
    certificationStatus: "CERTIFIED" | "QUARANTINED" | "EXPIRED" | "UNKNOWN";
    certificationExpiresAtMs: number;
    eligibilityStatus: "ELIGIBLE" | "INELIGIBLE" | "UNKNOWN" | "UNAVAILABLE";
    eligibilityObservedAtMs: number;
    eligibilityExpiresAtMs: number;
  }>;
  readonly safety: ExecutionSafetySnapshot;
  readonly quote: Readonly<{
    observedAtMs: number;
    expiresAtMs: number;
    observedChainHeight: number | null;
    expiresAfterChainHeight: number | null;
    currentChainHeight: number | null;
    tradingClosesAtMs: number;
  }>;
  readonly exactness: Readonly<{
    canonicalShares: ExactShares;
    legMinimumShares: readonly ExactShares[];
    legMaximumShares: readonly ExactShares[];
    scaleConversionsExact: boolean;
  }>;
  readonly economics: Readonly<{
    conservativeProfitMicros: number;
    minimumProfitMicros: number;
    conservativeReturnBps: number;
    minimumReturnBps: number;
    requiredSpendMicros: number;
    reservedSpendMicros: number;
    availableBalanceMicros: number;
    gasReserveMicros: number;
    requiredNetworkCostMicros: number;
    networkCostObservedAtMs: number;
    networkCostExpiresAtMs: number;
  }>;
  readonly inventory: Readonly<{
    required: boolean;
    lotId: string | null;
    expectedLotId: string | null;
    lotVersion: number | null;
    expectedLotVersion: number | null;
    reservationFence: number | null;
    expectedReservationFence: number | null;
    finalized: boolean;
    reused: boolean;
    balancesMatch: boolean;
    costEvidenceFinal: boolean;
    observedAtMs: number | null;
    expiresAtMs: number | null;
  }>;
  readonly artifact: Readonly<{
    expiresAtMs: number;
    validationPassed: boolean;
    signatureVerified: boolean;
    simulationPassed: boolean;
  }>;
  readonly health: Readonly<{
    venueHealthy: boolean;
    rpcHealthy: boolean;
    databaseHealthy: boolean;
    clockHealthy: boolean;
    clockSkewMs: number;
    observedAtMs: number;
  }>;
}

const nonnegativeSafeIntegerSchema = z.number().int().nonnegative().safe();
const nullableNonnegativeSafeIntegerSchema = nonnegativeSafeIntegerSchema.nullable();
const nonemptyBindingSchema = z.string().min(1);
const positiveAtomicSchema = z.string().regex(/^[1-9][0-9]*$/);

const bindingsSchema = z.strictObject({
  opportunityHash: nonemptyBindingSchema,
  bundleHash: nonemptyBindingSchema,
  artifactHash: nonemptyBindingSchema,
  grantVersion: nonemptyBindingSchema,
  riskVersion: nonemptyBindingSchema,
  walletOwnershipRevision: nonemptyBindingSchema,
  walletAuthorityHash: nonemptyBindingSchema,
  certificationVersion: nonemptyBindingSchema,
  eligibilityScopeHash: nonemptyBindingSchema,
  contractRevision: nonemptyBindingSchema,
  ruleHash: nonemptyBindingSchema,
  linkRevision: nonemptyBindingSchema,
  bookRevision: nonemptyBindingSchema,
  feeScheduleVersion: nonemptyBindingSchema,
  closeTimeRevision: nonemptyBindingSchema,
  payoutAssetRevision: nonemptyBindingSchema,
  valuePolicyVersion: nonemptyBindingSchema,
});

const exactSharesSchema = z.strictObject({
  numerator: positiveAtomicSchema,
  denominator: positiveAtomicSchema,
});

/** Reject malformed live evidence before any branch can interpret it. */
const finalEntryGateSnapshotSchema = z.strictObject({
  stage: z.enum(["signing", "broadcast"]),
  nowMs: nonnegativeSafeIntegerSchema,
  maximumObservationAgeMs: nonnegativeSafeIntegerSchema,
  minimumCloseBufferMs: nonnegativeSafeIntegerSchema,
  maximumClockSkewMs: nonnegativeSafeIntegerSchema,
  bindings: z.strictObject({
    expected: bindingsSchema,
    current: bindingsSchema,
  }),
  authorization: z.strictObject({
    grantStatus: z.enum(["ACTIVE", "PAUSED", "REVOKED", "EXPIRED", "UNKNOWN"]),
    grantExpiresAtMs: nonnegativeSafeIntegerSchema,
    expectedAuthorityOnly: z.boolean(),
    certificationStatus: z.enum(["CERTIFIED", "QUARANTINED", "EXPIRED", "UNKNOWN"]),
    certificationExpiresAtMs: nonnegativeSafeIntegerSchema,
    eligibilityStatus: z.enum(["ELIGIBLE", "INELIGIBLE", "UNKNOWN", "UNAVAILABLE"]),
    eligibilityObservedAtMs: nonnegativeSafeIntegerSchema,
    eligibilityExpiresAtMs: nonnegativeSafeIntegerSchema,
  }),
  safety: z.strictObject({
    entryPaused: z.boolean(),
    unresolvedResidual: z.boolean(),
    marketDataTrusted: z.boolean(),
    marketDataFresh: z.boolean(),
    independentOrderStatusFresh: z.boolean(),
    independentResolutionFresh: z.boolean(),
    settlementValid: z.boolean(),
    targetWriteIntegrity: z.enum(["trusted", "compromised"]),
    recoveryMode: z.enum(["enabled", "frozen"]),
    recoveryPathHealthy: z.boolean(),
    grantCurrent: z.boolean(),
    certificationCurrent: z.boolean(),
    eligibilityFresh: z.boolean(),
    databaseCertain: z.boolean(),
    reconciliationBacklogClear: z.boolean(),
  }),
  quote: z.strictObject({
    observedAtMs: nonnegativeSafeIntegerSchema,
    expiresAtMs: nonnegativeSafeIntegerSchema,
    observedChainHeight: nullableNonnegativeSafeIntegerSchema,
    expiresAfterChainHeight: nullableNonnegativeSafeIntegerSchema,
    currentChainHeight: nullableNonnegativeSafeIntegerSchema,
    tradingClosesAtMs: nonnegativeSafeIntegerSchema,
  }),
  exactness: z.strictObject({
    canonicalShares: exactSharesSchema,
    legMinimumShares: z.array(exactSharesSchema),
    legMaximumShares: z.array(exactSharesSchema),
    scaleConversionsExact: z.boolean(),
  }),
  economics: z.strictObject({
    conservativeProfitMicros: nonnegativeSafeIntegerSchema,
    minimumProfitMicros: nonnegativeSafeIntegerSchema,
    conservativeReturnBps: nonnegativeSafeIntegerSchema,
    minimumReturnBps: nonnegativeSafeIntegerSchema,
    requiredSpendMicros: nonnegativeSafeIntegerSchema,
    reservedSpendMicros: nonnegativeSafeIntegerSchema,
    availableBalanceMicros: nonnegativeSafeIntegerSchema,
    gasReserveMicros: nonnegativeSafeIntegerSchema,
    requiredNetworkCostMicros: nonnegativeSafeIntegerSchema,
    networkCostObservedAtMs: nonnegativeSafeIntegerSchema,
    networkCostExpiresAtMs: nonnegativeSafeIntegerSchema,
  }),
  inventory: z.strictObject({
    required: z.boolean(),
    lotId: z.string().nullable(),
    expectedLotId: z.string().nullable(),
    lotVersion: nullableNonnegativeSafeIntegerSchema,
    expectedLotVersion: nullableNonnegativeSafeIntegerSchema,
    reservationFence: nullableNonnegativeSafeIntegerSchema,
    expectedReservationFence: nullableNonnegativeSafeIntegerSchema,
    finalized: z.boolean(),
    reused: z.boolean(),
    balancesMatch: z.boolean(),
    costEvidenceFinal: z.boolean(),
    observedAtMs: nullableNonnegativeSafeIntegerSchema,
    expiresAtMs: nullableNonnegativeSafeIntegerSchema,
  }),
  artifact: z.strictObject({
    expiresAtMs: nonnegativeSafeIntegerSchema,
    validationPassed: z.boolean(),
    signatureVerified: z.boolean(),
    simulationPassed: z.boolean(),
  }),
  health: z.strictObject({
    venueHealthy: z.boolean(),
    rpcHealthy: z.boolean(),
    databaseHealthy: z.boolean(),
    clockHealthy: z.boolean(),
    clockSkewMs: nonnegativeSafeIntegerSchema,
    observedAtMs: nonnegativeSafeIntegerSchema,
  }),
});

type FinalGateBindingReason =
  | "OPPORTUNITY_DRIFT"
  | "BUNDLE_DRIFT"
  | "ARTIFACT_DRIFT"
  | "GRANT_VERSION_DRIFT"
  | "RISK_VERSION_DRIFT"
  | "WALLET_OWNERSHIP_DRIFT"
  | "WALLET_AUTHORITY_DRIFT"
  | "CERTIFICATION_DRIFT"
  | "ELIGIBILITY_SCOPE_DRIFT"
  | "CONTRACT_DRIFT"
  | "RULE_DRIFT"
  | "LINK_DRIFT"
  | "BOOK_DRIFT"
  | "FEE_DRIFT"
  | "CLOSE_TIME_DRIFT"
  | "PAYOUT_ASSET_DRIFT"
  | "VALUE_POLICY_DRIFT";

const BINDING_REASON: Readonly<
  Record<FinalGateBindingField, FinalGateBindingReason>
> = {
  opportunityHash: "OPPORTUNITY_DRIFT",
  bundleHash: "BUNDLE_DRIFT",
  artifactHash: "ARTIFACT_DRIFT",
  grantVersion: "GRANT_VERSION_DRIFT",
  riskVersion: "RISK_VERSION_DRIFT",
  walletOwnershipRevision: "WALLET_OWNERSHIP_DRIFT",
  walletAuthorityHash: "WALLET_AUTHORITY_DRIFT",
  certificationVersion: "CERTIFICATION_DRIFT",
  eligibilityScopeHash: "ELIGIBILITY_SCOPE_DRIFT",
  contractRevision: "CONTRACT_DRIFT",
  ruleHash: "RULE_DRIFT",
  linkRevision: "LINK_DRIFT",
  bookRevision: "BOOK_DRIFT",
  feeScheduleVersion: "FEE_DRIFT",
  closeTimeRevision: "CLOSE_TIME_DRIFT",
  payoutAssetRevision: "PAYOUT_ASSET_DRIFT",
  valuePolicyVersion: "VALUE_POLICY_DRIFT",
};

export type FinalGateReason =
  | FinalGateBindingReason
  | ExecutionBlockReason
  | "INVALID_GATE_EVIDENCE"
  | "GRANT_NOT_ACTIVE"
  | "GRANT_EXPIRED"
  | "UNEXPECTED_WALLET_AUTHORITY"
  | "CERTIFICATION_NOT_CURRENT"
  | "CERTIFICATION_EXPIRED"
  | "ELIGIBILITY_NOT_ELIGIBLE"
  | "ELIGIBILITY_STALE"
  | "ELIGIBILITY_EXPIRED"
  | "ELIGIBILITY_EVIDENCE_FROM_FUTURE"
  | "QUOTE_STALE"
  | "QUOTE_EXPIRED"
  | "QUOTE_FROM_FUTURE"
  | "QUOTE_CHAIN_VALIDITY_UNKNOWN"
  | "QUOTE_CHAIN_EXPIRED"
  | "MARKET_CLOSE_BUFFER"
  | "UNEQUAL_NET_DEPTH"
  | "INEXACT_SCALE_CONVERSION"
  | "MINIMUM_PROFIT_NOT_MET"
  | "MINIMUM_RETURN_NOT_MET"
  | "RESERVATION_INSUFFICIENT"
  | "BALANCE_OR_GAS_RESERVE_INSUFFICIENT"
  | "GAS_RESERVE_INSUFFICIENT"
  | "NETWORK_COST_STALE"
  | "NETWORK_COST_EXPIRED"
  | "NETWORK_COST_EVIDENCE_FROM_FUTURE"
  | "INVENTORY_LOT_DRIFT"
  | "INVENTORY_VERSION_DRIFT"
  | "INVENTORY_FENCE_DRIFT"
  | "INVENTORY_NOT_FINAL"
  | "INVENTORY_REUSED"
  | "INVENTORY_BALANCE_DRIFT"
  | "INVENTORY_COST_UNKNOWN"
  | "INVENTORY_STALE"
  | "INVENTORY_EXPIRED"
  | "INVENTORY_EVIDENCE_FROM_FUTURE"
  | "ARTIFACT_EXPIRED"
  | "ARTIFACT_NOT_VALIDATED"
  | "SIGNATURE_NOT_VERIFIED"
  | "SIMULATION_NOT_PASSED"
  | "VENUE_UNHEALTHY"
  | "RPC_UNHEALTHY"
  | "DATABASE_UNHEALTHY"
  | "CLOCK_UNHEALTHY"
  | "CLOCK_SKEW"
  | "HEALTH_STALE"
  | "HEALTH_EVIDENCE_FROM_FUTURE";

export type FinalGateResult =
  | { readonly ok: true; readonly reasons: readonly [] }
  | { readonly ok: false; readonly reasons: readonly FinalGateReason[] };

const NO_REASONS = Object.freeze([]) as readonly [];
const INVALID_GATE_RESULT = Object.freeze({
  ok: false,
  reasons: Object.freeze(["INVALID_GATE_EVIDENCE"]),
}) as FinalGateResult;

function parseFinalEntryGateSnapshot(value: unknown): FinalEntryGateSnapshot | null {
  try {
    const parsed = finalEntryGateSnapshotSchema.safeParse(value);
    return parsed.success ? (parsed.data as FinalEntryGateSnapshot) : null;
  } catch {
    // Hostile getters and proxies must fail closed at the same runtime boundary.
    return null;
  }
}

function isNonnegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validConfiguration(snapshot: FinalEntryGateSnapshot): boolean {
  return (
    isNonnegativeSafeInteger(snapshot.nowMs) &&
    isNonnegativeSafeInteger(snapshot.maximumObservationAgeMs) &&
    isNonnegativeSafeInteger(snapshot.minimumCloseBufferMs) &&
    isNonnegativeSafeInteger(snapshot.maximumClockSkewMs)
  );
}

function stale(nowMs: number, observedAtMs: number, maximumAgeMs: number): boolean {
  return nowMs - observedAtMs > maximumAgeMs;
}

function fromFuture(nowMs: number, observedAtMs: number, maximumSkewMs: number): boolean {
  return observedAtMs - nowMs > maximumSkewMs;
}

function safeMoney(values: readonly number[]): boolean {
  return values.every(isNonnegativeSafeInteger);
}

function exactDepthMatches(snapshot: FinalEntryGateSnapshot): boolean {
  if (
    snapshot.exactness.legMinimumShares.length !== 2 ||
    snapshot.exactness.legMaximumShares.length !== 2
  ) {
    return false;
  }
  try {
    return [...snapshot.exactness.legMinimumShares, ...snapshot.exactness.legMaximumShares]
      .every((shares) => equalExactShares(shares, snapshot.exactness.canonicalShares));
  } catch {
    return false;
  }
}

/** Pure final gate; callers persist its exact evidence before signing or broadcasting. */
export function evaluateFinalEntryGate(
  value: FinalEntryGateSnapshot,
): FinalGateResult {
  const snapshot = parseFinalEntryGateSnapshot(value);
  if (snapshot === null) return INVALID_GATE_RESULT;

  const reasons: FinalGateReason[] = [];
  const add = (reason: FinalGateReason): void => {
    if (!reasons.includes(reason)) reasons.push(reason);
  };

  if (!validConfiguration(snapshot)) add("INVALID_GATE_EVIDENCE");

  for (const field of FINAL_GATE_BINDING_FIELDS) {
    const expected = snapshot.bindings.expected[field];
    const current = snapshot.bindings.current[field];
    if (expected.length === 0 || current.length === 0) {
      add("INVALID_GATE_EVIDENCE");
    } else if (expected !== current) {
      add(BINDING_REASON[field]);
    }
  }

  if (snapshot.authorization.grantStatus !== "ACTIVE") add("GRANT_NOT_ACTIVE");
  if (snapshot.authorization.grantExpiresAtMs <= snapshot.nowMs) add("GRANT_EXPIRED");
  if (!snapshot.authorization.expectedAuthorityOnly) add("UNEXPECTED_WALLET_AUTHORITY");
  if (snapshot.authorization.certificationStatus !== "CERTIFIED") {
    add("CERTIFICATION_NOT_CURRENT");
  }
  if (snapshot.authorization.certificationExpiresAtMs <= snapshot.nowMs) {
    add("CERTIFICATION_EXPIRED");
  }
  if (snapshot.authorization.eligibilityStatus !== "ELIGIBLE") {
    add("ELIGIBILITY_NOT_ELIGIBLE");
  }
  if (
    fromFuture(
      snapshot.nowMs,
      snapshot.authorization.eligibilityObservedAtMs,
      snapshot.maximumClockSkewMs,
    )
  ) {
    add("ELIGIBILITY_EVIDENCE_FROM_FUTURE");
  } else if (
    stale(
      snapshot.nowMs,
      snapshot.authorization.eligibilityObservedAtMs,
      snapshot.maximumObservationAgeMs,
    )
  ) {
    add("ELIGIBILITY_STALE");
  }
  if (snapshot.authorization.eligibilityExpiresAtMs <= snapshot.nowMs) {
    add("ELIGIBILITY_EXPIRED");
  }

  for (const reason of evaluateExecutionAction("entry", snapshot.safety).reasonCodes) {
    add(reason);
  }

  if (
    fromFuture(
      snapshot.nowMs,
      snapshot.quote.observedAtMs,
      snapshot.maximumClockSkewMs,
    )
  ) {
    add("QUOTE_FROM_FUTURE");
  } else if (
    stale(
      snapshot.nowMs,
      snapshot.quote.observedAtMs,
      snapshot.maximumObservationAgeMs,
    )
  ) {
    add("QUOTE_STALE");
  }
  if (snapshot.quote.expiresAtMs <= snapshot.nowMs) add("QUOTE_EXPIRED");
  const chainValues = [
    snapshot.quote.observedChainHeight,
    snapshot.quote.expiresAfterChainHeight,
    snapshot.quote.currentChainHeight,
  ];
  if (chainValues.some((value) => value !== null)) {
    if (!chainValues.every((value) => value !== null && isNonnegativeSafeInteger(value))) {
      add("QUOTE_CHAIN_VALIDITY_UNKNOWN");
    } else if (
      snapshot.quote.currentChainHeight! > snapshot.quote.expiresAfterChainHeight!
    ) {
      add("QUOTE_CHAIN_EXPIRED");
    }
  }
  if (
    snapshot.quote.tradingClosesAtMs - snapshot.nowMs <
    snapshot.minimumCloseBufferMs
  ) {
    add("MARKET_CLOSE_BUFFER");
  }

  if (!exactDepthMatches(snapshot)) add("UNEQUAL_NET_DEPTH");
  if (!snapshot.exactness.scaleConversionsExact) add("INEXACT_SCALE_CONVERSION");

  const money = snapshot.economics;
  const moneyValid = safeMoney([
    money.conservativeProfitMicros,
    money.minimumProfitMicros,
    money.conservativeReturnBps,
    money.minimumReturnBps,
    money.requiredSpendMicros,
    money.reservedSpendMicros,
    money.availableBalanceMicros,
    money.gasReserveMicros,
    money.requiredNetworkCostMicros,
    money.networkCostObservedAtMs,
    money.networkCostExpiresAtMs,
  ]);
  if (!moneyValid) {
    add("INVALID_GATE_EVIDENCE");
  } else {
    if (money.conservativeProfitMicros < money.minimumProfitMicros) {
      add("MINIMUM_PROFIT_NOT_MET");
    }
    if (money.conservativeReturnBps < money.minimumReturnBps) {
      add("MINIMUM_RETURN_NOT_MET");
    }
    if (money.reservedSpendMicros < money.requiredSpendMicros) {
      add("RESERVATION_INSUFFICIENT");
    }
    if (
      BigInt(money.availableBalanceMicros) <
      BigInt(money.requiredSpendMicros) + BigInt(money.gasReserveMicros)
    ) {
      add("BALANCE_OR_GAS_RESERVE_INSUFFICIENT");
    }
    if (money.requiredNetworkCostMicros > money.gasReserveMicros) {
      add("GAS_RESERVE_INSUFFICIENT");
    }
    if (
      fromFuture(
        snapshot.nowMs,
        money.networkCostObservedAtMs,
        snapshot.maximumClockSkewMs,
      )
    ) {
      add("NETWORK_COST_EVIDENCE_FROM_FUTURE");
    } else if (
      stale(
        snapshot.nowMs,
        money.networkCostObservedAtMs,
        snapshot.maximumObservationAgeMs,
      )
    ) {
      add("NETWORK_COST_STALE");
    }
    if (money.networkCostExpiresAtMs <= snapshot.nowMs) {
      add("NETWORK_COST_EXPIRED");
    }
  }

  const inventory = snapshot.inventory;
  if (inventory.required) {
    if (inventory.lotId === null || inventory.lotId !== inventory.expectedLotId) {
      add("INVENTORY_LOT_DRIFT");
    }
    if (
      inventory.lotVersion === null ||
      inventory.lotVersion !== inventory.expectedLotVersion
    ) {
      add("INVENTORY_VERSION_DRIFT");
    }
    if (
      inventory.reservationFence === null ||
      inventory.reservationFence !== inventory.expectedReservationFence
    ) {
      add("INVENTORY_FENCE_DRIFT");
    }
    if (!inventory.finalized) add("INVENTORY_NOT_FINAL");
    if (inventory.reused) add("INVENTORY_REUSED");
    if (!inventory.balancesMatch) add("INVENTORY_BALANCE_DRIFT");
    if (!inventory.costEvidenceFinal) add("INVENTORY_COST_UNKNOWN");
    if (inventory.observedAtMs === null || inventory.expiresAtMs === null) {
      add("INVENTORY_STALE");
    } else {
      if (
        fromFuture(
          snapshot.nowMs,
          inventory.observedAtMs,
          snapshot.maximumClockSkewMs,
        )
      ) {
        add("INVENTORY_EVIDENCE_FROM_FUTURE");
      } else if (
        stale(
          snapshot.nowMs,
          inventory.observedAtMs,
          snapshot.maximumObservationAgeMs,
        )
      ) {
        add("INVENTORY_STALE");
      }
      if (inventory.expiresAtMs <= snapshot.nowMs) add("INVENTORY_EXPIRED");
    }
  }

  if (snapshot.artifact.expiresAtMs <= snapshot.nowMs) add("ARTIFACT_EXPIRED");
  if (!snapshot.artifact.validationPassed) add("ARTIFACT_NOT_VALIDATED");
  if (snapshot.stage === "broadcast") {
    if (!snapshot.artifact.signatureVerified) add("SIGNATURE_NOT_VERIFIED");
    if (!snapshot.artifact.simulationPassed) add("SIMULATION_NOT_PASSED");
  }

  if (!snapshot.health.venueHealthy) add("VENUE_UNHEALTHY");
  if (!snapshot.health.rpcHealthy) add("RPC_UNHEALTHY");
  if (!snapshot.health.databaseHealthy) add("DATABASE_UNHEALTHY");
  if (!snapshot.health.clockHealthy) add("CLOCK_UNHEALTHY");
  if (
    !isNonnegativeSafeInteger(snapshot.health.clockSkewMs) ||
    snapshot.health.clockSkewMs > snapshot.maximumClockSkewMs
  ) {
    add("CLOCK_SKEW");
  }
  if (
    fromFuture(
      snapshot.nowMs,
      snapshot.health.observedAtMs,
      snapshot.maximumClockSkewMs,
    )
  ) {
    add("HEALTH_EVIDENCE_FROM_FUTURE");
  } else if (
    stale(
      snapshot.nowMs,
      snapshot.health.observedAtMs,
      snapshot.maximumObservationAgeMs,
    )
  ) {
    add("HEALTH_STALE");
  }

  if (reasons.length === 0) {
    return Object.freeze({ ok: true, reasons: NO_REASONS });
  }
  return Object.freeze({ ok: false, reasons: Object.freeze(reasons) });
}
