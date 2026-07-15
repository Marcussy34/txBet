import type { Micros } from "./money";

export type Outcome = "YES" | "NO";

export type MatchAction =
  | "kickoff"
  | "red_card"
  | "injury"
  | "key_player_substitution"
  | "penalty_awarded"
  | "var_review_started"
  | "penalty_overturned"
  | "penalty_scored"
  | "penalty_missed"
  | "goal"
  | "pressure_window"
  | "dangerous_free_kick"
  | "full_time";

export type AgentId =
  | "red-card"
  | "injury"
  | "penalty-var"
  | "goal-reaction"
  | "corner-pressure"
  | "dangerous-free-kick";

export type MarketFamily =
  | "match-winner-binary"
  | "qualification"
  | "next-goal"
  | "total-goals"
  | "correct-score";

export interface TxLineEvent {
  id: string;
  fixtureId: string;
  occurredAt: number;
  minute: number;
  action: MatchAction;
  team?: string;
  description: string;
  confirmed: boolean;
  metrics?: {
    playerImportance?: number;
    cornersLast10?: number;
    shotsLast10?: number;
    possessionPct?: number;
  };
}

export interface SettlementSpec {
  fixtureId: string;
  proposition: string;
  subject: string;
  period: string;
  scope: string;
  line: string | null;
  resolutionRuleId: string;
  voidRuleId: string;
  closesAt: number;
  payoutCurrency: "USD";
  payoutMicros: Micros;
}

export interface CanonicalContract {
  contractId: string;
  venueId: string;
  venueName: string;
  title: string;
  family: MarketFamily;
  outcome: Outcome;
  settlement: SettlementSpec;
}

export interface OrderBookLevel {
  priceMicros: Micros;
  quantity: number;
}

export type FeeModel =
  | {
      kind: "flat-per-share";
      microsPerShare: Micros;
      label: string;
    }
  | {
      kind: "bps-on-cost";
      bps: number;
      label: string;
    };

export interface VenueQuote {
  contract: CanonicalContract;
  asks: readonly OrderBookLevel[];
  feeModel: FeeModel;
  status: "open" | "suspended";
  updatedAt: number;
  updateState: "repriced" | "older-quote" | "baseline";
}

export interface ArbitrageSettings {
  allocatedCapitalMicros: Micros;
  maxExposureMicros: Micros;
  minNetReturnBps: number;
  safetyBufferBps: number;
  maxQuoteAgeMs: number;
  approvedVenues: ReadonlySet<string>;
}

export type ScanReason =
  | "NO_APPROVED_QUOTES"
  | "SUSPENDED_QUOTE"
  | "QUOTE_STALE"
  | "QUOTE_TIMESTAMP_INVALID"
  | "MARKET_CLOSED"
  | "SAME_VENUE"
  | "NOT_COMPLEMENTARY"
  | "SETTLEMENT_MISMATCH"
  | "INSUFFICIENT_LIQUIDITY"
  | "EXPOSURE_LIMIT"
  | "CAPITAL_LIMIT"
  | "COMBINED_COST_GTE_PAYOUT"
  | "MIN_RETURN_NOT_MET";

export interface PricedLeg {
  venueId: string;
  venueName: string;
  contractId: string;
  outcome: Outcome;
  quantity: number;
  averagePriceMicros: Micros;
  rawCostMicros: Micros;
  feeMicros: Micros;
}

export interface ArbitrageCandidate {
  id: string;
  settlementKey: string;
  quantity: number;
  yes: PricedLeg;
  no: PricedLeg;
  rawCostMicros: Micros;
  feeMicros: Micros;
  safetyBufferMicros: Micros;
  allInCostMicros: Micros;
  payoutMicros: Micros;
  grossProfitMicros: Micros;
  netProfitMicros: Micros;
  grossReturnBps: number;
  netReturnBps: number;
}

export interface ScanResult {
  decision: "EXECUTE" | "NO_TRADE";
  candidate: ArbitrageCandidate | null;
  reasons: readonly ScanReason[];
  evaluatedPairs: number;
}

export interface TriggerEvaluation {
  active: boolean;
  agentId: AgentId;
  reason: string;
}

export interface ExecutionLeg {
  outcome: Outcome;
  venueId: string;
  requestedQuantity: number;
  filledQuantity: number;
  status: "FILLED" | "PARTIAL" | "UNFILLED";
}

export interface BundleExecution {
  state: "MATCHED" | "UNHEDGED" | "UNFILLED" | "INVALID";
  yes: ExecutionLeg;
  no: ExecutionLeg;
  matchedQuantity: number;
  residualOutcome: Outcome | null;
  residualQuantity: number;
  killSwitch: boolean;
  message: string;
}

export interface SettlementBranch {
  winner: Outcome;
  payoutMicros: Micros;
  modeledProfitMicros: Micros;
}
