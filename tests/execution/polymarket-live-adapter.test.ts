import { OrderSide, OrderType, SignatureType } from "@polymarket/client";
import { describe, expect, it, vi } from "vitest";

import { createExactShares, venueQuantity } from "@/core/live-money";
import {
  createPolymarketLiveAdapter,
  type PolymarketLiveAdapterBoundary,
  type PolymarketLiveMarketBinding,
} from "@/execution/venues/polymarket/adapter";
import type {
  ArtifactExecutionContext,
  LiveOrderIntent,
  OrderExecutionContext,
} from "@/execution/types";

const OWNER = "0x1111111111111111111111111111111111111111";
const DEPOSIT = "0x2222222222222222222222222222222222222222";
const EXCHANGE = "0xE111180000d2663C0091e4f400237545B87B996B";
const ZERO32 = `0x${"00".repeat(32)}`;
const RAW_SIGNATURE = `0x${"11".repeat(65)}`;
const WRAPPED_SIGNATURE = `0x${"22".repeat(317)}`;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

const market: PolymarketLiveMarketBinding = Object.freeze({
  schemaVersion: "polymarket-live-market-binding-v1",
  contractVersionId: "contract-v1",
  settlementSpecVersionId: "settlement-v1",
  oppositeTokenId: "123456789",
  exchangeAddress: EXCHANGE,
  depositWalletAddress: DEPOSIT,
  tickSizeMicros: 10_000,
  venueAccountRevision: "account-v1",
  evidenceHash: HASH_B,
});

const context: OrderExecutionContext = Object.freeze({
  profileId: "profile-1",
  wallet: Object.freeze({
    walletId: "wallet-1",
    chain: "evm",
    address: OWNER,
    network: "polygon",
    funderAddress: DEPOSIT,
  }),
  nowMs: 1_000,
  operationKind: "entry",
  operationAttemptId: "attempt-1",
  attemptKey: "attempt-key-1",
  subject: Object.freeze({
    bundleHash: HASH_A,
    bundleId: "bundle-1",
    legId: "leg-1",
  }),
});

const quantity = venueQuantity("1250000", 6);
const intent: LiveOrderIntent = Object.freeze({
  contractVersionId: "contract-v1",
  settlementSpecVersionId: "settlement-v1",
  desiredOutcome: "YES",
  acquisitionPath: Object.freeze({
    kind: "complete-set-sell-complement",
    orderSide: "SELL",
    orderOutcome: "NO",
    inventoryLotId: "lot-1",
    inventoryLotVersion: 1,
    inventoryReservationFence: 1,
    inventoryEvidenceHash: HASH_C,
  }),
  exactNetShares: createExactShares("5", "4"),
  grossVenueQuantity: quantity,
  minimumNetVenueQuantity: quantity,
  maximumNetVenueQuantity: quantity,
  netOutcomeBoundsHash: HASH_A,
  feeScheduleVersion: "fees-v1",
  limitPriceMicros: 390_000,
  maxSpendMicros: 1_250_000,
  expiresAt: 60_000,
});

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
      maker: DEPOSIT,
      makerAmount: 1_250_000n,
      metadata: ZERO32,
      salt: 123n,
      side: 1,
      signatureType: SignatureType.POLY_1271,
      signer: DEPOSIT,
      takerAmount: 487_500n,
      timestamp: 456n,
      tokenId: 123_456_789n,
    },
    name: "DepositWallet",
    salt: ZERO32,
    verifyingContract: DEPOSIT,
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

const signedOrder = Object.freeze({
  builder: ZERO32,
  expiration: 0,
  maker: DEPOSIT,
  makerAmount: "1250000",
  metadata: ZERO32,
  orderType: OrderType.FOK,
  salt: "123",
  side: OrderSide.SELL,
  signatureType: SignatureType.POLY_1271,
  signer: DEPOSIT,
  takerAmount: "487500",
  timestamp: "456",
  tokenId: "123456789",
  signature: WRAPPED_SIGNATURE,
});

