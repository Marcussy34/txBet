import { generateKeyPairSync } from "node:crypto";

import { PublicKey } from "@solana/web3.js";
import { describe, expect, it, vi } from "vitest";

import {
  PRIVY_DFLOW_API_HOST,
  PrivyDflowSignerError,
  createDflowPrivySigner,
  type DflowPrivySignerConfig,
  type PrivyDflowSignerSdkBoundary,
  type PrivyDflowSignerSdkClient,
} from "@/server/execution/dflow-privy-signer";

const USER_ID = "did:privy:user-1";
const WALLET_ADDRESS = new PublicKey(new Uint8Array(32).fill(7)).toBase58();
const AUTHORIZATION_PRIVATE_KEY = generateKeyPairSync("ec", {
  namedCurve: "P-256",
})
  .privateKey.export({ format: "der", type: "pkcs8" })
  .toString("base64");

const CONFIG: DflowPrivySignerConfig = {
  appId: "privy-app",
  appSecret: "privy-app-secret",
  authorizationPrivateKey: AUTHORIZATION_PRIVATE_KEY,
  keyQuorumId: "key-quorum-dflow",
  dflowPolicyId: "policy-dflow-world-cup",
};

const ELIGIBLE_WALLET = {
  id: "wallet-solana-1",
  address: WALLET_ADDRESS,
  chain_type: "solana",
  archived_at: null,
  exported_at: null,
  imported_at: null,
  additional_signers: [
    {
      signer_id: CONFIG.keyQuorumId,
      override_policy_ids: [CONFIG.dflowPolicyId],
    },
  ],
};

function sdk(input?: {
  readonly wallets?: readonly unknown[];
  readonly nextCursor?: string;
  readonly requestExpiry?: number | undefined;
  readonly signedResponse?: unknown;
}) {
  const signedResponse =
    input !== undefined && "signedResponse" in input
      ? input.signedResponse
      : {
          encoding: "base64",
          signed_transaction: "signed-transaction-base64",
        };
  const client: PrivyDflowSignerSdkClient = {
    listWallets: vi.fn().mockResolvedValue({
      data: input?.wallets ?? [ELIGIBLE_WALLET],
      nextCursor: input?.nextCursor ?? "",
    }),
    getRequestExpiry: vi.fn().mockReturnValue(input?.requestExpiry ?? 123_456),
    signTransaction: vi.fn().mockResolvedValue(signedResponse),
  };
  const boundary: PrivyDflowSignerSdkBoundary = {
    createClient: vi.fn().mockReturnValue(client),
  };
  return { boundary, client };
}

