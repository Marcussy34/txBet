import type { Micros } from "./money";
import type { FeeModel, OrderBookLevel } from "./types";

export interface BookWalk {
  quantity: number;
  rawCostMicros: Micros;
  averagePriceMicros: Micros;
}

export function totalDepth(levels: readonly OrderBookLevel[]): number {
  return levels.reduce((sum, level) => sum + Math.max(0, Math.floor(level.quantity)), 0);
}

export function depthBreakpoints(levels: readonly OrderBookLevel[]): number[] {
  let running = 0;
  return levels.flatMap((level) => {
    running += Math.max(0, Math.floor(level.quantity));
    return running > 0 ? [running] : [];
  });
}

export function walkAsks(
  levels: readonly OrderBookLevel[],
  requestedQuantity: number,
): BookWalk | null {
  const quantity = Math.floor(requestedQuantity);
  if (quantity <= 0) return null;

  let remaining = quantity;
  let cost = 0;

  for (const level of levels) {
    if (!Number.isSafeInteger(level.priceMicros) || level.priceMicros < 0) {
      throw new Error("Order-book prices must be non-negative integer microdollars");
    }
    const available = Math.max(0, Math.floor(level.quantity));
    const take = Math.min(remaining, available);
    cost += take * level.priceMicros;
    remaining -= take;
    if (remaining === 0) break;
  }

  if (remaining > 0 || !Number.isSafeInteger(cost)) return null;
  return {
    quantity,
    rawCostMicros: cost,
    averagePriceMicros: Math.round(cost / quantity),
  };
}

export function estimateFeeMicros(
  model: FeeModel,
  rawCostMicros: Micros,
  quantity: number,
): Micros {
  if (model.kind === "flat-per-share") {
    return Math.ceil(model.microsPerShare * quantity);
  }
  return Math.ceil((rawCostMicros * model.bps) / 10_000);
}
