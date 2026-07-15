import { simulateBundleExecution, type SimulatedFillPlan } from "./executor";
import { runPipeline } from "./pipeline";
import type {
  AgentId,
  ArbitrageSettings,
  BundleExecution,
  ScanResult,
  TxLineEvent,
  VenueQuote,
} from "./types";

export interface BacktestWindow {
  id: string;
  label: string;
  latencyMs: number;
  agentId: AgentId;
  event: TxLineEvent;
  quotes: readonly VenueQuote[];
  now: number;
  execution?: SimulatedFillPlan | "matched";
}

export interface BacktestTrace {
  id: string;
  label: string;
  latencyMs: number;
  scan: ScanResult;
  execution: BundleExecution | null;
}

export interface BacktestReport {
  windows: number;
  candidateCount: number;
  matchedCount: number;
  unhedgedCount: number;
  noTradeCount: number;
  lockedProfitMicros: number;
  matchedCapitalMicros: number;
  lockedReturnBps: number;
  traces: readonly BacktestTrace[];
}

export function runBacktest(
  windows: readonly BacktestWindow[],
  settings: ArbitrageSettings,
): BacktestReport {
  let candidateCount = 0;
  let matchedCount = 0;
  let unhedgedCount = 0;
  let noTradeCount = 0;
  let lockedProfitMicros = 0;
  let matchedCapitalMicros = 0;

  const traces = windows.map((window): BacktestTrace => {
    const result = runPipeline({
      agentId: window.agentId,
      event: window.event,
      quotes: window.quotes,
      settings,
      now: window.now,
    });
    const candidate = result.scan.candidate;
    if (!candidate) {
      noTradeCount += 1;
      return {
        id: window.id,
        label: window.label,
        latencyMs: window.latencyMs,
        scan: result.scan,
        execution: null,
      };
    }

    candidateCount += 1;
    const execution = window.execution
      ? simulateBundleExecution(
          candidate,
          window.execution === "matched" ? {} : window.execution,
        )
      : null;
    if (execution?.state === "MATCHED") {
      matchedCount += 1;
      const scale = execution.matchedQuantity / candidate.quantity;
      lockedProfitMicros += Math.round(candidate.netProfitMicros * scale);
      matchedCapitalMicros += Math.round(candidate.allInCostMicros * scale);
    } else if (execution?.state === "UNHEDGED") {
      unhedgedCount += 1;
    }

    return {
      id: window.id,
      label: window.label,
      latencyMs: window.latencyMs,
      scan: result.scan,
      execution,
    };
  });

  return {
    windows: windows.length,
    candidateCount,
    matchedCount,
    unhedgedCount,
    noTradeCount,
    lockedProfitMicros,
    matchedCapitalMicros,
    lockedReturnBps: matchedCapitalMicros > 0
      ? Math.floor((lockedProfitMicros * 10_000) / matchedCapitalMicros)
      : 0,
    traces,
  };
}
