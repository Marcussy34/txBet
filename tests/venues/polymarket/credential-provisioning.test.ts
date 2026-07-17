import { describe, expect, it, vi } from "vitest";

import { EnvelopeKeyring } from "@/server/crypto/keyring";
import {
  provisionPolymarketCredentials,
  type PolymarketAccountBinding,
} from "@/venues/polymarket/credential-provisioning";

const NOW = 1_700_000_000_000;
const OWNER = "0x1111111111111111111111111111111111111111";
const DEPOSIT = "0x574548bC296A44a39a7828343FC262244f37a7e5";
const HASH = "a".repeat(64);
const KEYRING = new EnvelopeKeyring("active-v1", [
  { id: "active-v1", key: new Uint8Array(32).fill(9) },
]);

function accountBinding(): PolymarketAccountBinding {
  return {
    profileId: "00000000-0000-4000-8000-000000000001",
    venueAccountId: "00000000-0000-4000-8000-000000000011",
    accountRevision: "account-v1",
    ownerSignerAddress: OWNER,
    depositWalletAddress: DEPOSIT,
    orderSignerAddress: DEPOSIT,
    makerAddress: DEPOSIT,
    funderAddress: DEPOSIT,
    signatureType: 3,
  };
}

function preflight() {
  return {
    deployed: true,
    ownerVerified: true,
    observedAtMs: NOW - 500,
    expiresAtMs: NOW + 5_000,
    evidenceHash: HASH,
  } as const;
}

describe("Polymarket credential provisioning", () => {
  it("derives once through an exact account-bound client and persists only ciphertext", async () => {
    const createSecureClient = vi.fn(async () => ({
      account: { signer: OWNER, wallet: DEPOSIT, walletType: 3 },
      credentials: {
        key: "550e8400-e29b-41d4-a716-446655440000",
        secret: "c3VwZXItc2VjcmV0LWtleQ==",
        passphrase: "test-passphrase",
      },
    }));
    const persistEncryptedCredentials = vi.fn(async (record) => {
      expect(JSON.stringify(record)).not.toContain("c3VwZXItc2VjcmV0LWtleQ==");
      expect(record).toMatchObject({
        profileId: "00000000-0000-4000-8000-000000000001",
        venueAccountId: "00000000-0000-4000-8000-000000000011",
        accountRevision: "account-v1",
        credentialVersion: 1,
        envelope: { version: 1, keyId: "active-v1", algorithm: "A256GCM" },
      });
    });

    await expect(
      provisionPolymarketCredentials({
        nowMs: NOW,
        maximumPreflightAgeMs: 5_000,
        credentialVersion: 1,
        account: accountBinding(),
        deploymentPreflight: preflight(),
        keyring: KEYRING,
        createSecureClient,
        persistEncryptedCredentials,
      }),
    ).resolves.toMatchObject({
      kind: "ready",
      venueAccountId: "00000000-0000-4000-8000-000000000011",
      accountRevision: "account-v1",
      credentialVersion: 1,
      envelopeKeyId: "active-v1",
    });
    expect(createSecureClient).toHaveBeenCalledTimes(1);
    expect(createSecureClient).toHaveBeenCalledWith({
      ownerSignerAddress: OWNER,
      depositWalletAddress: DEPOSIT,
    });
    expect(persistEncryptedCredentials).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(await provisionResultShape())).not.toContain("passphrase");
  });

  it("rejects a deposit wallet that is not the pinned deterministic owner wallet", async () => {
    const createSecureClient = vi.fn();
    const wrongDeposit = "0x2222222222222222222222222222222222222222";
    const account = {
      ...accountBinding(),
      depositWalletAddress: wrongDeposit,
      orderSignerAddress: wrongDeposit,
      makerAddress: wrongDeposit,
      funderAddress: wrongDeposit,
    };

    await expect(
      provisionPolymarketCredentials({
        nowMs: NOW,
        maximumPreflightAgeMs: 5_000,
        credentialVersion: 1,
        account,
        deploymentPreflight: preflight(),
        keyring: KEYRING,
        createSecureClient,
        persistEncryptedCredentials: vi.fn(),
      }),
    ).rejects.toThrow(/deterministic deposit wallet/i);
    expect(createSecureClient).not.toHaveBeenCalled();
  });

  it.each([
    { deployed: false },
    { ownerVerified: false },
    { observedAtMs: NOW - 5_001 },
    { observedAtMs: NOW + 1 },
    { expiresAtMs: NOW },
    { evidenceHash: "not-a-hash" },
  ])("fails closed on an invalid deployment preflight: %j", async (mutation) => {
    const createSecureClient = vi.fn();
    await expect(
      provisionPolymarketCredentials({
        nowMs: NOW,
        maximumPreflightAgeMs: 5_000,
        credentialVersion: 1,
        account: accountBinding(),
        deploymentPreflight: { ...preflight(), ...mutation },
        keyring: KEYRING,
        createSecureClient,
        persistEncryptedCredentials: vi.fn(),
      }),
    ).rejects.toThrow(/preflight/i);
    expect(createSecureClient).not.toHaveBeenCalled();
  });

  it.each([
    { account: { signer: DEPOSIT, wallet: DEPOSIT, walletType: 3 } },
    { account: { signer: OWNER, wallet: OWNER, walletType: 3 } },
    { account: { signer: OWNER, wallet: DEPOSIT, walletType: 2 } },
  ])("rejects secure-client account drift without persistence", async (mutation) => {
    const persistEncryptedCredentials = vi.fn();
    await expect(
      provisionPolymarketCredentials({
        nowMs: NOW,
        maximumPreflightAgeMs: 5_000,
        credentialVersion: 1,
        account: accountBinding(),
        deploymentPreflight: preflight(),
        keyring: KEYRING,
        createSecureClient: async () => ({
          ...mutation,
          credentials: {
            key: "key",
            secret: "c3VwZXItc2VjcmV0LWtleQ==",
            passphrase: "passphrase",
          },
        }),
        persistEncryptedCredentials,
      }),
    ).rejects.toThrow(/account binding/i);
    expect(persistEncryptedCredentials).not.toHaveBeenCalled();
  });

  it("normalizes derivation ambiguity without retry or secret leakage", async () => {
    const createSecureClient = vi.fn(async () => {
      throw new Error("upstream response included sensitive-secret");
    });

    await expect(
      provisionPolymarketCredentials({
        nowMs: NOW,
        maximumPreflightAgeMs: 5_000,
        credentialVersion: 1,
        account: accountBinding(),
        deploymentPreflight: preflight(),
        keyring: KEYRING,
        createSecureClient,
        persistEncryptedCredentials: vi.fn(),
      }),
    ).rejects.toThrow("Polymarket credential derivation is unavailable");
    expect(createSecureClient).toHaveBeenCalledTimes(1);
  });
});

async function provisionResultShape() {
  return provisionPolymarketCredentials({
    nowMs: NOW,
    maximumPreflightAgeMs: 5_000,
    credentialVersion: 2,
    account: accountBinding(),
    deploymentPreflight: preflight(),
    keyring: KEYRING,
    createSecureClient: async () => ({
      account: { signer: OWNER, wallet: DEPOSIT, walletType: 3 },
      credentials: {
        key: "key",
        secret: "c3VwZXItc2VjcmV0LWtleQ==",
        passphrase: "passphrase",
      },
    }),
    persistEncryptedCredentials: async () => undefined,
  });
}
