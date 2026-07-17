import type { PrivyClient } from "@privy-io/node";
import {
  OrderSide,
  OrderType,
  production,
  relayerApiKey,
  SignatureType,
  WalletType,
} from "@polymarket/client";
import { signerFrom } from "@polymarket/client/privy";
import { describe, expect, it, vi } from "vitest";

import { createVenueQuantity } from "@/core/live-money";
import {
  assertPinnedPolymarketProduction,
  assertExactSignedInventorySell,
  createExactInventorySellRequest,
  rejectDirectFokBuy,
} from "@/venues/polymarket/sdk-contract";

const HASH = "a".repeat(64);
const OWNER = "0x1111111111111111111111111111111111111111";
const RAW_SIGNATURE = `0x${"11".repeat(65)}` as const;
const WRAPPED_SIGNATURE = `0x${"11".repeat(317)}` as const;
const TX_HASH = `0x${"22".repeat(32)}` as const;

describe("official Polymarket SDK contract", () => {
  it("pins the current production chain, hosts, pUSD, exchanges, and deposit-wallet factory", () => {
    expect(() => assertPinnedPolymarketProduction(production)).not.toThrow();
    expect(production).toMatchObject({
      chainId: 137,
      clob: {
        rest: "https://clob.polymarket.com",
        market: { ws: "wss://ws-subscriptions-clob.polymarket.com/ws/market" },
        user: { ws: "wss://ws-subscriptions-clob.polymarket.com/ws/user" },
      },
      relayer: { rest: "https://relayer-v2.polymarket.com" },
      gamma: { rest: "https://gamma-api.polymarket.com" },
      walletDerivation: {
        depositWalletFactory: "0x00000000000Fb5C9ADea0298D729A0CB3823Cc07",
      },
      contracts: {
        collateralToken: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
        conditionalTokens: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
        standardExchange: "0xE111180000d2663C0091e4f400237545B87B996B",
        negRiskExchange: "0xe2222d279d744050d28e00520010520000310F59",
      },
    });
  });

  it("uses only the current relayer-key headers", async () => {
    const authorization = relayerApiKey({
      key: "relayer-key",
      address: OWNER,
    }) as unknown as {
      readonly isBuilderKey: boolean;
      readonly supportGasless: boolean;
      authorize(request: {
        method: string;
        path: string;
        body?: string;
      }): Promise<Record<string, string>>;
    };

    await expect(
      authorization.authorize({ method: "POST", path: "/submit", body: "{}" }),
    ).resolves.toEqual({
      RELAYER_API_KEY: "relayer-key",
      RELAYER_API_KEY_ADDRESS: OWNER,
    });
    expect(authorization.isBuilderKey).toBe(false);
    expect(authorization.supportGasless).toBe(true);
  });

  it("adapts the installed current Privy wallet API without exporting key material", async () => {
    const get = vi.fn(async () => ({ address: OWNER }));
    const signMessage = vi.fn(async () => ({ signature: RAW_SIGNATURE }));
    const signTypedData = vi.fn(async () => ({ signature: RAW_SIGNATURE }));
    const sendTransaction = vi.fn(async () => ({ hash: TX_HASH }));
    const fakePrivy = {
      wallets: () => ({
        get,
        ethereum: () => ({ signMessage, signTypedData, sendTransaction }),
      }),
    } as unknown as PrivyClient;
    const signer = signerFrom({ privy: fakePrivy, walletId: "wallet-1" });

    await expect(signer.getAddress()).resolves.toBe(OWNER);
    await expect(signer.signMessage("0x1234")).resolves.toBe(RAW_SIGNATURE);
    await expect(
      signer.signTypedData({
        domain: { chainId: 137, name: "txBet", version: "1" },
        message: { amount: 1n },
        primaryType: "Intent",
        types: { Intent: [{ name: "amount", type: "uint256" }] },
      }),
    ).resolves.toBe(RAW_SIGNATURE);
    const transaction = await signer.sendTransaction({
      chainId: 137,
      data: "0x",
      to: OWNER as Parameters<typeof signer.sendTransaction>[0]["to"],
      value: 0n,
    });

    expect(transaction.transactionHash).toBe(TX_HASH);
    expect(get).toHaveBeenCalledWith("wallet-1");
    expect(signTypedData).toHaveBeenCalledWith(
      "wallet-1",
      expect.objectContaining({
        params: expect.objectContaining({
          typed_data: expect.objectContaining({ message: { amount: "1" } }),
        }),
      }),
    );
    expect(sendTransaction).toHaveBeenCalledWith(
      "wallet-1",
      expect.objectContaining({ caip2: "eip155:137" }),
    );
  });
});

