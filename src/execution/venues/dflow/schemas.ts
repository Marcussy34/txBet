import bs58 from "bs58";
import { z } from "zod";

import type { AtomicAmount } from "@/core/live-money";

const canonicalAtomic = z.string().regex(/^(0|[1-9][0-9]*)$/);
const positiveAtomic = z.string().regex(/^[1-9][0-9]*$/);

function base58Bytes(length: number) {
  return z.string().refine((value) => {
    try {
      return bs58.decode(value).byteLength === length;
    } catch {
      return false;
    }
  }, `Must be base58 encoding of exactly ${length} bytes`);
}

export const solanaAddressSchema = base58Bytes(32);
export const dflowSignatureSchema = base58Bytes(64);

const platformFeeSchema = z.strictObject({
  amount: canonicalAtomic,
  feeBps: z.number().int().nonnegative().max(65_535),
});

const routePlanEntrySchema = z.strictObject({
  data: z.string().min(1),
  inAmount: canonicalAtomic,
  inputMint: solanaAddressSchema,
  inputMintDecimals: z.number().int().min(0).max(255),
  marketKey: z.string().min(1),
  outAmount: canonicalAtomic,
  outputMint: solanaAddressSchema,
  outputMintDecimals: z.number().int().min(0).max(255),
  venue: z.string().min(1),
});

const dflowShadowOrderResponseSchema = z
  .strictObject({
    inputMint: solanaAddressSchema,
    inAmount: positiveAtomic,
    outputMint: solanaAddressSchema,
    outAmount: positiveAtomic,
    otherAmountThreshold: positiveAtomic,
    minOutAmount: positiveAtomic,
    slippageBps: z.number().int().min(0).max(65_535),
    predictionMarketSlippageBps: z.number().int().min(0).max(65_535).optional(),
    priceImpactPct: z.string().regex(/^(0|[1-9][0-9]*)(?:\.[0-9]+)?$/),
    contextSlot: z.number().int().nonnegative().safe(),
    executionMode: z.enum(["sync", "async"]),
    isNativePredictionMarketOutput: z.boolean().optional(),
    platformFee: platformFeeSchema.nullable().optional(),
    revertMint: solanaAddressSchema.optional(),
    routePlan: z.array(routePlanEntrySchema).min(1).optional(),
    // These fields exist only for a user-bound, signable transaction request.
    transaction: z.never().optional(),
    lastValidBlockHeight: z.never().optional(),
    addressLookupTables: z.never().optional(),
    computeUnitLimit: z.never().optional(),
    initPredictionMarketCost: z.never().optional(),
    predictionMarketInitPayerMustSign: z.never().optional(),
    prioritizationFeeLamports: z.never().optional(),
    prioritizationType: z.never().optional(),
  })
  .superRefine((value, context) => {
    if (value.executionMode === "async" && !value.revertMint) {
      context.addIssue({
        code: "custom",
        path: ["revertMint"],
        message: "DFlow async shadow response requires revertMint",
      });
    }
    if (value.executionMode === "sync" && value.revertMint) {
      context.addIssue({
        code: "custom",
        path: ["revertMint"],
        message: "DFlow sync shadow response cannot include revertMint",
      });
    }
    if (value.executionMode === "sync" && !value.routePlan) {
      context.addIssue({
        code: "custom",
        path: ["routePlan"],
        message: "DFlow sync shadow response requires routePlan",
      });
    }
  });

export interface DflowShadowOrderExpectation {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountAtomic: AtomicAmount;
}

export interface DflowShadowQuote {
  readonly inputMint: string;
  readonly inputAtomic: AtomicAmount;
  readonly outputMint: string;
  readonly expectedOutputAtomic: AtomicAmount;
  readonly minimumOutputAtomic: AtomicAmount;
  readonly maximumOutputAtomic: null;
  readonly exactOutputGuaranteed: false;
  readonly executionMode: "sync" | "async";
  readonly contextSlot: number;
  readonly refusalCodes: readonly [
    "DFLOW_OUTPUT_NOT_EXACT",
    "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE",
  ];
}

