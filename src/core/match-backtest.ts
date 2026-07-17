// Per-agent $100-bankroll backtest over real match windows. Every agent does two
// things from its own slice of live TxLINE state: exact-complement scans through
// the unchanged live pipeline (locked payout), and momentum entries that position
// on the tournament-path book before it finalizes (directional, settled against
// the official result). Both draw from the same bankroll in event order.
import { AGENTS, type AgentDefinition } from "../agents/definitions";
import { simulateBundleExecution } from "./executor";
import { runPipeline } from "./pipeline";
import type { BacktestWindow } from "./backtest";
import type { AgentId, ArbitrageSettings, ScanReason } from "./types";
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

// Momentum sizing rule, fixed with the strategy: 25% of free capital per signal.
const MOMENTUM_FRACTION = 4;

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

export interface MomentumTradeInput {
  id: string;
  agentId: string;
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

export interface MomentumPosition extends MomentumTradeInput {
  contracts: number;
  costMicros: Micros;
  payoutMicros: Micros;
  pnlMicros: Micros;
}

export interface MatchAgentReport {
  agent: AgentDefinition;
  windowsScanned: number;
  trades: readonly MatchTradeRow[];
  positions: readonly MomentumPosition[];
  refusals: readonly MatchRefusalRow[];
  deployedMicros: Micros;
  lockedProfitMicros: Micros;
  momentumPnlMicros: Micros;
  settledPnlMicros: Micros;
  endingCapitalMicros: Micros;
}

type AgentItem =
  | { kind: "window"; at: number; window: BacktestWindow }
  | { kind: "momentum"; at: number; trade: MomentumTradeInput };

export function runAgentMatchBacktest(
  windows: readonly BacktestWindow[],
  momentum: readonly MomentumTradeInput[] = [],
): readonly MatchAgentReport[] {
  return AGENTS.map((agent) => {
    const items: AgentItem[] = [
      ...windows
        .filter((window) => window.agentId === agent.id)
        .map((window): AgentItem => ({ kind: "window", at: window.now, window })),
      ...momentum
        .filter((trade) => trade.agentId === agent.id)
        .map((trade): AgentItem => ({ kind: "momentum", at: trade.enteredAt, trade })),
    ].sort((a, b) => a.at - b.at);

    let remaining = MATCH_BANKROLL_MICROS;
    let deployed = 0;
    let locked = 0;
    let complementCost = 0;
    let momentumPayout = 0;
    let momentumCost = 0;
    const trades: MatchTradeRow[] = [];
    const positions: MomentumPosition[] = [];
    const refusals: MatchRefusalRow[] = [];

    for (const item of items) {
      if (item.kind === "momentum") {
        const trade = item.trade;
        const perShare = trade.entryPriceMicros + trade.feePerShareMicros;
        const contracts = Math.floor(Math.floor(remaining / MOMENTUM_FRACTION) / perShare);
        if (contracts <= 0) continue;
        const cost = contracts * perShare;
        const payout = trade.won ? contracts * 1_000_000 : 0;
        remaining -= cost;
        deployed += cost;
        momentumCost += cost;
        momentumPayout += payout;
        positions.push({
          ...trade,
          contracts,
          costMicros: cost,
          payoutMicros: payout,
          pnlMicros: payout - cost,
        });
        continue;
      }

      const window = item.window;
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
      complementCost += cost;
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

    // Settlement: complements return their all-in cost plus the locked edge
    // (exactly one leg pays $1); momentum positions pay out only when the
    // proposition settled YES.
    const momentumPnl = momentumPayout - momentumCost;
    return {
      agent,
      windowsScanned: items.filter((item) => item.kind === "window").length,
      trades,
      positions,
      refusals,
      deployedMicros: deployed,
      lockedProfitMicros: locked,
      momentumPnlMicros: momentumPnl,
      settledPnlMicros: locked + momentumPnl,
      endingCapitalMicros: remaining + complementCost + locked + momentumPayout,
    };
  });
}

export function reportsByAgentId(
  reports: readonly MatchAgentReport[],
): ReadonlyMap<AgentId, MatchAgentReport> {
  return new Map(reports.map((report) => [report.agent.id, report]));
}
