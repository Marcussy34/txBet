import { describe, expect, it, vi } from "vitest";

import {
  createIdentityRepository,
  WalletOwnershipConflictError,
} from "@/server/identity/repository";
import type { DbTransaction } from "@/server/db/types";

describe("identity repository", () => {
  it("keys profiles by Privy DID and never merges by email", async () => {
    const query = vi.fn(async (text: string, values?: readonly unknown[]) => ({
      rows: [
        {
          id: "00000000-0000-4000-8000-000000000001",
          privy_did: values?.[0],
          verified_email: values?.[1],
          is_operator: false,
          version: "1",
        },
      ],
      rowCount: 1,
    }));
    const repository = createIdentityRepository({ query } as DbTransaction);

    await repository.upsertProfile({
      privyDid: "did:privy:user-1",
      verifiedEmail: "person@example.com",
      isOperator: false,
    });

    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toContain("on conflict (privy_did)");
    expect(sql).not.toContain("on conflict (verified_email)");
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(values).toEqual(["did:privy:user-1", "person@example.com", false]);
  });

  it("does not recover a duplicate-email conflict by attaching a new DID", async () => {
    const duplicate = Object.assign(new Error("duplicate email"), { code: "23505" });
    const query = vi.fn().mockRejectedValue(duplicate);
    const repository = createIdentityRepository({ query } as DbTransaction);

    await expect(
      repository.upsertProfile({
        privyDid: "did:privy:attacker",
        verifiedEmail: "owned@example.com",
        isOperator: false,
      }),
    ).rejects.toBe(duplicate);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("upserts an owned wallet idempotently with parameterized SQL", async () => {
    const query = vi.fn(async (...args: [text: string, values?: readonly unknown[]]) => {
      void args;
      return {
        rows: [
          {
            id: "00000000-0000-4000-8000-000000000011",
            profile_id: "00000000-0000-4000-8000-000000000001",
            privy_wallet_id: "wallet-1",
            chain: "evm",
            address: "0x1111111111111111111111111111111111111111",
            ownership_revision: "revision-1",
            version: "1",
          },
        ],
        rowCount: 1,
      };
    });
    const repository = createIdentityRepository({ query } as DbTransaction);

    await repository.upsertWallet({
      profileId: "00000000-0000-4000-8000-000000000001",
      privyWalletId: "wallet-1",
      chain: "evm",
      address: "0x1111111111111111111111111111111111111111",
      ownershipRevision: "revision-1",
    });

    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toContain("on conflict (privy_wallet_id)");
    expect(sql).toContain("wallets.profile_id = excluded.profile_id");
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(values).toHaveLength(5);
  });

  it("rejects a wallet that is already owned by another profile", async () => {
    const repository = createIdentityRepository({
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as DbTransaction);

    await expect(
      repository.upsertWallet({
        profileId: "00000000-0000-4000-8000-000000000002",
        privyWalletId: "wallet-owned-by-profile-1",
        chain: "solana",
        address: "11111111111111111111111111111111",
        ownershipRevision: "revision-1",
      }),
    ).rejects.toBeInstanceOf(WalletOwnershipConflictError);
  });
});
