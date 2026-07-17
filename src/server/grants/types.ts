import type { LiveVenueId } from "@/contracts/venues";

import type { AutomationGrantStatus } from "./repository";

export type GrantWalletChain = "evm" | "solana";

export interface GrantWalletBinding {
  readonly walletId: string;
  readonly chain: GrantWalletChain;
  readonly address: string;
  readonly ownershipRevision: string;
}

export interface GrantFoundation {
  readonly riskVersion: number;
  readonly wallets: readonly GrantWalletBinding[];
}

export interface VenueGrantPolicy {
  readonly venueId: LiveVenueId;
  readonly chain: GrantWalletChain;
  readonly signerId: string;
  readonly policyId: string;
  readonly policyVersion: string;
}

export interface WalletGrantPolicy {
  readonly walletId: string;
  readonly walletAddress: string;
  readonly chain: GrantWalletChain;
  readonly signerId: string;
  readonly policyId: string;
  readonly policyVersion: string;
  readonly venueIds: readonly LiveVenueId[];
  readonly maxSpendMicros: number;
}

export interface GrantPolicyInput {
  readonly profileId: string;
  readonly expiresAtMs: number;
  readonly walletPolicies: readonly WalletGrantPolicy[];
}

/** This descriptor maps only to Privy's user-consented addSigners call. */
export interface PreparedWalletGrant {
  readonly kind: "privy-add-signers";
  readonly walletId: string;
  readonly walletAddress: string;
  readonly chain: GrantWalletChain;
  readonly signerId: string;
  readonly policyIds: readonly [string];
}

/** Privy's current React API removes every signer on one wallet. */
export interface PreparedWalletRevocation {
  readonly kind: "privy-remove-all-signers";
  readonly walletId: string;
  readonly walletAddress: string;
  readonly chain: GrantWalletChain;
}

export interface ObservedWalletGrant {
  readonly walletId: string;
  readonly additionalSigners: readonly Readonly<{
    signerId: string;
    policyIds: readonly string[];
  }>[];
  readonly observedAtMs: number;
}

export interface PrivyPolicyClient {
  createGrantInstructions(input: GrantPolicyInput): Promise<readonly PreparedWalletGrant[]>;
  inspectWalletGrant(walletId: string): Promise<ObservedWalletGrant>;
}

export interface PreparedGrantCreate {
  readonly profileId: string;
  readonly riskVersion: number;
  readonly expiresAtMs: number;
  readonly walletPolicies: readonly WalletGrantPolicy[];
}

export interface PreparedAutomationGrantRecord extends PreparedGrantCreate {
  readonly id: string;
  readonly status: AutomationGrantStatus;
  readonly version: number;
}

export interface AutomationGrantStore {
  loadFoundation(profileId: string): Promise<GrantFoundation>;
  createPrepared(input: PreparedGrantCreate): Promise<PreparedAutomationGrantRecord>;
  getOwned(
    profileId: string,
    grantId: string,
  ): Promise<PreparedAutomationGrantRecord | null>;
  compareAndSetStatus(input: {
    readonly profileId: string;
    readonly grantId: string;
    readonly expectedVersion: number;
    readonly nextStatus: AutomationGrantStatus;
  }): Promise<PreparedAutomationGrantRecord | null>;
  pauseAndBeginRevocation(input: {
    readonly profileId: string;
    readonly grantId: string;
    readonly expectedVersion: number;
  }): Promise<PreparedAutomationGrantRecord | null>;
}

export interface VenuePolicyRegistry {
  resolve(venueId: LiveVenueId): VenueGrantPolicy;
}
