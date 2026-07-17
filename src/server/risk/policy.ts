import { PLATFORM_RISK_CEILINGS } from "@/contracts/platform";

import {
  parseUsdMicros,
  riskLimitsInputSchema,
  type RiskLimitsInput,
} from "./schema";

export interface RiskLimits {
  readonly maxOrderMicros: number;
  readonly rolling24hMicros: number;
  readonly strategyBudgetMicros: number;
  readonly totalCapitalMicros: number;
  readonly emergencyLossMicros: number;
  readonly emergencyLossBps: number;
  readonly maxContractExposureMicros: number;
  readonly maxFixtureExposureMicros: number;
  readonly maxTeamExposureMicros: number;
  readonly maxVenueExposureMicros: number;
  readonly maxAggregateExposureMicros: number;
  readonly minNetReturnBps: number;
  readonly minNetProfitMicros: number;
}

function assertAtMost(value: number, ceiling: number, label: string): void {
  if (value > ceiling) throw new Error(`${label} exceeds the platform ceiling`);
}

function assertAtLeast(value: number, floor: number, label: string): void {
  if (value < floor) throw new Error(`${label} is below the platform floor`);
}

export function parseRiskLimits(input: RiskLimitsInput): RiskLimits {
  const parsed = riskLimitsInputSchema.parse(input);
  const limits: RiskLimits = {
    maxOrderMicros: parseUsdMicros(parsed.maxOrderUsd),
    rolling24hMicros: parseUsdMicros(parsed.rolling24hUsd),
    strategyBudgetMicros: parseUsdMicros(parsed.strategyBudgetUsd),
    totalCapitalMicros: parseUsdMicros(parsed.totalCapitalUsd),
    emergencyLossMicros: parseUsdMicros(parsed.emergencyLossUsd),
    emergencyLossBps: parsed.emergencyLossBps,
    maxContractExposureMicros: parseUsdMicros(parsed.maxContractExposureUsd),
    maxFixtureExposureMicros: parseUsdMicros(parsed.maxFixtureExposureUsd),
    maxTeamExposureMicros: parseUsdMicros(parsed.maxTeamExposureUsd),
    maxVenueExposureMicros: parseUsdMicros(parsed.maxVenueExposureUsd),
    maxAggregateExposureMicros: parseUsdMicros(parsed.maxAggregateExposureUsd),
    minNetReturnBps: parsed.minNetReturnBps,
    minNetProfitMicros: parseUsdMicros(parsed.minNetProfitUsd),
  };

  assertAtMost(
    limits.maxOrderMicros,
    PLATFORM_RISK_CEILINGS.maxOrderMicros,
    "Maximum order",
  );
  assertAtMost(
    limits.rolling24hMicros,
    PLATFORM_RISK_CEILINGS.rolling24hMicros,
    "Rolling 24-hour spend",
  );
  assertAtMost(
    limits.emergencyLossMicros,
    PLATFORM_RISK_CEILINGS.emergencyLossMicros,
    "Emergency loss",
  );
  assertAtMost(
    limits.emergencyLossBps,
    PLATFORM_RISK_CEILINGS.emergencyLossBps,
    "Emergency loss basis points",
  );
  assertAtLeast(
    limits.minNetReturnBps,
    PLATFORM_RISK_CEILINGS.minNetReturnBps,
    "Minimum net return",
  );
  assertAtLeast(
    limits.minNetProfitMicros,
    PLATFORM_RISK_CEILINGS.minNetProfitMicros,
    "Minimum net profit",
  );

  for (const [label, exposure] of [
    ["Contract exposure", limits.maxContractExposureMicros],
    ["Fixture exposure", limits.maxFixtureExposureMicros],
    ["Team exposure", limits.maxTeamExposureMicros],
    ["Venue exposure", limits.maxVenueExposureMicros],
  ] as const) {
    if (exposure > limits.maxAggregateExposureMicros) {
      throw new Error(`${label} cannot exceed maximum aggregate exposure`);
    }
  }
  if (limits.maxAggregateExposureMicros > limits.totalCapitalMicros) {
    throw new Error("Maximum aggregate exposure cannot exceed total capital");
  }
  if (limits.strategyBudgetMicros > limits.totalCapitalMicros) {
    throw new Error("Strategy budget cannot exceed total capital");
  }

  return Object.freeze(limits);
}