function createBoundary(
  postResult: unknown = {
    ok: true,
    orderId: "order-1",
    status: "matched",
    makingAmount: "1.25",
    takingAmount: "0.4875",
    transactionsHashes: [],
    tradeIds: ["trade-1"],
  },
): PolymarketLiveAdapterBoundary {
  async function* workflow(): AsyncGenerator<unknown, typeof signedOrder, string> {
    const signature = yield { kind: "signOrder" as const, payload: typedData };
    expect(signature).toBe(RAW_SIGNATURE);
    return signedOrder;
  }
  return {
    resolveMarket: vi.fn(async () => market),
    assertReady: vi.fn(async () => undefined),
    prepareMarketOrder: vi.fn(async () => workflow()),
    signTypedData: vi.fn(async () => RAW_SIGNATURE),
    postOrder: vi.fn(async () => postResult),
    reconcile: vi.fn(async () => {
      throw new Error("not used");
    }),
    balances: vi.fn(async () => []),
    positions: vi.fn(async () => []),
  };
}

function signingContext(
  artifactHash: string,
): ArtifactExecutionContext<OrderExecutionContext> {
  return Object.freeze({
    ...context,
    artifactHash,
    submissionKey: "submission-1",
  });
}

describe("Polymarket live adapter", () => {
  it("prepares, signs, rechecks, and submits one exact-inventory FOK sell", async () => {
    const boundary = createBoundary();
    const adapter = createPolymarketLiveAdapter(boundary);

    const prepared = await adapter.prepare(context, intent);
    expect(prepared).toMatchObject({
      schemaVersion: "prepared-artifact-v1",
      venue: "polymarket",
      nativeSpendAtomic: "0",
      expiresAt: 60_000,
    });
    expect(boundary.prepareMarketOrder).toHaveBeenCalledWith(
      context,
      {
        tokenId: "123456789",
        side: OrderSide.SELL,
        shares: "1.25",
        minPrice: "0.39",
        orderType: OrderType.FOK,
      },
    );

    await expect(adapter.validate(context, intent, prepared)).resolves.toBeUndefined();
    const signed = await adapter.sign(
      signingContext(prepared.artifactHash),
      intent,
      prepared,
    );
    expect(boundary.signTypedData).toHaveBeenCalledWith(
      context,
      typedData,
    );
    await expect(
      adapter.simulate(signingContext(prepared.artifactHash), signed),
    ).resolves.toBeUndefined();
    await expect(
      adapter.submitOnce(signingContext(prepared.artifactHash), signed),
    ).resolves.toMatchObject({
      kind: "acked",
      locator: { venue: "polymarket", primaryId: "order-1" },
    });
    expect(boundary.postOrder).toHaveBeenCalledTimes(1);
    expect(boundary.assertReady).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "submit" }),
    );
  });

  it("rejects direct buys and a non-complementary outcome before SDK preparation", async () => {
    const boundary = createBoundary();
    const adapter = createPolymarketLiveAdapter(boundary);
    await expect(
      adapter.prepare(context, {
        ...intent,
        acquisitionPath: {
          kind: "direct-buy",
          orderSide: "BUY",
          orderOutcome: "YES",
        },
      }),
    ).rejects.toThrow(/exact inventory/i);
    await expect(
      adapter.prepare(context, {
        ...intent,
        acquisitionPath: { ...intent.acquisitionPath, orderOutcome: "YES" },
      }),
    ).rejects.toThrow(/complement/i);
    expect(boundary.prepareMarketOrder).not.toHaveBeenCalled();
  });

  it("rejects a changed prepared artifact before Privy signing", async () => {
    const boundary = createBoundary();
    const adapter = createPolymarketLiveAdapter(boundary);
    const prepared = await adapter.prepare(context, intent);
    const changed = {
      ...prepared,
      expiresAt: prepared.expiresAt === null ? 1 : prepared.expiresAt + 1,
    };

    await expect(
      adapter.sign(signingContext(prepared.artifactHash), intent, changed),
    ).rejects.toThrow(/artifact/i);
    expect(boundary.signTypedData).not.toHaveBeenCalled();
  });

  it("returns no guessed venue locator when the one POST is ambiguous", async () => {
    const boundary = createBoundary(Promise.reject(new Error("timeout")));
    const adapter = createPolymarketLiveAdapter(boundary);
    const prepared = await adapter.prepare(context, intent);
    const signed = await adapter.sign(
      signingContext(prepared.artifactHash),
      intent,
      prepared,
    );

    await expect(
      adapter.submitOnce(signingContext(prepared.artifactHash), signed),
    ).resolves.toMatchObject({ kind: "unknown", locator: null });
    expect(boundary.postOrder).toHaveBeenCalledTimes(1);
  });
});
