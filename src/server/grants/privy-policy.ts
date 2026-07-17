import type { LiveVenueId } from "@/contracts/venues";

import type { VenueGrantPolicy, VenuePolicyRegistry } from "./types";

export type GrantPolicyRefusalCode =
  | "NO_LIVE_ADAPTER"
  | "NO_POLICY_CONFIGURATION";

export class GrantPolicyRefusal extends Error {
  override readonly name = "GrantPolicyRefusal";
  readonly code: GrantPolicyRefusalCode;
  readonly venueId: LiveVenueId;

  constructor(code: GrantPolicyRefusalCode, venueId: LiveVenueId) {
    super(
      code === "NO_LIVE_ADAPTER"
        ? `${venueId} has no live adapter and cannot receive signer authority`
        : `${venueId} has no certified fixed signer policy configuration`,
    );
    this.code = code;
    this.venueId = venueId;
  }
}

function configured(value: string, label: string): string {
  if (!/^[A-Za-z0-9._:-]{1,256}$/.test(value)) {
    throw new Error(`${label} must be a configured bounded identifier`);
  }
  return value;
}

export function createVenuePolicyRegistry(input: {
  readonly keyQuorumId: string;
  readonly polymarketPolicyId: string;
  readonly polymarketPolicyVersion: string;
}): VenuePolicyRegistry {
  const polymarket: VenueGrantPolicy = Object.freeze({
    venueId: "polymarket",
    chain: "evm",
    signerId: configured(input.keyQuorumId, "Privy key quorum"),
    policyId: configured(input.polymarketPolicyId, "Polymarket policy"),
    policyVersion: configured(
      input.polymarketPolicyVersion,
      "Polymarket policy version",
    ),
  });

  return Object.freeze({
    resolve(venueId: LiveVenueId): VenueGrantPolicy {
      switch (venueId) {
        case "polymarket":
          return polymarket;
        case "kalshi-dflow":
          throw new GrantPolicyRefusal("NO_LIVE_ADAPTER", venueId);
        case "opinion":
        case "predict-fun":
        case "limitless":
        case "sx-bet":
        case "hydromancer":
          throw new GrantPolicyRefusal("NO_POLICY_CONFIGURATION", venueId);
      }
    },
  });
}
