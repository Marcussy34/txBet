import bs58 from "bs58";
import { describe, expect, it } from "vitest";

import {
  parseDflowOrderStatus,
  parseDflowShadowOrderResponse,
} from "@/execution/venues/dflow/schemas";

const INPUT_MINT = "So11111111111111111111111111111111111111112";
const OUTPUT_MINT = "11111111111111111111111111111111";
const SIGNATURE = bs58.encode(Uint8Array.from({ length: 64 }, () => 1));

const orderResponse = {
  inputMint: INPUT_MINT,
  inAmount: "1000000",
  outputMint: OUTPUT_MINT,
  outAmount: "2000000",
  otherAmountThreshold: "1900000",
  minOutAmount: "1900000",
  slippageBps: 50,
  predictionMarketSlippageBps: 50,
  priceImpactPct: "0.01",
  contextSlot: 123,
  executionMode: "async",
  revertMint: INPUT_MINT,
};

describe("DFlow shadow schemas", () => {
  it("normalizes exact-input/minimum-output quote evidence as non-executable", () => {
    expect(
      parseDflowShadowOrderResponse(orderResponse, {
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        amountAtomic: "1000000",
      }),
    ).toEqual({
      inputMint: INPUT_MINT,
      inputAtomic: "1000000",
      outputMint: OUTPUT_MINT,
      expectedOutputAtomic: "2000000",
      minimumOutputAtomic: "1900000",
      maximumOutputAtomic: null,
      exactOutputGuaranteed: false,
      executionMode: "async",
      contextSlot: 123,
      refusalCodes: [
        "DFLOW_OUTPUT_NOT_EXACT",
        "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE",
      ],
    });
  });

  it("rejects mismatched amounts/mints, inconsistent thresholds, and signable responses", () => {
    for (const mutation of [
      { inputMint: OUTPUT_MINT },
      { outputMint: INPUT_MINT },
      { inAmount: "999999" },
      { minOutAmount: "1800000" },
      { otherAmountThreshold: "2100000" },
      { transaction: "c2lnbmFibGU=" },
      { lastValidBlockHeight: 500 },
    ]) {
      expect(() =>
        parseDflowShadowOrderResponse(
          { ...orderResponse, ...mutation },
          {
            inputMint: INPUT_MINT,
            outputMint: OUTPUT_MINT,
            amountAtomic: "1000000",
          },
        ),
      ).toThrow();
    }
  });

  it("accepts documented non-transaction fields and enforces execution-mode semantics", () => {
    const asyncResponse = {
      ...orderResponse,
      revertMint: INPUT_MINT,
      isNativePredictionMarketOutput: true,
      platformFee: { amount: "1000", feeBps: 10 },
    };
    expect(() =>
      parseDflowShadowOrderResponse(asyncResponse, {
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        amountAtomic: "1000000",
      }),
    ).not.toThrow();
    const { revertMint: _revertMint, ...withoutRevertMint } = orderResponse;
    expect(_revertMint).toBe(INPUT_MINT);
    expect(() =>
      parseDflowShadowOrderResponse(withoutRevertMint, {
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        amountAtomic: "1000000",
      }),
    ).toThrow(/revertMint/i);

    const syncResponse = {
      ...withoutRevertMint,
      executionMode: "sync",
      routePlan: [
        {
          data: "sanitized-route",
          inAmount: "1000000",
          inputMint: INPUT_MINT,
          inputMintDecimals: 6,
          marketKey: "sanitized-market",
          outAmount: "2000000",
          outputMint: OUTPUT_MINT,
          outputMintDecimals: 6,
          venue: "sanitized-venue",
        },
      ],
    };
    expect(() =>
      parseDflowShadowOrderResponse(syncResponse, {
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        amountAtomic: "1000000",
      }),
    ).not.toThrow();
    expect(() =>
      parseDflowShadowOrderResponse(
        { ...withoutRevertMint, executionMode: "sync" },
        {
          inputMint: INPUT_MINT,
          outputMint: OUTPUT_MINT,
          amountAtomic: "1000000",
        },
      ),
    ).toThrow(/routePlan/i);
  });

  it("parses every current status without treating closed alone as a full fill", () => {
    for (const status of [
      "pending",
      "expired",
      "failed",
      "open",
      "pendingClose",
      "closed",
    ] as const) {
      const parsed = parseDflowOrderStatus({ status, inAmount: "0", outAmount: "0" });
      expect(parsed.status).toBe(status);
      expect(parsed.provesFullFill).toBe(false);
    }

    const withFill = parseDflowOrderStatus({
      status: "closed",
      inAmount: "1000000",
      outAmount: "2000000",
      fills: [
        {
          signature: SIGNATURE,
          inputMint: INPUT_MINT,
          inAmount: "1000000",
          outputMint: OUTPUT_MINT,
          outAmount: "2000000",
        },
      ],
    });
    expect(withFill.provesFullFill).toBe(false);
    expect(withFill.fills).toHaveLength(1);
  });

  it("rejects nonzero filled totals when the required fill evidence is absent", () => {
    expect(() =>
      parseDflowOrderStatus({
        status: "closed",
        inAmount: "1000000",
        outAmount: "2000000",
      }),
    ).toThrow(/fill evidence/i);
  });
});
