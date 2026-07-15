import { describe, expect, it } from "vitest";
import { dollarsToMicros } from "../src/core/money";
import { scanArbitrage } from "../src/core/optimizer";
import { DEMO_SCENARIOS, DEMO_SETTINGS } from "../src/fixtures/demo-tapes";
import type { ArbitrageSettings, VenueQuote } from "../src/core/types";

const redCardFrame = DEMO_SCENARIOS[0]!.frames[2]!;
const cornerFrame = DEMO_SCENARIOS[1]!.frames[1]!;

function settings(overrides: Partial<ArbitrageSettings> = {}): ArbitrageSettings {
  return { ...DEMO_SETTINGS, approvedVenues: new Set(DEMO_SETTINGS.approvedVenues), ...overrides };
}

describe("arbitrage optimizer", () => {
  it("prices the red-card bundle after fees and safety buffer", () => {
    const result = scanArbitrage(redCardFrame.quotes, settings(), redCardFrame.now);
    expect(result.decision).toBe("EXECUTE");
    expect(result.candidate).toMatchObject({
      quantity: 100,
      rawCostMicros: dollarsToMicros(94),
      feeMicros: dollarsToMicros(0.8),
      netProfitMicros: dollarsToMicros(4.7958),
      netReturnBps: 503,
    });
  });

  it("reproduces $0.54 + $0.40 as 6.38% gross ROI without costs", () => {
    const zeroCost = redCardFrame.quotes.map((quote): VenueQuote => ({
      ...quote,
      feeModel: { kind: "flat-per-share", microsPerShare: 0, label: "zero" },
    }));
    const result = scanArbitrage(zeroCost, settings({ safetyBufferBps: 0 }), redCardFrame.now);
    expect(result.candidate?.grossProfitMicros).toBe(dollarsToMicros(6));
    expect(result.candidate?.grossReturnBps).toBe(638);
  });

  it("never sizes above the shallower leg", () => {
    const result = scanArbitrage(redCardFrame.quotes, settings({ maxExposureMicros: dollarsToMicros(500) }), redCardFrame.now);
    expect(result.candidate?.quantity).toBe(100);
  });

  it("blocks the 106-cent corner-pressure bundle", () => {
    const result = scanArbitrage(cornerFrame.quotes, settings(), cornerFrame.now);
    expect(result.decision).toBe("NO_TRADE");
    expect(result.reasons).toContain("COMBINED_COST_GTE_PAYOUT");
  });

  it("blocks when the minimum return exceeds the available edge", () => {
    const result = scanArbitrage(redCardFrame.quotes, settings({ minNetReturnBps: 600 }), redCardFrame.now);
    expect(result.decision).toBe("NO_TRADE");
    expect(result.reasons).toContain("MIN_RETURN_NOT_MET");
  });

  it("blocks quotes outside the freshness window", () => {
    const result = scanArbitrage(redCardFrame.quotes, settings({ maxQuoteAgeMs: 10 }), redCardFrame.now);
    expect(result.decision).toBe("NO_TRADE");
    expect(result.reasons).toContain("QUOTE_STALE");
  });

  it("fails closed on future-dated quotes", () => {
    const futureQuotes = redCardFrame.quotes.map((quote) => ({
      ...quote,
      updatedAt: redCardFrame.now + 1,
    }));
    const result = scanArbitrage(futureQuotes, settings(), redCardFrame.now);
    expect(result.decision).toBe("NO_TRADE");
    expect(result.reasons).toContain("QUOTE_TIMESTAMP_INVALID");
  });

  it("does not execute at or after the market close time", () => {
    const closesAt = redCardFrame.quotes[0]!.contract.settlement.closesAt;
    const closingQuotes = redCardFrame.quotes.map((quote) => ({
      ...quote,
      updatedAt: closesAt - 1,
    }));
    const result = scanArbitrage(closingQuotes, settings(), closesAt);
    expect(result.decision).toBe("NO_TRADE");
    expect(result.reasons).toContain("MARKET_CLOSED");
  });

  it("requires two approved venues", () => {
    const result = scanArbitrage(redCardFrame.quotes, settings({ approvedVenues: new Set(["northstar"]) }), redCardFrame.now);
    expect(result.decision).toBe("NO_TRADE");
    expect(result.reasons).toContain("NO_APPROVED_QUOTES");
  });

  it("respects allocated capital", () => {
    const result = scanArbitrage(redCardFrame.quotes, settings({ allocatedCapitalMicros: dollarsToMicros(20) }), redCardFrame.now);
    expect(result.candidate?.allInCostMicros).toBeLessThanOrEqual(dollarsToMicros(20));
    expect(result.candidate?.quantity).toBeLessThan(100);
  });

  it("fails closed on a settlement mismatch", () => {
    const mismatched: readonly VenueQuote[] = [
      redCardFrame.quotes[0]!,
      {
        ...redCardFrame.quotes[1]!,
        contract: {
          ...redCardFrame.quotes[1]!.contract,
          settlement: { ...redCardFrame.quotes[1]!.contract.settlement, scope: "regulation-only" },
        },
      },
    ];
    const result = scanArbitrage(mismatched, settings(), redCardFrame.now);
    expect(result.decision).toBe("NO_TRADE");
    expect(result.reasons).toContain("SETTLEMENT_MISMATCH");
  });
});
