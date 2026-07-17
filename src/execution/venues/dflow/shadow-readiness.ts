import {
  CURRENT_DFLOW_DOCUMENTATION_EVIDENCE,
  evaluateDflowDocumentationGate,
} from "./documentation-gate";
import { DFLOW_SHADOW_BLOCKING_REASONS } from "./shadow-adapter";

export const DFLOW_PRODUCTION_ENDPOINTS = Object.freeze({
  rest: "https://quote-api.dflow.net" as const,
  websocket: "wss://quote-api.dflow.net" as const,
});

export interface DflowShadowReadinessInput {
  readonly fixedEndpointHealthy: boolean;
  readonly sanitizedFixtureValid: boolean;
}

export interface DflowShadowReadiness {
  readonly venue: "kalshi-dflow";
  readonly shadowOnly: true;
  readonly liveReady: false;
  readonly shadowEvidenceReady: boolean;
  readonly endpoints: typeof DFLOW_PRODUCTION_ENDPOINTS;
  readonly gates: Readonly<{
    officialDocumentation: false;
    exactOutput: false;
    fixedEndpointHealthy: boolean;
    sanitizedFixtureValid: boolean;
  }>;
  readonly blockingReasons: typeof DFLOW_SHADOW_BLOCKING_REASONS;
}

/** Builds a read-only status from fixed, non-user evidence. */
export function getDflowShadowReadiness(
  input: DflowShadowReadinessInput,
): DflowShadowReadiness {
  const documentation = evaluateDflowDocumentationGate(
    CURRENT_DFLOW_DOCUMENTATION_EVIDENCE,
  );
  if (documentation.executable) {
    throw new Error("DFlow baseline changed without a reviewed shadow-readiness update");
  }

  const gates = Object.freeze({
    officialDocumentation: false as const,
    exactOutput: false as const,
    fixedEndpointHealthy: input.fixedEndpointHealthy,
    sanitizedFixtureValid: input.sanitizedFixtureValid,
  });

  return Object.freeze({
    venue: "kalshi-dflow",
    shadowOnly: true,
    liveReady: false,
    shadowEvidenceReady:
      gates.fixedEndpointHealthy && gates.sanitizedFixtureValid,
    endpoints: DFLOW_PRODUCTION_ENDPOINTS,
    gates,
    blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
  });
}