describe("exact-share Polymarket route", () => {
  it("uses pre-split inventory and FOK-sells the opposite outcome in exact shares", () => {
    expect(
      createExactInventorySellRequest({
        oppositeTokenId: "123456789",
        quantity: createVenueQuantity("1250000", 6, HASH),
        minimumPriceMicros: 390_000,
        tickSizeMicros: 10_000,
      }),
    ).toEqual({
      tokenId: "123456789",
      side: OrderSide.SELL,
      shares: "1.25",
      minPrice: "0.39",
      orderType: OrderType.FOK,
    });
  });

  it("fails closed for non-Polymarket precision and direct FOK buys", () => {
    expect(() =>
      createExactInventorySellRequest({
        oppositeTokenId: "1",
        quantity: createVenueQuantity("1", 7, HASH),
        minimumPriceMicros: 390_000,
        tickSizeMicros: 10_000,
      }),
    ).toThrow(/six-decimal/i);
    expect(() =>
      createExactInventorySellRequest({
        oppositeTokenId: "1",
        quantity: createVenueQuantity("1234567", 6, HASH),
        minimumPriceMicros: 390_000,
        tickSizeMicros: 10_000,
      }),
    ).toThrow(/two-decimal/i);
    expect(() =>
      createExactInventorySellRequest({
        oppositeTokenId: "1",
        quantity: createVenueQuantity("1250000", 6, HASH),
        minimumPriceMicros: 395_000,
        tickSizeMicros: 10_000,
      }),
    ).toThrow(/tick/i);
    expect(() =>
      createExactInventorySellRequest({
        oppositeTokenId: "1",
        quantity: createVenueQuantity("1250000", 6, HASH),
        minimumPriceMicros: 400_000,
        tickSizeMicros: 20_000,
      }),
    ).toThrow(/supported tick/i);
    expect(() => rejectDirectFokBuy()).toThrow(/not exact shares/i);
  });

  it("verifies exact atomic shares and deposit-wallet bindings after signing", () => {
    const signed = {
      maker: OWNER,
      makerAmount: "1250000",
      signer: OWNER,
      takerAmount: "487500",
      tokenId: "123456789",
      side: OrderSide.SELL,
      signatureType: SignatureType.POLY_1271,
      orderType: OrderType.FOK,
      signature: WRAPPED_SIGNATURE,
    };
    const expected = {
      depositWalletAddress: OWNER,
      quantityAtomic: "1250000",
      minimumProceedsAtomic: "487500",
      oppositeTokenId: "123456789",
    } as const;

    expect(() => assertExactSignedInventorySell(signed, expected)).not.toThrow();
    for (const mutation of [
      { makerAmount: "1230000" },
      { takerAmount: "487499" },
      { maker: "0x2222222222222222222222222222222222222222" },
      { signer: "0x2222222222222222222222222222222222222222" },
      { tokenId: "999" },
      { side: OrderSide.BUY },
      { signatureType: SignatureType.EOA },
      { orderType: OrderType.GTC },
      { signature: RAW_SIGNATURE },
    ]) {
      expect(() =>
        assertExactSignedInventorySell({ ...signed, ...mutation }, expected),
      ).toThrow();
    }
  });
});

describe("supported wallet type", () => {
  it("uses the current POLY_1271 deposit-wallet identity", () => {
    expect(WalletType.DEPOSIT_WALLET).toBe(3);
    expect(SignatureType.POLY_1271).toBe(3);
  });
});
