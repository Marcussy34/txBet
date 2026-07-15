import { depthBreakpoints, estimateFeeMicros, totalDepth, walkAsks } from "./orderbook";
import { compareContracts, settlementKey } from "./settlement";
import type {
  ArbitrageCandidate,
  ArbitrageSettings,
  PricedLeg,
  ScanReason,
  ScanResult,
  VenueQuote,
} from "./types";

function uniqueReasons(reasons: readonly ScanReason[]): ScanReason[] {
  return [...new Set(reasons)];
}

function evaluateQuantity(
  first: VenueQuote,
  second: VenueQuote,
  quantity: number,
  settings: ArbitrageSettings,
): ArbitrageCandidate | null {
  const firstWalk = walkAsks(first.asks, quantity);
  const secondWalk = walkAsks(second.asks, quantity);
  if (!firstWalk || !secondWalk) return null;

  const firstFee = estimateFeeMicros(first.feeModel, firstWalk.rawCostMicros, quantity);
  const secondFee = estimateFeeMicros(second.feeModel, secondWalk.rawCostMicros, quantity);
  const rawCostMicros = firstWalk.rawCostMicros + secondWalk.rawCostMicros;
  const feeMicros = firstFee + secondFee;
  const safetyBufferMicros = Math.ceil(
    (rawCostMicros * settings.safetyBufferBps) / 10_000,
  );
  const allInCostMicros = rawCostMicros + feeMicros + safetyBufferMicros;
  const payoutMicros = quantity * first.contract.settlement.payoutMicros;
  const grossProfitMicros = payoutMicros - rawCostMicros;
  const netProfitMicros = payoutMicros - allInCostMicros;
  const grossReturnBps = rawCostMicros > 0
    ? Math.floor((grossProfitMicros * 10_000) / rawCostMicros)
    : 0;
  const netReturnBps = allInCostMicros > 0
    ? Math.floor((netProfitMicros * 10_000) / allInCostMicros)
    : 0;

  const asLeg = (quote: VenueQuote, walk: typeof firstWalk, fee: number): PricedLeg => ({
    venueId: quote.contract.venueId,
    venueName: quote.contract.venueName,
    contractId: quote.contract.contractId,
    outcome: quote.contract.outcome,
    quantity,
    averagePriceMicros: walk.averagePriceMicros,
    rawCostMicros: walk.rawCostMicros,
    feeMicros: fee,
  });
  const firstLeg = asLeg(first, firstWalk, firstFee);
  const secondLeg = asLeg(second, secondWalk, secondFee);
  const yes = firstLeg.outcome === "YES" ? firstLeg : secondLeg;
  const no = firstLeg.outcome === "NO" ? firstLeg : secondLeg;

  return {
    id: `${yes.venueId}:${yes.contractId}|${no.venueId}:${no.contractId}|${quantity}`,
    settlementKey: settlementKey(first.contract.settlement),
    quantity,
    yes,
    no,
    rawCostMicros,
    feeMicros,
    safetyBufferMicros,
    allInCostMicros,
    payoutMicros,
    grossProfitMicros,
    netProfitMicros,
    grossReturnBps,
    netReturnBps,
  };
}

