export type ExecutionAction =
  | "entry"
  | "cancel"
  | "compensate"
  | "redeem"
  | "reconcile";

export interface ExecutionSafetySnapshot {
  readonly entryPaused: boolean;
  readonly unresolvedResidual: boolean;
  readonly marketDataTrusted: boolean;
  readonly marketDataFresh: boolean;
  readonly independentOrderStatusFresh: boolean;
  readonly independentResolutionFresh: boolean;
  readonly settlementValid: boolean;
  readonly targetWriteIntegrity: "trusted" | "compromised";
  readonly recoveryMode: "enabled" | "frozen";
  readonly recoveryPathHealthy: boolean;
  readonly grantCurrent: boolean;
  readonly certificationCurrent: boolean;
  readonly eligibilityFresh: boolean;
  readonly databaseCertain: boolean;
  readonly reconciliationBacklogClear: boolean;
}

export type ExecutionBlockReason =
  | "DATABASE_UNCERTAIN"
  | "RECOVERY_FROZEN"
  | "RECOVERY_PATH_UNHEALTHY"
  | "TARGET_WRITE_COMPROMISED"
  | "GRANT_NOT_CURRENT"
  | "CERTIFICATION_NOT_CURRENT"
  | "ELIGIBILITY_NOT_FRESH"
  | "ENTRY_PAUSED"
  | "UNRESOLVED_RESIDUAL"
  | "MARKET_DATA_UNTRUSTED"
  | "MARKET_DATA_STALE"
  | "INDEPENDENT_ORDER_STATUS_REQUIRED"
  | "INDEPENDENT_RESOLUTION_REQUIRED"
  | "SETTLEMENT_INVALID"
  | "RECONCILIATION_BACKLOG";

export interface ExecutionActionDecision {
  readonly allowed: boolean;
  readonly reasonCodes: readonly ExecutionBlockReason[];
}

/** Applies the persisted action matrix; read-only reconciliation is never disabled. */
export function evaluateExecutionAction(
  action: ExecutionAction,
  snapshot: ExecutionSafetySnapshot,
): ExecutionActionDecision {
  if (action === "reconcile") {
    return Object.freeze({ allowed: true, reasonCodes: Object.freeze([]) });
  }

  const reasons: ExecutionBlockReason[] = [];
  if (!snapshot.databaseCertain) reasons.push("DATABASE_UNCERTAIN");
  if (snapshot.recoveryMode === "frozen") reasons.push("RECOVERY_FROZEN");
  if (!snapshot.recoveryPathHealthy) reasons.push("RECOVERY_PATH_UNHEALTHY");
  if (snapshot.targetWriteIntegrity === "compromised") {
    reasons.push("TARGET_WRITE_COMPROMISED");
  }
  if (!snapshot.grantCurrent) reasons.push("GRANT_NOT_CURRENT");
  if (!snapshot.certificationCurrent) reasons.push("CERTIFICATION_NOT_CURRENT");
  if (!snapshot.eligibilityFresh) reasons.push("ELIGIBILITY_NOT_FRESH");

  if (action === "entry") {
    if (snapshot.entryPaused) reasons.push("ENTRY_PAUSED");
    if (snapshot.unresolvedResidual) reasons.push("UNRESOLVED_RESIDUAL");
    if (!snapshot.marketDataTrusted) reasons.push("MARKET_DATA_UNTRUSTED");
    if (!snapshot.marketDataFresh) reasons.push("MARKET_DATA_STALE");
    if (!snapshot.settlementValid) reasons.push("SETTLEMENT_INVALID");
    if (!snapshot.reconciliationBacklogClear) reasons.push("RECONCILIATION_BACKLOG");
  } else if (action === "cancel") {
    if (
      !snapshot.marketDataTrusted &&
      !snapshot.independentOrderStatusFresh
    ) {
      reasons.push("INDEPENDENT_ORDER_STATUS_REQUIRED");
    }
  } else if (action === "compensate") {
    if (!snapshot.marketDataTrusted) reasons.push("MARKET_DATA_UNTRUSTED");
    if (!snapshot.marketDataFresh) reasons.push("MARKET_DATA_STALE");
    if (!snapshot.settlementValid) reasons.push("SETTLEMENT_INVALID");
  } else {
    if (
      !snapshot.marketDataTrusted &&
      !snapshot.independentResolutionFresh
    ) {
      reasons.push("INDEPENDENT_RESOLUTION_REQUIRED");
    }
    if (!snapshot.settlementValid) reasons.push("SETTLEMENT_INVALID");
  }

  return Object.freeze({
    allowed: reasons.length === 0,
    reasonCodes: Object.freeze(reasons),
  });
}
