import { expectTypeOf } from "vitest";
import { describe, expect, it } from "vitest";

import type { VenueAdapter } from "@/adapters/venue";
import {
  DFLOW_SHADOW_BLOCKING_REASONS,
  DFLOW_SHADOW_REGISTRATION,
  createDflowShadowEvidenceReport,
  refuseDflowLiveOpportunity,
} from "@/execution/venues/dflow/shadow-adapter";
import {
  parseDflowOrderStatus,
  parseDflowShadowOrderResponse,
} from "@/execution/venues/dflow/schemas";

const INPUT_MINT = "So11111111111111111111111111111111111111112";
const OUTPUT_MINT = "11111111111111111111111111111111";

describe("DFlow shadow evidence registration", () => {
  it("is structurally not a venue adapter and exposes no mutation methods", () => {
    expectTypeOf(DFLOW_SHADOW_REGISTRATION).not.toMatchTypeOf<VenueAdapter>();
    expect(DFLOW_SHADOW_REGISTRATION).toEqual({
      venue: "kalshi-dflow",
      kind: "shadow-evidence",
      shadowOnly: true,
      liveAdapterRegistered: false,
      blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
    });

    for (const mutation of [
      "prepare",
      "reserve",
      "sign",
      "simulate",
      "submit",
      "cancel",
      "compensate",
      "redeem",
      "placeIoc",
    ]) {
      expect(DFLOW_SHADOW_REGISTRATION).not.toHaveProperty(mutation);
    }
  });

  it("reports sanitized quote/status evidence without promoting it", () => {
    const quote = parseDflowShadowOrderResponse(
      {
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
      },
      {
        inputMint: INPUT_MINT,
        outputMint: OUTPUT_MINT,
        amountAtomic: "1000000",
      },
    );
    const status = parseDflowOrderStatus({
      status: "closed",
      inAmount: "0",
      outAmount: "0",
    });

    expect(
      createDflowShadowEvidenceReport({
        quote,
        status,
        sanitizedFixtureValid: true,
      }),
    ).toEqual({
      venue: "kalshi-dflow",
      shadowOnly: true,
      executable: false,
      quoteEvidencePresent: true,
      statusEvidencePresent: true,
      sanitizedFixtureValid: true,
      closedStatusObserved: true,
      provesFullFill: false,
      blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
      capabilities: {
        prepare: false,
        reserve: false,
        sign: false,
        simulate: false,
        submit: false,
        cancel: false,
        compensate: false,
        redeem: false,
      },
    });
  });

  it("returns a typed refusal before any reservation can occur", () => {
    expect(refuseDflowLiveOpportunity()).toEqual({
      accepted: false,
      reservationCreated: false,
      blockingReasons: DFLOW_SHADOW_BLOCKING_REASONS,
    });
  });
});
