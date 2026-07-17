import type { DflowOrderStatus, DflowShadowQuote } from "./schemas";

export const DFLOW_SHADOW_BLOCKING_REASONS = Object.freeze([
  "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE",
  "DFLOW_OUTPUT_NOT_EXACT",
] as const);

/** Recognition as a shadow evidence source never registers an execution adapter. */
export const DFLOW_SHADOW_REGISTRATION = Object.freeze({
  venue: "kalshi-dflow" as const,
  kind: "shadow-evidence" as const,
  shadowOnly: true as const,
  liveAdapterRegistered: false as const,
  blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
});

const NO_MUTATION_CAPABILITIES = Object.freeze({
  prepare: false as const,
  reserve: false as const,
  sign: false as const,
  simulate: false as const,
  submit: false as const,
  cancel: false as const,
  compensate: false as const,
  redeem: false as const,
});

export interface DflowShadowEvidenceInput {
  readonly quote?: DflowShadowQuote;
  readonly status?: DflowOrderStatus;
  readonly sanitizedFixtureValid: boolean;
}

export interface DflowShadowEvidenceReport {
  readonly venue: "kalshi-dflow";
  readonly shadowOnly: true;
  readonly executable: false;
  readonly quoteEvidencePresent: boolean;
  readonly statusEvidencePresent: boolean;
  readonly sanitizedFixtureValid: boolean;
  readonly closedStatusObserved: boolean;
  readonly provesFullFill: false;
  readonly blockingReasons: typeof DFLOW_SHADOW_BLOCKING_REASONS;
  readonly capabilities: typeof NO_MUTATION_CAPABILITIES;
}

export function createDflowShadowEvidenceReport(
  input: DflowShadowEvidenceInput,
): DflowShadowEvidenceReport {
  if (
    input.quote &&
    !DFLOW_SHADOW_BLOCKING_REASONS.every((reason) =>
      input.quote?.refusalCodes.includes(reason),
    )
  ) {
    throw new Error("DFlow quote is missing a required shadow refusal");
  }

  return Object.freeze({
    venue: "kalshi-dflow",
    shadowOnly: true,
    executable: false,
    quoteEvidencePresent: input.quote !== undefined,
    statusEvidencePresent: input.status !== undefined,
    sanitizedFixtureValid: input.sanitizedFixtureValid,
    closedStatusObserved: input.status?.status === "closed",
    // Current status evidence cannot prove the requested exact outcome.
    provesFullFill: false,
    blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
    capabilities: NO_MUTATION_CAPABILITIES,
  });
}

export interface DflowLiveOpportunityRefusal {
  readonly accepted: false;
  readonly reservationCreated: false;
  readonly blockingReasons: typeof DFLOW_SHADOW_BLOCKING_REASONS;
}

/** This is the only DFlow live-opportunity conversion while both gates are closed. */
export function refuseDflowLiveOpportunity(): DflowLiveOpportunityRefusal {
  return Object.freeze({
    accepted: false,
    reservationCreated: false,
    blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
  });
}
