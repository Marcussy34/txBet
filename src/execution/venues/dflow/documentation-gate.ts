export interface DflowDocumentationEvidence {
  readonly catalogContract: boolean;
  readonly immutableMarketMintBinding: boolean;
  readonly delegatedUserEligibility: boolean;
  readonly revisionAndExpirySemantics: boolean;
  readonly redemptionContract: boolean;
  readonly exactOutcomeGuaranteed: boolean;
}

export type DflowDocumentationRefusal =
  | "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE"
  | "DFLOW_OFFICIAL_MARKET_MINT_BINDING_UNAVAILABLE"
  | "DFLOW_OFFICIAL_ELIGIBILITY_UNAVAILABLE"
  | "DFLOW_OFFICIAL_REVISION_SEMANTICS_UNAVAILABLE"
  | "DFLOW_OFFICIAL_REDEMPTION_UNAVAILABLE"
  | "DFLOW_OUTPUT_NOT_EXACT";

export interface DflowDocumentationDecision {
  readonly executable: boolean;
  readonly reasons: readonly DflowDocumentationRefusal[];
}

/** Current official docs have none of the prediction-specific live contracts. */
export const CURRENT_DFLOW_DOCUMENTATION_EVIDENCE: DflowDocumentationEvidence =
  Object.freeze({
    catalogContract: false,
    immutableMarketMintBinding: false,
    delegatedUserEligibility: false,
    revisionAndExpirySemantics: false,
    redemptionContract: false,
    exactOutcomeGuaranteed: false,
  });

export function evaluateDflowDocumentationGate(
  evidence: DflowDocumentationEvidence,
): DflowDocumentationDecision {
  const reasons: DflowDocumentationRefusal[] = [];
  if (!evidence.catalogContract) {
    reasons.push("DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE");
  }
  if (!evidence.immutableMarketMintBinding) {
    reasons.push("DFLOW_OFFICIAL_MARKET_MINT_BINDING_UNAVAILABLE");
  }
  if (!evidence.delegatedUserEligibility) {
    reasons.push("DFLOW_OFFICIAL_ELIGIBILITY_UNAVAILABLE");
  }
  if (!evidence.revisionAndExpirySemantics) {
    reasons.push("DFLOW_OFFICIAL_REVISION_SEMANTICS_UNAVAILABLE");
  }
  if (!evidence.redemptionContract) {
    reasons.push("DFLOW_OFFICIAL_REDEMPTION_UNAVAILABLE");
  }
  if (!evidence.exactOutcomeGuaranteed) {
    reasons.push("DFLOW_OUTPUT_NOT_EXACT");
  }

  return Object.freeze({
    executable: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}

export function isQuarantinedDflowUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return !(
      url.protocol === "https:" &&
      url.hostname === "quote-api.dflow.net" &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    );
  } catch {
    return true;
  }
}