describe("createDflowPrivySigner", () => {
  it("resolves one delegated Solana wallet and signs through the official SDK shape", async () => {
    const { boundary, client } = sdk();
    const signer = createDflowPrivySigner(CONFIG, boundary);

    const wallet = await signer.resolveWallet(USER_ID);
    const signed = await signer.signTransaction({
      wallet,
      unsignedTransactionBase64: "unsigned-transaction-base64",
      idempotencyKey: "dflow.order_01-abc",
    });

    expect(boundary.createClient).toHaveBeenCalledWith({
      appId: CONFIG.appId,
      appSecret: CONFIG.appSecret,
      apiUrl: PRIVY_DFLOW_API_HOST,
      maxRetries: 1,
      timeout: 5_000,
    });
    expect(client.listWallets).toHaveBeenCalledTimes(2);
    expect(client.listWallets).toHaveBeenNthCalledWith(1, {
      user_id: USER_ID,
      chain_type: "solana",
      include_archived: false,
      limit: 2,
    });
    expect(client.getRequestExpiry).toHaveBeenCalledWith(60_000);
    expect(client.signTransaction).toHaveBeenCalledWith(ELIGIBLE_WALLET.id, {
      transaction: "unsigned-transaction-base64",
      idempotency_key: "dflow.order_01-abc",
      request_expiry: 123_456,
      authorization_context: {
        authorization_private_keys: [AUTHORIZATION_PRIVATE_KEY],
      },
    });
    expect(wallet).toEqual({
      id: ELIGIBLE_WALLET.id,
      address: WALLET_ADDRESS,
      userId: USER_ID,
    });
    expect(signed).toEqual({
      wallet,
      signedTransactionBase64: "signed-transaction-base64",
    });
    expect(Object.isFrozen(wallet)).toBe(true);
    expect(Object.isFrozen(signer)).toBe(true);
  });

  it.each([
    { field: "appId", value: "" },
    { field: "appSecret", value: " " },
    { field: "authorizationPrivateKey", value: "not-base64" },
    { field: "keyQuorumId", value: "" },
    { field: "dflowPolicyId", value: "\n" },
  ] as const)("rejects invalid $field before creating the SDK client", ({ field, value }) => {
    const { boundary } = sdk();

    expect(() =>
      createDflowPrivySigner({ ...CONFIG, [field]: value }, boundary),
    ).toThrowError(PrivyDflowSignerError);
    expect(boundary.createClient).not.toHaveBeenCalled();
  });

  it("requires a P-256 PKCS8 authorization private key", () => {
    const ed25519Key = generateKeyPairSync("ed25519")
      .privateKey.export({ format: "der", type: "pkcs8" })
      .toString("base64");

    expect(() =>
      createDflowPrivySigner(
        { ...CONFIG, authorizationPrivateKey: ed25519Key },
        sdk().boundary,
      ),
    ).toThrow(/configuration/i);
  });

  it("normalizes malformed runtime config to CONFIG_INVALID", () => {
    const malformedConfig = { ...CONFIG };
    Reflect.set(malformedConfig, "appId", undefined);

    expect(() => createDflowPrivySigner(malformedConfig, sdk().boundary)).toThrowError(
      expect.objectContaining({ code: "CONFIG_INVALID" }),
    );
  });

  it("redacts SDK client creation failures", () => {
    const upstreamSecret = "sdk-constructor-secret-never-echo";
    const boundary: PrivyDflowSignerSdkBoundary = {
      createClient: vi.fn(() => {
        throw new Error(upstreamSecret);
      }),
    };

    const error = (() => {
      try {
        createDflowPrivySigner(CONFIG, boundary);
      } catch (caught: unknown) {
        return caught;
      }
    })();

    expect(String(error)).not.toContain(upstreamSecret);
    expect(error).toMatchObject({ code: "CONFIG_INVALID" });
  });

  it.each([
    { name: "no wallet", wallets: [] },
    { name: "two wallets", wallets: [ELIGIBLE_WALLET, { ...ELIGIBLE_WALLET, id: "wallet-2" }] },
  ])("rejects $name", async ({ wallets }) => {
    const signer = createDflowPrivySigner(CONFIG, sdk({ wallets }).boundary);

    await expect(signer.resolveWallet(USER_ID)).rejects.toMatchObject({
      code: "WALLET_NOT_ELIGIBLE",
    });
  });

  it("rejects pagination because one returned wallet may not be the only wallet", async () => {
    const signer = createDflowPrivySigner(
      CONFIG,
      sdk({ nextCursor: "another-page" }).boundary,
    );

    await expect(signer.resolveWallet(USER_ID)).rejects.toMatchObject({
      code: "WALLET_NOT_ELIGIBLE",
    });
  });

  it.each([
    null,
    {},
    { data: {}, nextCursor: "" },
    { data: [ELIGIBLE_WALLET], nextCursor: 1 },
    { data: [ELIGIBLE_WALLET], nextCursor: null },
  ])("rejects malformed wallet page envelope %#", async (page) => {
    const testSdk = sdk();
    vi.mocked(testSdk.client.listWallets).mockResolvedValueOnce(page as never);
    const signer = createDflowPrivySigner(CONFIG, testSdk.boundary);

    await expect(signer.resolveWallet(USER_ID)).rejects.toMatchObject({
      code: "WALLET_NOT_ELIGIBLE",
    });
  });

  it.each([
    { name: "non-canonical address", patch: { address: `${WALLET_ADDRESS} ` } },
    { name: "wrong chain", patch: { chain_type: "ethereum" } },
    { name: "archived wallet", patch: { archived_at: 1 } },
    { name: "exported wallet", patch: { exported_at: 1 } },
    { name: "imported wallet", patch: { imported_at: 1 } },
    { name: "missing signer", patch: { additional_signers: [] } },
    {
      name: "extra signer",
      patch: {
        additional_signers: [
          ELIGIBLE_WALLET.additional_signers[0],
          { signer_id: "another", override_policy_ids: [CONFIG.dflowPolicyId] },
        ],
      },
    },
    {
      name: "wrong signer",
      patch: {
        additional_signers: [
          { signer_id: "wrong-quorum", override_policy_ids: [CONFIG.dflowPolicyId] },
        ],
      },
    },
    {
      name: "missing override policy",
      patch: { additional_signers: [{ signer_id: CONFIG.keyQuorumId }] },
    },
    {
      name: "wrong override policy",
      patch: {
        additional_signers: [
          { signer_id: CONFIG.keyQuorumId, override_policy_ids: ["wrong-policy"] },
        ],
      },
    },
    {
      name: "extra override policy",
      patch: {
        additional_signers: [
          {
            signer_id: CONFIG.keyQuorumId,
            override_policy_ids: [CONFIG.dflowPolicyId, "extra-policy"],
          },
        ],
      },
    },
  ])("rejects a wallet with $name", async ({ patch }) => {
    const signer = createDflowPrivySigner(
      CONFIG,
      sdk({ wallets: [{ ...ELIGIBLE_WALLET, ...patch }] }).boundary,
    );

    await expect(signer.resolveWallet(USER_ID)).rejects.toMatchObject({
      code: "WALLET_NOT_ELIGIBLE",
    });
  });

  it.each([
    {
      name: "wallet ID changed",
      wallet: { ...ELIGIBLE_WALLET, id: "replacement-wallet" },
      code: "WALLET_CHANGED",
    },
    {
      name: "wallet address changed",
      wallet: {
        ...ELIGIBLE_WALLET,
        address: new PublicKey(new Uint8Array(32).fill(8)).toBase58(),
      },
      code: "WALLET_CHANGED",
    },
    {
      name: "delegated signer revoked",
      wallet: { ...ELIGIBLE_WALLET, additional_signers: [] },
      code: "WALLET_NOT_ELIGIBLE",
    },
    {
      name: "override policy changed",
      wallet: {
        ...ELIGIBLE_WALLET,
        additional_signers: [
          { signer_id: CONFIG.keyQuorumId, override_policy_ids: ["replacement-policy"] },
        ],
      },
      code: "WALLET_NOT_ELIGIBLE",
    },
  ])("re-resolves and refuses to sign when $name", async ({ wallet: current, code }) => {
    const { boundary, client } = sdk();
    const signer = createDflowPrivySigner(CONFIG, boundary);
    const wallet = await signer.resolveWallet(USER_ID);
    vi.mocked(client.listWallets).mockResolvedValueOnce({
      data: [current],
      nextCursor: "",
    });

    await expect(
      signer.signTransaction({
        wallet,
        unsignedTransactionBase64: "unsigned",
        idempotencyKey: "dflow-order-1",
      }),
    ).rejects.toMatchObject({ code });
    expect(client.signTransaction).not.toHaveBeenCalled();
  });

  it.each(["", " has-space", "contains/slash", "a".repeat(129)])(
    "rejects unsafe idempotency key %j before signing",
    async (idempotencyKey) => {
      const { boundary, client } = sdk();
      const signer = createDflowPrivySigner(CONFIG, boundary);
      const wallet = await signer.resolveWallet(USER_ID);

      await expect(
        signer.signTransaction({
          wallet,
          unsignedTransactionBase64: "unsigned",
          idempotencyKey,
        }),
      ).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
      expect(client.signTransaction).not.toHaveBeenCalled();
    },
  );

  it("fails closed when request expiry is unavailable", async () => {
    const { boundary, client } = sdk({ requestExpiry: undefined });
    vi.mocked(client.getRequestExpiry).mockReturnValue(undefined);
    const signer = createDflowPrivySigner(CONFIG, boundary);
    const wallet = await signer.resolveWallet(USER_ID);

    await expect(
      signer.signTransaction({
        wallet,
        unsignedTransactionBase64: "unsigned",
        idempotencyKey: "dflow-order-1",
      }),
    ).rejects.toMatchObject({ code: "SIGNING_FAILED" });
    expect(client.signTransaction).not.toHaveBeenCalled();
  });

  it("redacts wallet lookup and signing SDK failures", async () => {
    const lookupSecret = "lookup-secret-never-echo";
    const lookup = sdk();
    vi.mocked(lookup.client.listWallets).mockRejectedValue(new Error(lookupSecret));
    const lookupSigner = createDflowPrivySigner(CONFIG, lookup.boundary);

    const lookupError = await lookupSigner.resolveWallet(USER_ID).catch((error: unknown) => error);
    expect(String(lookupError)).not.toContain(lookupSecret);
    expect(lookupError).toMatchObject({ code: "WALLET_LOOKUP_FAILED" });

    const signingSecret = "signing-secret-never-echo";
    const signing = sdk();
    const signingSigner = createDflowPrivySigner(CONFIG, signing.boundary);
    const wallet = await signingSigner.resolveWallet(USER_ID);
    vi.mocked(signing.client.signTransaction).mockRejectedValue(new Error(signingSecret));

    const signingError = await signingSigner
      .signTransaction({
        wallet,
        unsignedTransactionBase64: "unsigned",
        idempotencyKey: "dflow-order-1",
      })
      .catch((error: unknown) => error);
    expect(String(signingError)).not.toContain(signingSecret);
    expect(signingError).toMatchObject({ code: "SIGNING_FAILED" });
  });

  it.each([
    null,
    {},
    { encoding: "hex", signed_transaction: "signed" },
    { encoding: "base64", signed_transaction: "" },
  ])("rejects malformed signed transaction response %#", async (signedResponse) => {
    const testSdk = sdk({ signedResponse });
    const signer = createDflowPrivySigner(CONFIG, testSdk.boundary);
    const wallet = await signer.resolveWallet(USER_ID);

    await expect(
      signer.signTransaction({
        wallet,
        unsignedTransactionBase64: "unsigned",
        idempotencyKey: "dflow-order-1",
      }),
    ).rejects.toMatchObject({ code: "INVALID_SIGNING_RESPONSE" });
  });

  it("does not expose server credentials when serialized", () => {
    const serialized = JSON.stringify(createDflowPrivySigner(CONFIG, sdk().boundary));

    expect(serialized).not.toContain(CONFIG.appSecret);
    expect(serialized).not.toContain(CONFIG.authorizationPrivateKey);
  });
});
