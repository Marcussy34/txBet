import { describe, expect, it } from "vitest";

import { PLATFORM_RISK_CEILINGS } from "@/contracts/platform";
import { parseRiskLimits } from "@/server/risk/policy";

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

describe("risk policy", () => {
  it("returns immutable integer limits at the platform defaults", () => {
    const limits = parseRiskLimits(defaults);

    expect(limits.maxOrderMicros).toBe(100_000_000);
    expect(limits.rolling24hMicros).toBe(1_000_000_000);
    expect(limits.minNetProfitMicros).toBe(100_000);
    expect(Object.isFrozen(limits)).toBe(true);
    expect(PLATFORM_RISK_CEILINGS.canaryAggregateMicros).toBe(10_000_000);
  });

  it("allows users to be stricter", () => {
    const limits = parseRiskLimits({
      ...defaults,
      maxOrderUsd: "25",
      rolling24hUsd: "200",
      emergencyLossUsd: "1.25",
      emergencyLossBps: 200,
      minNetReturnBps: 250,
      minNetProfitUsd: "1",
    });

    expect(limits.maxOrderMicros).toBe(25_000_000);
    expect(limits.emergencyLossMicros).toBe(1_250_000);
    expect(limits.minNetReturnBps).toBe(250);
  });

  it("rejects every attempt to loosen a platform ceiling or floor", () => {
    for (const mutation of [
      { maxOrderUsd: "100.000001" },
      { rolling24hUsd: "1000.000001" },
      { emergencyLossUsd: "5.000001" },
      { emergencyLossBps: 501 },
      { minNetReturnBps: 99 },
      { minNetProfitUsd: "0.099999" },
    ]) {
      expect(() => parseRiskLimits({ ...defaults, ...mutation })).toThrow();
    }
  });

  it("rejects concentration and budget inconsistencies", () => {
    expect(() =>
      parseRiskLimits({ ...defaults, maxContractExposureUsd: "500.000001" }),
    ).toThrow(/aggregate/i);
    expect(() =>
      parseRiskLimits({ ...defaults, maxAggregateExposureUsd: "500.000001" }),
    ).toThrow(/capital/i);
    expect(() =>
      parseRiskLimits({ ...defaults, strategyBudgetUsd: "500.000001" }),
    ).toThrow(/capital/i);
  });
});
