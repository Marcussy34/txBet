import { describe, expect, it } from "vitest";

import { parseUsdMicros, riskLimitsInputSchema } from "@/server/risk/schema";

const defaults = {
  maxOrderUsd: "100",
  rolling24hUsd: "1000",
  strategyBudgetUsd: "100",
  totalCapitalUsd: "500",
  emergencyLossUsd: "5",
  emergencyLossBps: 500,
  maxContractExposureUsd: "50",
  maxFixtureExposureUsd: "100",
  maxTeamExposureUsd: "100",
  maxVenueExposureUsd: "250",
  maxAggregateExposureUsd: "500",
  minNetReturnBps: 100,
  minNetProfitUsd: "0.10",
};

describe("exact USD risk input", () => {
  it("converts decimal strings to integer microdollars without floating point", () => {
    expect(parseUsdMicros("0")).toBe(0);
    expect(parseUsdMicros("0.000001")).toBe(1);
    expect(parseUsdMicros("12.34")).toBe(12_340_000);
    expect(parseUsdMicros("100")).toBe(100_000_000);
  });

  it("rejects exponent notation, signs, excess precision, and noncanonical values", () => {
    for (const value of ["1e2", "-1", "+1", "1.0000001", "01", "1.", ".1", "NaN"]) {
      expect(() => parseUsdMicros(value), value).toThrow(/decimal|USD|precision/i);
    }
  });

  it("parses the complete closed input shape", () => {
    expect(riskLimitsInputSchema.parse(defaults)).toEqual(defaults);
    expect(riskLimitsInputSchema.safeParse({ ...defaults, extra: true }).success).toBe(false);
  });
});
