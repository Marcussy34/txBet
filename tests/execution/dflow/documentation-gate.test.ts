import { describe, expect, it } from "vitest";

import {
  CURRENT_DFLOW_DOCUMENTATION_EVIDENCE,
  evaluateDflowDocumentationGate,
  isQuarantinedDflowUrl,
} from "@/execution/venues/dflow/documentation-gate";

describe("DFlow prediction documentation gate", () => {
  it("returns every current fail-closed reason and no execution capability", () => {
    const decision = evaluateDflowDocumentationGate(
      CURRENT_DFLOW_DOCUMENTATION_EVIDENCE,
    );

    expect(decision).toEqual({
      executable: false,
      reasons: [
        "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE",
        "DFLOW_OFFICIAL_MARKET_MINT_BINDING_UNAVAILABLE",
        "DFLOW_OFFICIAL_ELIGIBILITY_UNAVAILABLE",
        "DFLOW_OFFICIAL_REVISION_SEMANTICS_UNAVAILABLE",
        "DFLOW_OFFICIAL_REDEMPTION_UNAVAILABLE",
        "DFLOW_OUTPUT_NOT_EXACT",
      ],
    });
    expect(Object.isFrozen(decision.reasons)).toBe(true);
  });

  it("requires every independent official contract before the gate can open", () => {
    const complete = {
      catalogContract: true,
      immutableMarketMintBinding: true,
      delegatedUserEligibility: true,
      revisionAndExpirySemantics: true,
      redemptionContract: true,
      exactOutcomeGuaranteed: true,
    } as const;
    expect(evaluateDflowDocumentationGate(complete)).toEqual({
      executable: true,
      reasons: [],
    });

    for (const key of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(
        evaluateDflowDocumentationGate({ ...complete, [key]: false }).executable,
        key,
      ).toBe(false);
    }
  });

  it("quarantines historical and lookalike prediction-market hosts", () => {
    expect(
      isQuarantinedDflowUrl(
        "https://a.prediction-markets-api.dflow.net/api/v1/markets",
      ),
    ).toBe(true);
    expect(isQuarantinedDflowUrl("https://b.quote-api.dflow.net/order")).toBe(true);
    expect(isQuarantinedDflowUrl("https://quote-api.dflow.net/order")).toBe(false);
  });
});
