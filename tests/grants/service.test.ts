import { beforeEach, describe, expect, it, vi } from "vitest";

import { createVenuePolicyRegistry } from "@/server/grants/privy-policy";
import { createAutomationGrantService } from "@/server/grants/service";
import type {
  AutomationGrantStore,
  GrantFoundation,
  PreparedAutomationGrantRecord,
  PrivyPolicyClient,
} from "@/server/grants/types";

const profileId = "00000000-0000-4000-8000-000000000001";
const grantId = "00000000-0000-4000-8000-000000000101";
const nowMs = Date.parse("2026-07-17T00:00:00.000Z");

function foundation(): GrantFoundation {
  return {
    riskVersion: 4,
    wallets: [
      {
        walletId: "wallet-evm",
        chain: "evm",
        address: "0x1111111111111111111111111111111111111111",
        ownershipRevision: "evm-revision-1",
      },
      {
        walletId: "wallet-solana",
        chain: "solana",
        address: "11111111111111111111111111111111",
        ownershipRevision: "solana-revision-1",
      },
    ],
  };
}

function preparedRecord(): PreparedAutomationGrantRecord {
  return {
    id: grantId,
    profileId,
    status: "PREPARED",
    version: 1,
    riskVersion: 4,
    expiresAtMs: nowMs + 86_400_000,
    walletPolicies: [
      {
        walletId: "wallet-evm",
        walletAddress: "0x1111111111111111111111111111111111111111",
        chain: "evm",
        signerId: "quorum-txbet",
        policyId: "policy-polymarket-v1",
        policyVersion: "2026-07-17",
        venueIds: ["polymarket"],
        maxSpendMicros: 10_000_000,
      },
    ],
  };
}

function harness() {
  let record: PreparedAutomationGrantRecord | null = null;
  let currentFoundation = foundation();
  const events: string[] = [];

  const store: AutomationGrantStore = {
    async loadFoundation() {
      return currentFoundation;
    },
    async createPrepared(input) {
      events.push("persist:PREPARED");
      record = { ...input, id: grantId, status: "PREPARED", version: 1 };
      return record;
    },
    async getOwned(requestedProfileId, requestedGrantId) {
      return requestedProfileId === profileId && requestedGrantId === grantId
        ? record
        : null;
    },
    async compareAndSetStatus(input) {
      events.push(`persist:${input.nextStatus}`);
      if (record === null || record.version !== input.expectedVersion) return null;
      record = { ...record, status: input.nextStatus, version: record.version + 1 };
      return record;
    },
    async pauseAndBeginRevocation(input) {
      events.push("pause-and-persist:REVOCATION_PENDING");
      if (record === null || record.version !== input.expectedVersion) return null;
      record = {
        ...record,
        status: "REVOCATION_PENDING",
        version: record.version + 1,
      };
      return record;
    },
  };

  const privy: PrivyPolicyClient = {
    async createGrantInstructions(input) {
      events.push("build-browser-instructions");
      return input.walletPolicies.map((wallet) => ({
        kind: "privy-add-signers" as const,
        walletId: wallet.walletId,
        walletAddress: wallet.walletAddress,
        chain: wallet.chain,
        signerId: wallet.signerId,
        policyIds: [wallet.policyId] as const,
      }));
    },
    inspectWalletGrant: vi.fn(async (walletId: string) => ({
      walletId,
      additionalSigners: [
        { signerId: "quorum-txbet", policyIds: ["policy-polymarket-v1"] },
      ],
      observedAtMs: nowMs,
    })),
  };

  const service = createAutomationGrantService({
    store,
    privy,
    policies: createVenuePolicyRegistry({
      keyQuorumId: "quorum-txbet",
      polymarketPolicyId: "policy-polymarket-v1",
      polymarketPolicyVersion: "2026-07-17",
    }),
    now: () => nowMs,
  });

  return {
    service,
    privy,
    events,
    setRecord(value: PreparedAutomationGrantRecord | null) {
      record = value;
    },
    getRecord() {
      return record;
    },
    setFoundation(value: GrantFoundation) {
      currentFoundation = value;
    },
  };
}

const validInput = {
  profileId,
  expiresAt: new Date(nowMs + 86_400_000),
  expectedRiskVersion: 4,
  venues: [
    {
      venueId: "polymarket" as const,
      policyId: "policy-polymarket-v1",
      policyVersion: "2026-07-17",
      maxSpendMicros: 10_000_000,
    },
  ],
};

