import { OrderSide, OrderType, SignatureType } from "@polymarket/client";
import { describe, expect, it, vi } from "vitest";

import {
  beginExactInventorySellSigning,
  completeExactInventorySellSigning,
  driveExactInventorySellSigning,
  extractExactInventorySellTypedData,
} from "@/venues/polymarket/order-workflow";

const OWNER = "0x1111111111111111111111111111111111111111";
const EXCHANGE = "0xE111180000d2663C0091e4f400237545B87B996B";
const ZERO32 = `0x${"00".repeat(32)}`;
const RAW_SIGNATURE = `0x${"11".repeat(65)}`;
const WRAPPED_SIGNATURE = `0x${"22".repeat(317)}`;

const expected = {
  depositWalletAddress: OWNER,
  exchangeAddress: EXCHANGE,
  quantityAtomic: "1250000",
  minimumProceedsAtomic: "487500",
  oppositeTokenId: "123456789",
} as const;

const orderFields = [
  { name: "salt", type: "uint256" },
  { name: "maker", type: "address" },
  { name: "signer", type: "address" },
  { name: "tokenId", type: "uint256" },
  { name: "makerAmount", type: "uint256" },
  { name: "takerAmount", type: "uint256" },
  { name: "side", type: "uint8" },
  { name: "signatureType", type: "uint8" },
  { name: "timestamp", type: "uint256" },
  { name: "metadata", type: "bytes32" },
  { name: "builder", type: "bytes32" },
] as const;

const typedData = {
  domain: {
    chainId: 137,
    name: "Polymarket CTF Exchange",
    verifyingContract: EXCHANGE,
    version: "2",
  },
  message: {
    chainId: 137,
    contents: {
      builder: ZERO32,
      maker: OWNER,
      makerAmount: 1_250_000n,
      metadata: ZERO32,
      salt: 123n,
      side: 1,
      signatureType: SignatureType.POLY_1271,
      signer: OWNER,
      takerAmount: 487_500n,
      timestamp: 456n,
      tokenId: 123_456_789n,
    },
    name: "DepositWallet",
    salt: ZERO32,
    verifyingContract: OWNER,
    version: "1",
  },
  primaryType: "TypedDataSign",
  types: {
    Order: orderFields,
    TypedDataSign: [
      { name: "contents", type: "Order" },
      { name: "name", type: "string" },
      { name: "version", type: "string" },
      { name: "chainId", type: "uint256" },
      { name: "verifyingContract", type: "address" },
      { name: "salt", type: "bytes32" },
    ],
  },
};

const signedOrder = {
  builder: ZERO32,
  expiration: 0,
  maker: OWNER,
  makerAmount: "1250000",
  metadata: ZERO32,
  orderType: OrderType.FOK,
  salt: "123",
  side: OrderSide.SELL,
  signatureType: SignatureType.POLY_1271,
  signer: OWNER,
  takerAmount: "487500",
  timestamp: "456",
  tokenId: "123456789",
  signature: WRAPPED_SIGNATURE,
};

describe("manual Polymarket signing boundary", () => {
  it("can persist the typed boundary before a later signing phase", async () => {
    async function* workflow(): AsyncGenerator<unknown, typeof signedOrder, string> {
      const rawSignature = yield { kind: "signOrder" as const, payload: typedData };
      expect(rawSignature).toBe(RAW_SIGNATURE);
      return signedOrder;
    }
    const pending = workflow();

    const prepared = await beginExactInventorySellSigning({
      expected,
      workflow: pending,
    });

    expect(prepared.evidence).toMatchObject({
      makerAmount: "1250000",
      takerAmount: "487500",
      tokenId: "123456789",
    });
    await expect(
      completeExactInventorySellSigning({
        expected,
        workflow: pending,
        evidence: prepared.evidence,
        rawSignature: RAW_SIGNATURE,
      }),
    ).resolves.toEqual(signedOrder);
  });

  it("normalizes the complete deposit-wallet typed payload before signing", () => {
    expect(extractExactInventorySellTypedData(typedData, expected)).toEqual({
      schemaVersion: "polymarket-typed-inventory-sell-v1",
      chainId: 137,
      exchangeAddress: EXCHANGE,
      maker: OWNER,
      signer: OWNER,
      tokenId: "123456789",
      makerAmount: "1250000",
      takerAmount: "487500",
      side: OrderSide.SELL,
      signatureType: SignatureType.POLY_1271,
      salt: "123",
      timestamp: "456",
      expiration: 0,
      metadata: ZERO32,
      builder: ZERO32,
      outerDomainName: "DepositWallet",
      outerDomainVersion: "1",
      outerDomainSalt: ZERO32,
    });
  });

  it("persists typed evidence before signing and wrapped evidence before returning", async () => {
    const calls: string[] = [];
    async function* workflow(): AsyncGenerator<unknown, typeof signedOrder, string> {
      const rawSignature = yield { kind: "signOrder" as const, payload: typedData };
      expect(rawSignature).toBe(RAW_SIGNATURE);
      return signedOrder;
    }
    const persistPrepared = vi.fn(async () => {
      calls.push("persist-prepared");
    });
    const signTypedData = vi.fn(async () => {
      calls.push("sign");
      return RAW_SIGNATURE;
    });
    const persistSigned = vi.fn(async () => {
      calls.push("persist-signed");
    });

    await expect(
      driveExactInventorySellSigning({
        expected,
        workflow: workflow(),
        persistPrepared,
        signTypedData,
        persistSigned,
      }),
    ).resolves.toEqual(signedOrder);

    expect(calls).toEqual(["persist-prepared", "sign", "persist-signed"]);
    expect(signTypedData).toHaveBeenCalledWith(typedData);
  });

  it("fails before signing for any exposure-defining typed-data mutation", async () => {
    for (const contentsMutation of [
      { makerAmount: 1_240_000n },
      { takerAmount: 487_499n },
      { tokenId: 999n },
      { side: 0 },
      { signatureType: SignatureType.EOA },
      { maker: "0x2222222222222222222222222222222222222222" },
      { signer: "0x2222222222222222222222222222222222222222" },
      { metadata: `0x${"01".repeat(32)}` },
      { builder: `0x${"01".repeat(32)}` },
    ]) {
      const signTypedData = vi.fn(async () => RAW_SIGNATURE);
      async function* workflow() {
        yield {
          kind: "signOrder" as const,
          payload: {
            ...typedData,
            message: {
              ...typedData.message,
              contents: { ...typedData.message.contents, ...contentsMutation },
            },
          },
        };
        return signedOrder;
      }

      await expect(
        driveExactInventorySellSigning({
          expected,
          workflow: workflow(),
          persistPrepared: async () => undefined,
          signTypedData,
          persistSigned: async () => undefined,
        }),
      ).rejects.toThrow();
      expect(signTypedData).not.toHaveBeenCalled();
    }
  });

  it("rejects a signed order that differs from the persisted typed payload", async () => {
    const persistSigned = vi.fn(async () => undefined);
    async function* workflow() {
      yield { kind: "signOrder" as const, payload: typedData };
      return { ...signedOrder, timestamp: "457" };
    }

    await expect(
      driveExactInventorySellSigning({
        expected,
        workflow: workflow(),
        persistPrepared: async () => undefined,
        signTypedData: async () => RAW_SIGNATURE,
        persistSigned,
      }),
    ).rejects.toThrow(/typed payload/i);
    expect(persistSigned).not.toHaveBeenCalled();
  });
});
