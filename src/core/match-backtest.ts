// Per-agent $100-bankroll backtest over real match windows, plus settlement for
// the match-dominance strategy. Wraps the unchanged runPipeline/executor so every
// scan passes the same gates as the live path.
import { AGENTS, type AgentDefinition } from "../agents/definitions";
import { simulateBundleExecution } from "./executor";
import { runPipeline } from "./pipeline";
import type { BacktestWindow } from "./backtest";
import type {
  AgentId,
  ArbitrageSettings,
  ScanReason,
} from "./types";
import type { Micros } from "./money";

export const MATCH_BANKROLL_MICROS: Micros = 100_000_000; // $100 per agent

// Mirrors DEMO_SETTINGS gates; capital/exposure are re-scoped per window to the
// agent's remaining bankroll so sizing can never exceed free capital.
const BASE_SETTINGS: Omit<ArbitrageSettings, "allocatedCapitalMicros" | "maxExposureMicros"> = {
  minNetReturnBps: 200,
  safetyBufferBps: 43,
  maxQuoteAgeMs: 90_000, // venue history is minute-bucketed; live mode uses 5s
  approvedVenues: new Set(["kalshi", "polymarket"]),
};

export interface MatchTradeRow {
  windowId: string;
  label: string;
  at: number;
  proposition: string;
  yesVenue: string;
  noVenue: string;
  contracts: number;
  costMicros: Micros;
  feesMicros: Micros;
  lockedProfitMicros: Micros;
}

export interface MatchRefusalRow {
  windowId: string;
  label: string;
  at: number;
  reasons: readonly ScanReason[];
  triggerReason: string | null; // set when the trigger itself declined the event
}

export interface MatchAgentReport {
  agent: AgentDefinition;
  windowsScanned: number;
  trades: readonly MatchTradeRow[];
  refusals: readonly MatchRefusalRow[];
  deployedMicros: Micros;
  lockedProfitMicros: Micros;
  endingCapitalMicros: Micros;
}

export function runAgentMatchBacktest(
  windows: readonly BacktestWindow[],
): readonly MatchAgentReport[] {
  return AGENTS.map((agent) => {
    const own = windows
      .filter((window) => window.agentId === agent.id)
      .sort((a, b) => a.now - b.now);

    let remaining = MATCH_BANKROLL_MICROS;
    let deployed = 0;
    let locked = 0;
    const trades: MatchTradeRow[] = [];
    const refusals: MatchRefusalRow[] = [];

    for (const window of own) {
      const settings: ArbitrageSettings = {
        ...BASE_SETTINGS,
        allocatedCapitalMicros: remaining,
        maxExposureMicros: remaining,
      };
      const result = runPipeline({
        agentId: window.agentId,
        event: window.event,
        quotes: window.quotes,
        settings,
        now: window.now,
      });

      if (!result.trigger.active) {
        refusals.push({
          windowId: window.id,
          label: window.label,
          at: window.now,
          reasons: [],
          triggerReason: result.trigger.reason,
        });
        continue;
      }

      const candidate = result.scan.candidate;
      if (result.scan.decision !== "EXECUTE" || !candidate) {
        refusals.push({
          windowId: window.id,
          label: window.label,
          at: window.now,
          reasons: result.scan.reasons,
          triggerReason: null,
        });
        continue;
      }

      const execution = simulateBundleExecution(candidate);
      if (execution.state !== "MATCHED" || execution.matchedQuantity <= 0) {
        refusals.push({
          windowId: window.id,
          label: window.label,
          at: window.now,
          reasons: ["INSUFFICIENT_LIQUIDITY"],
          triggerReason: null,
        });
        continue;
      }

      const scale = execution.matchedQuantity / candidate.quantity;
      const cost = Math.round(candidate.allInCostMicros * scale);
      const profit = Math.round(candidate.netProfitMicros * scale);
      remaining -= cost;
      deployed += cost;
      locked += profit;
      trades.push({
        windowId: window.id,
        label: window.label,
        at: window.now,
        proposition: candidate.yes.contractId.split(":")[1] ?? candidate.settlementKey,
        yesVenue: candidate.yes.venueName,
        noVenue: candidate.no.venueName,
        contracts: execution.matchedQuantity,
        costMicros: cost,
        feesMicros: Math.round(candidate.feeMicros * scale),
        lockedProfitMicros: profit,
      });
    }

    // Exactly one leg of every matched complement pays $1 at settlement, so the
    // full all-in cost returns plus the locked edge.
    return {
      agent,
      windowsScanned: own.length,
      trades,
      refusals,
      deployedMicros: deployed,
      lockedProfitMicros: locked,
      endingCapitalMicros: MATCH_BANKROLL_MICROS + locked,
    };
  });
}

// ---------- match-dominance strategy ----------

export interface DominanceTradeInput {
  id: string;
  enteredAt: number;
  minute: number;
  side: string;
  proposition: string;
  title: string;
  signal: string;
  entryPriceMicros: Micros;
  feePerShareMicros: Micros;
  won: boolean;
}

export interface DominancePosition extends DominanceTradeInput {
  contracts: number;
  costMicros: Micros;
  payoutMicros: Micros;
  pnlMicros: Micros;
}

export interface DominanceReport {
  positions: readonly DominancePosition[];
  deployedMicros: Micros;
  pnlMicros: Micros;
  endingCapitalMicros: Micros;
}

// Sizing rule fixed with the strategy: 25% of remaining bankroll per signal.
export function settleDominance(
  trades: readonly DominanceTradeInput[],
): DominanceReport {
  let remaining = MATCH_BANKROLL_MICROS;
  let deployed = 0;
  let payoutTotal = 0;
  const positions: DominancePosition[] = [];

  for (const trade of [...trades].sort((a, b) => a.enteredAt - b.enteredAt)) {
    const perShare = trade.entryPriceMicros + trade.feePerShareMicros;
    const budget = Math.floor(remaining / 4);
    const contracts = Math.floor(budget / perShare);
    if (contracts <= 0) continue;
    const cost = contracts * perShare;
    const payout = trade.won ? contracts * 1_000_000 : 0;
    remaining -= cost;
    deployed += cost;
    payoutTotal += payout;
    positions.push({
      ...trade,
      contracts,
      costMicros: cost,
      payoutMicros: payout,
      pnlMicros: payout - cost,
    });
  }

  return {
    positions,
    deployedMicros: deployed,
    pnlMicros: payoutTotal - deployed,
    endingCapitalMicros: remaining + payoutTotal,
  };
}

export function reportsByAgentId(
  reports: readonly MatchAgentReport[],
): ReadonlyMap<AgentId, MatchAgentReport> {
  return new Map(reports.map((report) => [report.agent.id, report]));
}
