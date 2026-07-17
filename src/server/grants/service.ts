import { PLATFORM_RISK_CEILINGS } from "@/contracts/platform";
import type { LiveVenueId } from "@/contracts/venues";

import type {
  AutomationGrantStore,
  GrantPolicyInput,
  PreparedAutomationGrantRecord,
  PreparedWalletGrant,
  PreparedWalletRevocation,
  PrivyPolicyClient,
  VenueGrantPolicy,
  VenuePolicyRegistry,
  WalletGrantPolicy,
} from "./types";

const MAX_GRANT_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;

export class GrantConflictError extends Error {
  override readonly name = "GrantConflictError";

  constructor() {
    super("Automation grant changed; reload before continuing");
  }
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} is required`);
}

function assertExpiry(expiresAt: Date, nowMs: number): number {
  const expiresAtMs = expiresAt.getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs) {
    throw new Error("Automation grant expiry must be in the future");
  }
  if (expiresAtMs - nowMs > MAX_GRANT_DURATION_MS) {
    throw new Error("Automation grants cannot exceed seven days");
  }
  return expiresAtMs;
}

function resolvePolicies(
  requests: readonly Readonly<{
    venueId: LiveVenueId;
    policyId: string;
    policyVersion: string;
    maxSpendMicros: number;
  }>[],
  registry: VenuePolicyRegistry,
): readonly Readonly<{ policy: VenueGrantPolicy; maxSpendMicros: number }>[] {
  if (requests.length === 0) throw new Error("At least one venue is required");
  const seen = new Set<LiveVenueId>();
  return Object.freeze(
    requests.map((request) => {
      if (seen.has(request.venueId)) throw new Error("Grant venues must be unique");
      seen.add(request.venueId);
      const policy = registry.resolve(request.venueId);
      if (
        request.policyId !== policy.policyId ||
        request.policyVersion !== policy.policyVersion
      ) {
        throw new Error(`Policy configuration for ${request.venueId} is stale or incorrect`);
      }
      if (
        !Number.isSafeInteger(request.maxSpendMicros) ||
        request.maxSpendMicros <= 0 ||
        request.maxSpendMicros > PLATFORM_RISK_CEILINGS.rolling24hMicros
      ) {
        throw new Error("Grant spend authority exceeds the platform rolling ceiling");
      }
      return Object.freeze({ policy, maxSpendMicros: request.maxSpendMicros });
    }),
  );
}

function bindWalletPolicies(
  foundation: Awaited<ReturnType<AutomationGrantStore["loadFoundation"]>>,
  resolved: readonly Readonly<{
    policy: VenueGrantPolicy;
    maxSpendMicros: number;
  }>[],
): readonly WalletGrantPolicy[] {
  const byChain = new Map<"evm" | "solana", typeof resolved>();
  for (const item of resolved) {
    byChain.set(item.policy.chain, [
      ...(byChain.get(item.policy.chain) ?? []),
      item,
    ]);
  }

  return Object.freeze(
    [...byChain.entries()].map(([chain, items]) => {
      const policies = new Set(items.map((item) => item.policy.policyId));
      const signers = new Set(items.map((item) => item.policy.signerId));
      if (policies.size !== 1 || signers.size !== 1) {
        // Privy currently supports only one override policy per signer.
        throw new Error(`A certified composite ${chain} policy is required`);
      }
      const wallets = foundation.wallets.filter((wallet) => wallet.chain === chain);
      if (wallets.length !== 1) {
        throw new Error(`Exactly one embedded ${chain} wallet is required`);
      }
      const wallet = wallets[0];
      const first = items[0];
      if (wallet === undefined || first === undefined) {
        throw new Error(`Exactly one embedded ${chain} wallet is required`);
      }
      return Object.freeze({
        walletId: wallet.walletId,
        walletAddress: wallet.address,
        chain,
        signerId: first.policy.signerId,
        policyId: first.policy.policyId,
        policyVersion: first.policy.policyVersion,
        venueIds: Object.freeze(items.map((item) => item.policy.venueId)),
        maxSpendMicros: Math.min(...items.map((item) => item.maxSpendMicros)),
      });
    }),
  );
}

function assertInstructions(
  policies: readonly WalletGrantPolicy[],
  instructions: readonly PreparedWalletGrant[],
): void {
  if (instructions.length !== policies.length) {
    throw new Error("Privy grant instruction set does not match the fixed policy set");
  }
  for (const policy of policies) {
    const instruction = instructions.find(
      (candidate) => candidate.walletId === policy.walletId,
    );
    if (
      instruction === undefined ||
      instruction.kind !== "privy-add-signers" ||
      instruction.walletAddress !== policy.walletAddress ||
      instruction.chain !== policy.chain ||
      instruction.signerId !== policy.signerId ||
      instruction.policyIds.length !== 1 ||
      instruction.policyIds[0] !== policy.policyId ||
      Object.keys(instruction).some(
        (key) =>
          ![
            "kind",
            "walletId",
            "walletAddress",
            "chain",
            "signerId",
            "policyIds",
          ].includes(key),
      )
    ) {
      throw new Error("Privy grant instruction set does not match the fixed policy set");
    }
  }
}

async function assertExactObservedAuthority(
  privy: PrivyPolicyClient,
  policy: WalletGrantPolicy,
): Promise<void> {
  const observed = await privy.inspectWalletGrant(policy.walletId);
  const signer = observed.additionalSigners[0];
  if (
    observed.walletId !== policy.walletId ||
    observed.additionalSigners.length !== 1 ||
    signer === undefined ||
    signer.signerId !== policy.signerId ||
    signer.policyIds.length !== 1 ||
    signer.policyIds[0] !== policy.policyId
  ) {
    throw new Error("Observed wallet authority does not exactly match the prepared grant");
  }
}

function activeOrThrow(
  record: PreparedAutomationGrantRecord | null,
): PreparedAutomationGrantRecord {
  if (record === null) throw new Error("Automation grant was not found");
  return record;
}

export function createAutomationGrantService(dependencies: {
  readonly store: AutomationGrantStore;
  readonly privy: PrivyPolicyClient;
  readonly policies: VenuePolicyRegistry;
  readonly now: () => number;
}) {
  const { store, privy, policies, now } = dependencies;

  return Object.freeze({
    async prepare(input: {
      readonly profileId: string;
      readonly expiresAt: Date;
      readonly expectedRiskVersion: number;
      readonly venues: readonly Readonly<{
        venueId: LiveVenueId;
        policyId: string;
        policyVersion: string;
        maxSpendMicros: number;
      }>[];
    }) {
      assertIdentifier(input.profileId, "Profile ID");
      const expiresAtMs = assertExpiry(input.expiresAt, now());
      if (!Number.isSafeInteger(input.expectedRiskVersion) || input.expectedRiskVersion < 1) {
        throw new Error("Expected risk version is invalid");
      }
      // Resolve every venue before loading wallets or producing consent actions.
      const resolved = resolvePolicies(input.venues, policies);
      const foundation = await store.loadFoundation(input.profileId);
      if (foundation.riskVersion !== input.expectedRiskVersion) {
        throw new Error("Automation grant risk version is stale");
      }
      const walletPolicies = bindWalletPolicies(foundation, resolved);
      const grantInput: GrantPolicyInput = {
        profileId: input.profileId,
        expiresAtMs,
        walletPolicies,
      };
      const actions = await privy.createGrantInstructions(grantInput);
      assertInstructions(walletPolicies, actions);
      const record = await store.createPrepared({
        profileId: input.profileId,
        riskVersion: input.expectedRiskVersion,
        expiresAtMs,
        walletPolicies,
      });
      return Object.freeze({ ...record, actions: Object.freeze([...actions]) });
    },

    async confirm(profileId: string, grantId: string) {
      assertIdentifier(profileId, "Profile ID");
      assertIdentifier(grantId, "Grant ID");
      const record = activeOrThrow(await store.getOwned(profileId, grantId));
      if (record.status === "ACTIVE") return record;
      if (record.status !== "PREPARED") {
        throw new Error("Automation grant is not awaiting confirmation");
      }
      if (record.expiresAtMs <= now()) throw new Error("Automation grant has expired");
      for (const policy of record.walletPolicies) {
        await assertExactObservedAuthority(privy, policy);
      }
      const activated = await store.compareAndSetStatus({
        profileId,
        grantId,
        expectedVersion: record.version,
        nextStatus: "ACTIVE",
      });
      if (activated === null) throw new GrantConflictError();
      return activated;
    },

    async beginRevocation(profileId: string, grantId: string) {
      assertIdentifier(profileId, "Profile ID");
      assertIdentifier(grantId, "Grant ID");
      const existing = activeOrThrow(await store.getOwned(profileId, grantId));
      let pending = existing;
      if (existing.status === "ACTIVE") {
        pending = activeOrThrow(
          await store.pauseAndBeginRevocation({
            profileId,
            grantId,
            expectedVersion: existing.version,
          }),
        );
      } else if (existing.status !== "REVOCATION_PENDING") {
        throw new Error("Only an active grant can begin revocation");
      }

      const actions: PreparedWalletRevocation[] = [];
      for (const policy of pending.walletPolicies) {
        try {
          await assertExactObservedAuthority(privy, policy);
        } catch {
          // removeSigners removes all signers, so unknown authority requires manual review.
          throw new Error(
            "Wallet signer authority requires manual review; revocation remains pending",
          );
        }
        actions.push(
          Object.freeze({
            kind: "privy-remove-all-signers",
            walletId: policy.walletId,
            walletAddress: policy.walletAddress,
            chain: policy.chain,
          }),
        );
      }
      return Object.freeze({ ...pending, actions: Object.freeze(actions) });
    },

    async confirmRevocation(profileId: string, grantId: string) {
      assertIdentifier(profileId, "Profile ID");
      assertIdentifier(grantId, "Grant ID");
      const record = activeOrThrow(await store.getOwned(profileId, grantId));
      if (record.status === "REVOKED") return record;
      if (record.status !== "REVOCATION_PENDING") {
        throw new Error("Automation grant is not awaiting revocation confirmation");
      }
      for (const policy of record.walletPolicies) {
        const observed = await privy.inspectWalletGrant(policy.walletId);
        if (observed.walletId !== policy.walletId || observed.additionalSigners.length !== 0) {
          throw new Error("Wallet signer authority remains; revocation stays pending");
        }
      }
      const revoked = await store.compareAndSetStatus({
        profileId,
        grantId,
        expectedVersion: record.version,
        nextStatus: "REVOKED",
      });
      if (revoked === null) throw new GrantConflictError();
      return revoked;
    },
  });
}
