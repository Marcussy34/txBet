import {
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  DFLOW_CANONICAL_SOLANA_USDC_MINT,
  parseDflowLiveOrderResponse,
} from "@/execution/venues/dflow/live-order";

const OUTCOME_MINT = new PublicKey(
  Uint8Array.from({ length: 32 }, () => 7),
).toBase58();
const BLOCKHASH = new PublicKey(
  Uint8Array.from({ length: 32 }, () => 8),
).toBase58();

function transactionBase64(withLookup = false): string {
  const wallet = Keypair.generate();
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [],
  }).compileToV0Message();
  if (withLookup) {
    message.addressTableLookups.push({
      accountKey: new PublicKey(Uint8Array.from({ length: 32 }, () => 9)),
      writableIndexes: [],
      readonlyIndexes: [0],
    });
  }
  return Buffer.from(new VersionedTransaction(message).serialize()).toString(
    "base64",
  );
}

const expectation = {
  outputMint: OUTCOME_MINT,
  amountAtomic: "1000000" as const,
  minimumOutputAtomic: "1800000" as const,
  slippageBps: 50,
  predictionMarketSlippageBps: 75,
  maximumPrioritizationFeeLamports: 10_000,
  maximumInitPredictionMarketCostLamports: 2_000_000,
};

function response(overrides: Record<string, unknown> = {}) {
  return {
    inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
    inAmount: "1000000",
    outputMint: OUTCOME_MINT,
    outAmount: "2000000",
    otherAmountThreshold: "1900000",
    minOutAmount: "1900000",
    slippageBps: 50,
    predictionMarketSlippageBps: 75,
    priceImpactPct: "0.01",
    contextSlot: 123,
    executionMode: "async",
    isNativePredictionMarketOutput: true,
    computeUnitLimit: 200_000,
    initPredictionMarketCost: 1_000_000,
    lastValidBlockHeight: 500,
    platformFee: null,
    predictionMarketInitPayerMustSign: true,
    prioritizationFeeLamports: 5_000,
    prioritizationType: {
      computeBudget: {
        microLamports: 25_000,
        estimatedMicroLamports: 24_000,
      },
    },
    revertMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
    transaction: transactionBase64(),
    ...overrides,
  };
}

describe("live DFlow exact-input order response", () => {
  it("accepts and freezes one bounded, asynchronous, lookup-free prediction order", () => {
    const payload = response();
    const order = parseDflowLiveOrderResponse(payload, expectation);

    expect(order).toMatchObject({
      inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
      inputAtomic: "1000000",
      outputMint: OUTCOME_MINT,
      expectedOutputAtomic: "2000000",
      minimumOutputAtomic: "1900000",
      executionMode: "async",
      contextSlot: 123,
      lastValidBlockHeight: 500,
      prioritizationFeeLamports: 5_000,
      initPredictionMarketCostLamports: 1_000_000,
    });
    expect(order.transactionBase64).toBe(payload.transaction);
    expect(Object.isFrozen(order)).toBe(true);
  });

  it.each([
    ["input mint", { inputMint: OUTCOME_MINT }],
    ["output mint", { outputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT }],
    ["input amount", { inAmount: "999999" }],
    ["minimum fields", { minOutAmount: "1899999" }],
    ["expected below minimum", { outAmount: "1899999" }],
    ["user minimum", { minOutAmount: "1700000", otherAmountThreshold: "1700000" }],
    ["native prediction output", { isNativePredictionMarketOutput: false }],
    ["async execution", { executionMode: "sync" }],
    ["revert mint", { revertMint: OUTCOME_MINT }],
    ["routing slippage", { slippageBps: 51 }],
    ["prediction slippage", { predictionMarketSlippageBps: 76 }],
    ["priority fee cap", { prioritizationFeeLamports: 10_001 }],
    ["initialization fee cap", { initPredictionMarketCost: 2_000_001 }],
    ["platform fee", { platformFee: { amount: "1", feeBps: 1 } }],
  ])("rejects a mismatch in %s", (_label, override) => {
    expect(() =>
      parseDflowLiveOrderResponse(response(override), expectation),
    ).toThrow();
  });

  it("rejects unsafe integers, undocumented fields, and response lookup tables", () => {
    expect(() =>
      parseDflowLiveOrderResponse(
        response({ contextSlot: Number.MAX_SAFE_INTEGER + 1 }),
        expectation,
      ),
    ).toThrow();
    expect(() =>
      parseDflowLiveOrderResponse(response({ undocumented: true }), expectation),
    ).toThrow();
    expect(() =>
      parseDflowLiveOrderResponse(
        response({ addressLookupTables: [] }),
        expectation,
      ),
    ).toThrow(/lookup|response/i);
  });

  it("rejects malformed, oversized, and address-lookup-table transactions", () => {
    expect(() =>
      parseDflowLiveOrderResponse(response({ transaction: "not-base64" }), expectation),
    ).toThrow(/transaction|response/i);
    expect(() =>
      parseDflowLiveOrderResponse(
        response({ transaction: Buffer.alloc(1_233).toString("base64") }),
        expectation,
      ),
    ).toThrow(/transaction|response/i);
    expect(() =>
      parseDflowLiveOrderResponse(
        response({ transaction: transactionBase64(true) }),
        expectation,
      ),
    ).toThrow(/lookup|transaction|response/i);
  });
});
