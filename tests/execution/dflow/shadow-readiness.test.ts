import { describe, expect, it } from "vitest";

import { DFLOW_SHADOW_BLOCKING_REASONS } from "@/execution/venues/dflow/shadow-adapter";
import {
  DFLOW_PRODUCTION_ENDPOINTS,
  getDflowShadowReadiness,
} from "@/execution/venues/dflow/shadow-readiness";

describe("DFlow read-only shadow readiness", () => {
  it("reports only fixed endpoints and non-user shadow gates", () => {
    const readiness = getDflowShadowReadiness({
      fixedEndpointHealthy: true,
      sanitizedFixtureValid: true,
    });

    expect(readiness).toEqual({
      venue: "kalshi-dflow",
      shadowOnly: true,
      liveReady: false,
      shadowEvidenceReady: true,
      endpoints: DFLOW_PRODUCTION_ENDPOINTS,
      gates: {
        officialDocumentation: false,
        exactOutput: false,
        fixedEndpointHealthy: true,
        sanitizedFixtureValid: true,
      },
      blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
    });
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(readiness.gates)).toBe(true);
    expect(Object.isFrozen(readiness.endpoints)).toBe(true);
  });

  it("remains shadow-only when endpoint or fixture evidence is unavailable", () => {
    const readiness = getDflowShadowReadiness({
      fixedEndpointHealthy: false,
      sanitizedFixtureValid: false,
    });
    expect(readiness.liveReady).toBe(false);
    expect(readiness.shadowEvidenceReady).toBe(false);
    expect(readiness.blockingReasons).toEqual(DFLOW_SHADOW_BLOCKING_REASONS);
  });

  it("has no wallet, profile, balance, eligibility, redemption, or mutation surface", () => {
    const readiness = getDflowShadowReadiness({
      fixedEndpointHealthy: true,
      sanitizedFixtureValid: true,
    });
    for (const field of [
      "wallet",
      "profile",
      "balance",
      "position",
      "eligibility",
      "redemption",
      "prepare",
      "reserve",
      "sign",
      "submit",
      "cleanup",
    ]) {
      expect(readiness).not.toHaveProperty(field);
    }
  });
});
