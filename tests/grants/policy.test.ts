import { describe, expect, it } from "vitest";

import {
  GrantPolicyRefusal,
  createVenuePolicyRegistry,
} from "@/server/grants/privy-policy";

const registry = createVenuePolicyRegistry({
  keyQuorumId: "quorum-txbet",
  polymarketPolicyId: "policy-polymarket-v1",
  polymarketPolicyVersion: "2026-07-17",
});

describe("automation grant policy registry", () => {
  it("returns only the fixed Polymarket EVM policy", () => {
    expect(registry.resolve("polymarket")).toEqual({
      venueId: "polymarket",
      chain: "evm",
      signerId: "quorum-txbet",
      policyId: "policy-polymarket-v1",
      policyVersion: "2026-07-17",
    });
  });

  it("keeps Kalshi-through-DFlow structurally outside signer authority", () => {
    expect(() => registry.resolve("kalshi-dflow")).toThrowError(
      expect.objectContaining<Partial<GrantPolicyRefusal>>({
        code: "NO_LIVE_ADAPTER",
      }),
    );
  });

  it.each(["opinion", "predict-fun", "limitless", "sx-bet", "hydromancer"] as const)(
    "refuses %s until its exact policy is registered",
    (venueId) => {
      expect(() => registry.resolve(venueId)).toThrowError(
        expect.objectContaining<Partial<GrantPolicyRefusal>>({
          code: "NO_POLICY_CONFIGURATION",
        }),
      );
    },
  );

  it("rejects a missing quorum or policy instead of creating broad authority", () => {
    expect(() =>
      createVenuePolicyRegistry({
        keyQuorumId: "",
        polymarketPolicyId: "policy-polymarket-v1",
        polymarketPolicyVersion: "2026-07-17",
      }),
    ).toThrow("key quorum");
  });
});
