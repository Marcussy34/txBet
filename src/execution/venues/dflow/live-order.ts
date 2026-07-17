import { PublicKey, VersionedTransaction } from "@solana/web3.js";
import { z } from "zod";

import type { AtomicAmount } from "@/core/live-money";

/** One USDC atomic unit is one txBet microdollar. */
export const DFLOW_CANONICAL_SOLANA_USDC_MINT =
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n;
const MAX_TRANSACTION_BYTES = 1_232;
const CANONICAL_BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const safeNonnegativeInteger = z.number().int().nonnegative().safe();
const unsigned16 = z.number().int().nonnegative().max(65_535);
const atomicInteger = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .refine((value) => BigInt(value) <= MAX_SIGNED_INT64, {
    message: "Atomic amount exceeds DFlow's signed 64-bit request range",
  });
const positiveAtomicInteger = atomicInteger.refine((value) => value !== "0", {
  message: "Atomic amount must be positive",
});
const solanaPublicKey = z.string().superRefine((value, context) => {
  try {
    if (new PublicKey(value).toBase58() !== value) throw new Error("not canonical");
  } catch {
    context.addIssue({
      code: "custom",
      message: "Must be a canonical Solana public key",
    });
  }
});

const transactionBase64 = z.string().superRefine((value, context) => {
  try {
    if (!CANONICAL_BASE64.test(value)) {
      throw new Error("Transaction must use canonical base64");
    }
    const bytes = Buffer.from(value, "base64");
    if (bytes.toString("base64") !== value) {
      throw new Error("Transaction must use canonical base64");
    }
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_TRANSACTION_BYTES) {
      throw new Error("Transaction is outside Solana's packet size bound");
    }
    const transaction = VersionedTransaction.deserialize(bytes);
    if (!Buffer.from(transaction.serialize()).equals(bytes)) {
      throw new Error("Transaction bytes are not canonical");
    }
    if (
      transaction.message.version === 0 &&
      transaction.message.addressTableLookups.length !== 0
    ) {
      throw new Error("Transaction address lookup tables are not accepted");
    }
  } catch (error) {
    context.addIssue({
      code: "custom",
      message:
        error instanceof Error
          ? `Invalid DFlow transaction: ${error.message}`
          : "Invalid DFlow transaction",
    });
  }
});

const platformFee = z.strictObject({
  amount: atomicInteger,
  feeBps: unsigned16,
});
const prioritizationType = z.strictObject({
  computeBudget: z.strictObject({
    microLamports: safeNonnegativeInteger,
    estimatedMicroLamports: safeNonnegativeInteger,
  }),
});
const routePlanEntry = z.strictObject({
  data: z.string().min(1),
  inAmount: atomicInteger,
  inputMint: solanaPublicKey,
  inputMintDecimals: z.number().int().min(0).max(255),
  marketKey: z.string().min(1).max(240),
  outAmount: atomicInteger,
  outputMint: solanaPublicKey,
  outputMintDecimals: z.number().int().min(0).max(255),
  venue: z.string().min(1).max(120),
});

const liveOrderResponse = z.strictObject({
  contextSlot: safeNonnegativeInteger,
  executionMode: z.literal("async"),
  inAmount: positiveAtomicInteger,
  inputMint: solanaPublicKey,
  minOutAmount: positiveAtomicInteger,
  otherAmountThreshold: positiveAtomicInteger,
  outAmount: positiveAtomicInteger,
  outputMint: solanaPublicKey,
  priceImpactPct: z.string().regex(/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/),
  slippageBps: unsigned16,
  // The request explicitly disables lookup tables, so even an empty field is unexpected.
  addressLookupTables: z.never().optional(),
  computeUnitLimit: safeNonnegativeInteger,
  initPredictionMarketCost: safeNonnegativeInteger.optional(),
  isNativePredictionMarketOutput: z.literal(true),
  lastValidBlockHeight: safeNonnegativeInteger,
  platformFee: platformFee.nullable().optional(),
  predictionMarketInitPayerMustSign: z.literal(true).optional(),
  predictionMarketSlippageBps: unsigned16,
  prioritizationFeeLamports: safeNonnegativeInteger,
  prioritizationType,
  revertMint: solanaPublicKey,
  routePlan: z.array(routePlanEntry).min(1).optional(),
  transaction: transactionBase64,
});

export interface DflowLiveOrderExpectation {
  readonly outputMint: string;
  readonly amountAtomic: AtomicAmount;
  readonly minimumOutputAtomic: AtomicAmount;
  readonly slippageBps: number;
  readonly predictionMarketSlippageBps: number;
  readonly maximumPrioritizationFeeLamports: number;
  readonly maximumInitPredictionMarketCostLamports: number;
}

export interface DflowLiveOrder {
  readonly inputMint: typeof DFLOW_CANONICAL_SOLANA_USDC_MINT;
  readonly inputAtomic: AtomicAmount;
  readonly outputMint: string;
  readonly expectedOutputAtomic: AtomicAmount;
  readonly minimumOutputAtomic: AtomicAmount;
  readonly executionMode: "async";
  readonly contextSlot: number;
  readonly lastValidBlockHeight: number;
  readonly transactionBase64: string;
  readonly computeUnitLimit: number;
  readonly prioritizationFeeLamports: number;
  readonly initPredictionMarketCostLamports: number;
  readonly predictionMarketInitPayerMustSign: boolean;
  readonly slippageBps: number;
  readonly predictionMarketSlippageBps: number;
}