describe("automation grant service", () => {
  let state: ReturnType<typeof harness>;

  beforeEach(() => {
    state = harness();
  });

  it("persists PREPARED before returning fixed browser actions", async () => {
    const prepared = await state.service.prepare(validInput);

    expect(state.events).toEqual([
      "build-browser-instructions",
      "persist:PREPARED",
    ]);
    expect(prepared.actions).toEqual([
      {
        kind: "privy-add-signers",
        walletId: "wallet-evm",
        walletAddress: "0x1111111111111111111111111111111111111111",
        chain: "evm",
        signerId: "quorum-txbet",
        policyIds: ["policy-polymarket-v1"],
      },
    ]);
    expect(prepared.actions[0]).not.toHaveProperty("calldata");
    expect(prepared.actions[0]).not.toHaveProperty("transaction");
  });

  it("rejects grants longer than seven days before touching dependencies", async () => {
    await expect(
      state.service.prepare({
        ...validInput,
        expiresAt: new Date(nowMs + 7 * 86_400_000 + 1),
      }),
    ).rejects.toThrow("seven days");
    expect(state.events).toEqual([]);
  });

  it("rejects a stale risk version and a missing required wallet", async () => {
    await expect(
      state.service.prepare({ ...validInput, expectedRiskVersion: 3 }),
    ).rejects.toThrow("risk version");

    state.setFoundation({ riskVersion: 4, wallets: foundation().wallets.slice(1) });
    await expect(state.service.prepare(validInput)).rejects.toThrow("evm wallet");
  });

  it("refuses DFlow before requesting any signer authority", async () => {
    await expect(
      state.service.prepare({
        ...validInput,
        venues: [
          {
            venueId: "kalshi-dflow",
            policyId: "not-applicable",
            policyVersion: "not-applicable",
            maxSpendMicros: 1,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "NO_LIVE_ADAPTER" });
    expect(state.events).toEqual([]);
  });

  it("activates only after exact signer and policy inspection", async () => {
    state.setRecord(preparedRecord());
    const confirmed = await state.service.confirm(profileId, grantId);
    expect(confirmed.status).toBe("ACTIVE");
    expect(state.events).toEqual(["persist:ACTIVE"]);
  });

  it.each([
    {
      name: "missing signer",
      signers: [],
    },
    {
      name: "wrong signer",
      signers: [{ signerId: "quorum-other", policyIds: ["policy-polymarket-v1"] }],
    },
    {
      name: "wrong policy",
      signers: [{ signerId: "quorum-txbet", policyIds: ["policy-other"] }],
    },
    {
      name: "unexpected extra authority",
      signers: [
        { signerId: "quorum-txbet", policyIds: ["policy-polymarket-v1"] },
        { signerId: "quorum-other", policyIds: ["policy-other"] },
      ],
    },
  ])("keeps PREPARED for $name", async ({ signers }) => {
    state.setRecord(preparedRecord());
    vi.mocked(state.privy.inspectWalletGrant).mockResolvedValue({
      walletId: "wallet-evm",
      additionalSigners: signers,
      observedAtMs: nowMs,
    });

    await expect(state.service.confirm(profileId, grantId)).rejects.toThrow(
      "exactly match",
    );
    expect(state.getRecord()?.status).toBe("PREPARED");
  });

  it("rejects confirmation after expiry and makes duplicate confirmation idempotent", async () => {
    state.setRecord({ ...preparedRecord(), expiresAtMs: nowMs });
    await expect(state.service.confirm(profileId, grantId)).rejects.toThrow("expired");

    state.setRecord({ ...preparedRecord(), status: "ACTIVE", version: 2 });
    await expect(state.service.confirm(profileId, grantId)).resolves.toMatchObject({
      status: "ACTIVE",
      version: 2,
    });
    expect(state.events).toEqual([]);
  });

  it("pauses first and only returns remove-all when txBet is the sole signer", async () => {
    state.setRecord({ ...preparedRecord(), status: "ACTIVE", version: 2 });
    const pending = await state.service.beginRevocation(profileId, grantId);

    expect(state.events[0]).toBe("pause-and-persist:REVOCATION_PENDING");
    expect(pending.actions).toEqual([
      {
        kind: "privy-remove-all-signers",
        walletId: "wallet-evm",
        walletAddress: "0x1111111111111111111111111111111111111111",
        chain: "evm",
      },
    ]);
  });

  it("keeps revocation pending on unexpected authority or incomplete removal", async () => {
    state.setRecord({ ...preparedRecord(), status: "ACTIVE", version: 2 });
    vi.mocked(state.privy.inspectWalletGrant).mockResolvedValueOnce({
      walletId: "wallet-evm",
      additionalSigners: [
        { signerId: "quorum-other", policyIds: ["policy-other"] },
      ],
      observedAtMs: nowMs,
    });
    await expect(state.service.beginRevocation(profileId, grantId)).rejects.toThrow(
      "manual review",
    );
    expect(state.getRecord()?.status).toBe("REVOCATION_PENDING");

    vi.mocked(state.privy.inspectWalletGrant).mockResolvedValue({
      walletId: "wallet-evm",
      additionalSigners: [
        { signerId: "quorum-txbet", policyIds: ["policy-polymarket-v1"] },
      ],
      observedAtMs: nowMs,
    });
    await expect(state.service.confirmRevocation(profileId, grantId)).rejects.toThrow(
      "remains",
    );
    expect(state.getRecord()?.status).toBe("REVOCATION_PENDING");
  });

  it("marks a grant revoked only after no signer authority remains", async () => {
    state.setRecord({
      ...preparedRecord(),
      status: "REVOCATION_PENDING",
      version: 3,
    });
    vi.mocked(state.privy.inspectWalletGrant).mockResolvedValue({
      walletId: "wallet-evm",
      additionalSigners: [],
      observedAtMs: nowMs,
    });

    await expect(state.service.confirmRevocation(profileId, grantId)).resolves.toMatchObject({
      status: "REVOKED",
    });
  });
});