export function parseDflowShadowOrderResponse(
  value: unknown,
  expected: DflowShadowOrderExpectation,
): DflowShadowQuote {
  const parsed = dflowShadowOrderResponseSchema.parse(value);
  if (parsed.inputMint !== expected.inputMint) {
    throw new Error("DFlow response input mint does not match the request");
  }
  if (parsed.outputMint !== expected.outputMint) {
    throw new Error("DFlow response output mint does not match the request");
  }
  if (parsed.inAmount !== expected.amountAtomic) {
    throw new Error("DFlow exact input amount does not match the request");
  }
  if (parsed.minOutAmount !== parsed.otherAmountThreshold) {
    throw new Error("DFlow minimum output fields disagree");
  }
  if (BigInt(parsed.outAmount) < BigInt(parsed.otherAmountThreshold)) {
    throw new Error("DFlow expected output is below its minimum threshold");
  }

  return Object.freeze({
    inputMint: parsed.inputMint,
    inputAtomic: parsed.inAmount as AtomicAmount,
    outputMint: parsed.outputMint,
    expectedOutputAtomic: parsed.outAmount as AtomicAmount,
    minimumOutputAtomic: parsed.otherAmountThreshold as AtomicAmount,
    maximumOutputAtomic: null,
    exactOutputGuaranteed: false,
    executionMode: parsed.executionMode,
    contextSlot: parsed.contextSlot,
    refusalCodes: Object.freeze([
      "DFLOW_OUTPUT_NOT_EXACT",
      "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE",
    ] as const),
  });
}

const fillSchema = z.strictObject({
  signature: dflowSignatureSchema,
  inputMint: solanaAddressSchema,
  inAmount: positiveAtomic,
  outputMint: solanaAddressSchema,
  outAmount: positiveAtomic,
});
const revertSchema = z.strictObject({
  signature: dflowSignatureSchema,
  mint: solanaAddressSchema,
  amount: positiveAtomic,
});
const orderStatusSchema = z.strictObject({
  status: z.enum(["pending", "expired", "failed", "open", "pendingClose", "closed"]),
  inAmount: canonicalAtomic,
  outAmount: canonicalAtomic,
  fills: z.array(fillSchema).optional().default([]),
  reverts: z.array(revertSchema).optional().default([]),
});

type DflowFill = Readonly<z.infer<typeof fillSchema>>;
type DflowRevert = Readonly<z.infer<typeof revertSchema>>;

export type DflowOrderStatus = Readonly<
  Omit<z.infer<typeof orderStatusSchema>, "fills" | "reverts"> & {
    readonly fills: readonly DflowFill[];
    readonly reverts: readonly DflowRevert[];
    readonly provesFullFill: false;
  }
>;

export function parseDflowOrderStatus(value: unknown): DflowOrderStatus {
  const parsed = orderStatusSchema.parse(value);
  if (
    parsed.fills.length === 0 &&
    (parsed.inAmount !== "0" || parsed.outAmount !== "0")
  ) {
    throw new Error("DFlow nonzero status totals require documented fill evidence");
  }
  if (parsed.fills.length > 0) {
    const totalInput = parsed.fills.reduce(
      (sum, fill) => sum + BigInt(fill.inAmount),
      0n,
    );
    const totalOutput = parsed.fills.reduce(
      (sum, fill) => sum + BigInt(fill.outAmount),
      0n,
    );
    if (
      totalInput !== BigInt(parsed.inAmount) ||
      totalOutput !== BigInt(parsed.outAmount)
    ) {
      throw new Error("DFlow status totals do not equal the documented fill evidence");
    }
  }

  return Object.freeze({
    ...parsed,
    fills: Object.freeze(parsed.fills.map((fill) => Object.freeze(fill))),
    reverts: Object.freeze(parsed.reverts.map((revert) => Object.freeze(revert))),
    // Current docs do not prove exact requested output, even when status is closed.
    provesFullFill: false,
  });
}