/** Converts one signed DFlow payload into a bounded exact-input canary order. */
export function parseDflowLiveOrderResponse(
  value: unknown,
  expected: DflowLiveOrderExpectation,
): DflowLiveOrder {
  const expectation = parseExpectation(expected);
  const parsed = liveOrderResponse.parse(value);

  if (parsed.inputMint !== DFLOW_CANONICAL_SOLANA_USDC_MINT) {
    throw new Error("DFlow live order input mint is not canonical Solana USDC");
  }
  if (parsed.outputMint !== expectation.outputMint) {
    throw new Error("DFlow live order output mint does not match the reviewed binding");
  }
  if (parsed.inAmount !== expectation.amountAtomic) {
    throw new Error("DFlow live order exact input amount does not match the request");
  }
  if (parsed.minOutAmount !== parsed.otherAmountThreshold) {
    throw new Error("DFlow live order minimum output fields disagree");
  }
  if (BigInt(parsed.outAmount) < BigInt(parsed.minOutAmount)) {
    throw new Error("DFlow live order expected output is below its minimum");
  }
  if (BigInt(parsed.minOutAmount) < BigInt(expectation.minimumOutputAtomic)) {
    throw new Error("DFlow live order minimum output is below the user's floor");
  }
  if (parsed.revertMint !== DFLOW_CANONICAL_SOLANA_USDC_MINT) {
    throw new Error("DFlow live order revert mint is not canonical Solana USDC");
  }
  if (
    parsed.slippageBps !== expectation.slippageBps ||
    parsed.predictionMarketSlippageBps !==
      expectation.predictionMarketSlippageBps
  ) {
    throw new Error("DFlow live order slippage does not match the fixed controls");
  }
  if (
    parsed.prioritizationFeeLamports >
    expectation.maximumPrioritizationFeeLamports
  ) {
    throw new Error("DFlow live order prioritization fee exceeds its cap");
  }

  const initCost = parsed.initPredictionMarketCost ?? 0;
  if (initCost > expectation.maximumInitPredictionMarketCostLamports) {
    throw new Error("DFlow live order initialization cost exceeds its cap");
  }
  if (
    (parsed.initPredictionMarketCost === undefined) !==
    (parsed.predictionMarketInitPayerMustSign === undefined)
  ) {
    throw new Error("DFlow live order initialization fields disagree");
  }
  if (
    parsed.platformFee !== undefined &&
    parsed.platformFee !== null &&
    (parsed.platformFee.amount !== "0" || parsed.platformFee.feeBps !== 0)
  ) {
    throw new Error("DFlow live order unexpectedly charges a platform fee");
  }

  return Object.freeze({
    inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
    inputAtomic: parsed.inAmount as AtomicAmount,
    outputMint: parsed.outputMint,
    expectedOutputAtomic: parsed.outAmount as AtomicAmount,
    minimumOutputAtomic: parsed.minOutAmount as AtomicAmount,
    executionMode: parsed.executionMode,
    contextSlot: parsed.contextSlot,
    lastValidBlockHeight: parsed.lastValidBlockHeight,
    transactionBase64: parsed.transaction,
    computeUnitLimit: parsed.computeUnitLimit,
    prioritizationFeeLamports: parsed.prioritizationFeeLamports,
    initPredictionMarketCostLamports: initCost,
    predictionMarketInitPayerMustSign:
      parsed.predictionMarketInitPayerMustSign === true,
    slippageBps: parsed.slippageBps,
    predictionMarketSlippageBps: parsed.predictionMarketSlippageBps,
  });
}

function parseExpectation(
  expectation: DflowLiveOrderExpectation,
): Readonly<DflowLiveOrderExpectation> {
  const outputMint = solanaPublicKey.parse(expectation.outputMint);
  if (outputMint === DFLOW_CANONICAL_SOLANA_USDC_MINT) {
    throw new Error("DFlow live order output mint must differ from its input mint");
  }
  const amountAtomic = positiveAtomicInteger.parse(expectation.amountAtomic);
  const minimumOutputAtomic = positiveAtomicInteger.parse(
    expectation.minimumOutputAtomic,
  );
  const slippageBps = unsigned16.parse(expectation.slippageBps);
  const predictionMarketSlippageBps = unsigned16.parse(
    expectation.predictionMarketSlippageBps,
  );
  if (predictionMarketSlippageBps < slippageBps) {
    throw new Error(
      "DFlow prediction-market slippage cannot be below routing slippage",
    );
  }
  const maximumPrioritizationFeeLamports = safeNonnegativeInteger.parse(
    expectation.maximumPrioritizationFeeLamports,
  );
  const maximumInitPredictionMarketCostLamports = safeNonnegativeInteger.parse(
    expectation.maximumInitPredictionMarketCostLamports,
  );

  return Object.freeze({
    outputMint,
    amountAtomic: amountAtomic as AtomicAmount,
    minimumOutputAtomic: minimumOutputAtomic as AtomicAmount,
    slippageBps,
    predictionMarketSlippageBps,
    maximumPrioritizationFeeLamports,
    maximumInitPredictionMarketCostLamports,
  });
}