function affordableQuantity(
  first: VenueQuote,
  second: VenueQuote,
  maxQuantity: number,
  settings: ArbitrageSettings,
): number {
  let low = 0;
  let high = maxQuantity;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = evaluateQuantity(first, second, mid, settings);
    if (candidate && candidate.allInCostMicros <= settings.allocatedCapitalMicros) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

function candidateQuantities(
  first: VenueQuote,
  second: VenueQuote,
  settings: ArbitrageSettings,
): number[] {
  const payoutPerShare = first.contract.settlement.payoutMicros;
  const exposureLimit = Math.floor(settings.maxExposureMicros / payoutPerShare);
  const depthLimit = Math.min(totalDepth(first.asks), totalDepth(second.asks));
  const maximum = Math.min(exposureLimit, depthLimit);
  if (maximum < 1) return [];

  const values = new Set<number>([1, maximum]);
  for (const value of [...depthBreakpoints(first.asks), ...depthBreakpoints(second.asks)]) {
    if (value > 0 && value <= maximum) values.add(value);
    if (value + 1 <= maximum) values.add(value + 1);
  }
  const affordable = affordableQuantity(first, second, maximum, settings);
  if (affordable > 0) values.add(affordable);
  return [...values].sort((a, b) => a - b);
}

function candidateOrder(left: ArbitrageCandidate, right: ArbitrageCandidate): number {
  if (left.netProfitMicros !== right.netProfitMicros) {
    return right.netProfitMicros - left.netProfitMicros;
  }
  if (left.netReturnBps !== right.netReturnBps) {
    return right.netReturnBps - left.netReturnBps;
  }
  return left.id.localeCompare(right.id);
}

export function scanArbitrage(
  quotes: readonly VenueQuote[],
  settings: ArbitrageSettings,
  now: number,
): ScanResult {
  const reasons: ScanReason[] = [];
  const approved = quotes.filter((quote) => {
    if (!settings.approvedVenues.has(quote.contract.venueId)) return false;
    if (quote.status !== "open") {
      reasons.push("SUSPENDED_QUOTE");
      return false;
    }
    if (!Number.isSafeInteger(quote.updatedAt) || quote.updatedAt > now) {
      reasons.push("QUOTE_TIMESTAMP_INVALID");
      return false;
    }
    if (now >= quote.contract.settlement.closesAt) {
      reasons.push("MARKET_CLOSED");
      return false;
    }
    if (now - quote.updatedAt > settings.maxQuoteAgeMs) {
      reasons.push("QUOTE_STALE");
      return false;
    }
    return true;
  });

  if (approved.length < 2) {
    return {
      decision: "NO_TRADE",
      candidate: null,
      reasons: uniqueReasons([...reasons, "NO_APPROVED_QUOTES"]),
      evaluatedPairs: 0,
    };
  }

  let evaluatedPairs = 0;
  const evaluated: ArbitrageCandidate[] = [];

  for (let leftIndex = 0; leftIndex < approved.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < approved.length; rightIndex += 1) {
      const left = approved[leftIndex]!;
      const right = approved[rightIndex]!;
      if (left.contract.venueId === right.contract.venueId) {
        reasons.push("SAME_VENUE");
        continue;
      }
      if (left.contract.outcome === right.contract.outcome) {
        reasons.push("NOT_COMPLEMENTARY");
        continue;
      }
      if (!compareContracts(left.contract, right.contract).matches) {
        reasons.push("SETTLEMENT_MISMATCH");
        continue;
      }

      evaluatedPairs += 1;
      const quantities = candidateQuantities(left, right, settings);
      if (quantities.length === 0) {
        reasons.push("INSUFFICIENT_LIQUIDITY");
        continue;
      }

      for (const quantity of quantities) {
        const candidate = evaluateQuantity(left, right, quantity, settings);
        if (!candidate) {
          reasons.push("INSUFFICIENT_LIQUIDITY");
          continue;
        }
        evaluated.push(candidate);
      }
    }
  }

  const executable = evaluated
    .filter((candidate) => candidate.allInCostMicros <= settings.allocatedCapitalMicros)
    .filter((candidate) => candidate.allInCostMicros < candidate.payoutMicros)
    .filter((candidate) => candidate.netReturnBps >= settings.minNetReturnBps)
    .sort(candidateOrder);

  if (executable[0]) {
    return {
      decision: "EXECUTE",
      candidate: executable[0],
      reasons: [],
      evaluatedPairs,
    };
  }

  if (evaluated.some((candidate) => candidate.allInCostMicros > settings.allocatedCapitalMicros)) {
    reasons.push("CAPITAL_LIMIT");
  }
  if (evaluated.some((candidate) => candidate.allInCostMicros >= candidate.payoutMicros)) {
    reasons.push("COMBINED_COST_GTE_PAYOUT");
  }
  if (
    evaluated.some(
      (candidate) =>
        candidate.allInCostMicros < candidate.payoutMicros &&
        candidate.netReturnBps < settings.minNetReturnBps,
    )
  ) {
    reasons.push("MIN_RETURN_NOT_MET");
  }
  if (evaluated.length === 0 && evaluatedPairs > 0) reasons.push("EXPOSURE_LIMIT");

  return {
    decision: "NO_TRADE",
    candidate: null,
    reasons: uniqueReasons(reasons.length > 0 ? reasons : ["INSUFFICIENT_LIQUIDITY"]),
    evaluatedPairs,
  };
}
