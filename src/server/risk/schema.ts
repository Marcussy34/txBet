import { z } from "zod";

const canonicalUsdPattern = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/;

export function parseUsdMicros(value: string): number {
  const match = canonicalUsdPattern.exec(value);
  if (!match) {
    throw new Error(
      "USD amount must be a canonical nonnegative decimal with at most six digits of precision",
    );
  }

  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] ?? "").padEnd(6, "0"));
  const micros = whole * 1_000_000n + fraction;
  if (micros > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("USD amount exceeds the safe integer microdollar range");
  }
  return Number(micros);
}

const usdString = z.string().refine((value) => {
  try {
    parseUsdMicros(value);
    return true;
  } catch {
    return false;
  }
}, "Must be a canonical USD decimal with no more than six decimal places");

const safeNonnegativeInteger = z.number().int().nonnegative().safe();

export const riskLimitsInputSchema = z.strictObject({
  maxOrderUsd: usdString,
  rolling24hUsd: usdString,
  strategyBudgetUsd: usdString,
  totalCapitalUsd: usdString,
  emergencyLossUsd: usdString,
  emergencyLossBps: safeNonnegativeInteger,
  maxContractExposureUsd: usdString,
  maxFixtureExposureUsd: usdString,
  maxTeamExposureUsd: usdString,
  maxVenueExposureUsd: usdString,
  maxAggregateExposureUsd: usdString,
  minNetReturnBps: safeNonnegativeInteger,
  minNetProfitUsd: usdString,
});

export type RiskLimitsInput = Readonly<z.infer<typeof riskLimitsInputSchema>>;
