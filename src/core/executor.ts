import type {
  ArbitrageCandidate,
  BundleExecution,
  ExecutionLeg,
  Outcome,
  SettlementBranch,
} from "./types";

export interface SimulatedFillPlan {
  yesQuantity?: number;
  noQuantity?: number;
}

function isValidFillQuantity(quantity: number, requestedQuantity: number): boolean {
  return Number.isSafeInteger(quantity) && quantity >= 0 && quantity <= requestedQuantity;
}

function unfilledLeg(
  outcome: Outcome,
  venueId: string,
  requestedQuantity: number,
): ExecutionLeg {
  return {
    outcome,
    venueId,
    requestedQuantity: Number.isSafeInteger(requestedQuantity) && requestedQuantity > 0
      ? requestedQuantity
      : 0,
    filledQuantity: 0,
    status: "UNFILLED",
  };
}

function executionLeg(
  outcome: Outcome,
  venueId: string,
  requestedQuantity: number,
  filledQuantity: number,
): ExecutionLeg {
  const bounded = Math.max(0, Math.min(requestedQuantity, Math.floor(filledQuantity)));
  return {
    outcome,
    venueId,
    requestedQuantity,
    filledQuantity: bounded,
    status: bounded === requestedQuantity ? "FILLED" : bounded > 0 ? "PARTIAL" : "UNFILLED",
  };
}

export function simulateBundleExecution(
  candidate: ArbitrageCandidate,
  plan: SimulatedFillPlan = {},
): BundleExecution {
  const yesQuantity = plan.yesQuantity ?? candidate.quantity;
  const noQuantity = plan.noQuantity ?? candidate.quantity;

  // Fill data is an execution boundary. Reject malformed values instead of coercing them.
  if (
    !Number.isSafeInteger(candidate.quantity) ||
    candidate.quantity <= 0 ||
    !isValidFillQuantity(yesQuantity, candidate.quantity) ||
    !isValidFillQuantity(noQuantity, candidate.quantity)
  ) {
    return {
      state: "INVALID",
      yes: unfilledLeg("YES", candidate.yes.venueId, candidate.quantity),
      no: unfilledLeg("NO", candidate.no.venueId, candidate.quantity),
      matchedQuantity: 0,
      residualOutcome: null,
      residualQuantity: 0,
      killSwitch: true,
      message: "Invalid simulated fill quantities were rejected. New trades are blocked.",
    };
  }

  const yes = executionLeg(
    "YES",
    candidate.yes.venueId,
    candidate.quantity,
    yesQuantity,
  );
  const no = executionLeg(
    "NO",
    candidate.no.venueId,
    candidate.quantity,
    noQuantity,
  );
  const matchedQuantity = Math.min(yes.filledQuantity, no.filledQuantity);
  const delta = yes.filledQuantity - no.filledQuantity;
  const residualQuantity = Math.abs(delta);
  const residualOutcome: Outcome | null = delta === 0 ? null : delta > 0 ? "YES" : "NO";

  if (yes.filledQuantity === 0 && no.filledQuantity === 0) {
    return {
      state: "UNFILLED",
      yes,
      no,
      matchedQuantity: 0,
      residualOutcome: null,
      residualQuantity: 0,
      killSwitch: false,
      message: "Neither simulated IOC order filled.",
    };
  }
  if (residualQuantity > 0) {
    return {
      state: "UNHEDGED",
      yes,
      no,
      matchedQuantity,
      residualOutcome,
      residualQuantity,
      killSwitch: true,
      message: `${residualQuantity} ${residualOutcome} shares remain directional. New trades are blocked.`,
    };
  }
  return {
    state: "MATCHED",
    yes,
    no,
    matchedQuantity,
    residualOutcome: null,
    residualQuantity: 0,
    killSwitch: false,
    message: `${matchedQuantity} complementary shares are matched after both simulated fills.`,
  };
}

export function settlementBranches(
  candidate: ArbitrageCandidate,
  matchedQuantity = candidate.quantity,
): readonly SettlementBranch[] {
  const quantity = Math.max(0, Math.min(candidate.quantity, Math.floor(matchedQuantity)));
  const scale = candidate.quantity === 0 ? 0 : quantity / candidate.quantity;
  const payoutMicros = quantity * (candidate.payoutMicros / candidate.quantity);
  const modeledCostMicros = Math.round(candidate.allInCostMicros * scale);
  const modeledProfitMicros = Math.round(payoutMicros - modeledCostMicros);
  return (["YES", "NO"] as const).map((winner) => ({
    winner,
    payoutMicros,
    modeledProfitMicros,
  }));
}
