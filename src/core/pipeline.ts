import { evaluateTrigger } from "../agents/trigger-router";
import { getAgent } from "../agents/definitions";
import { scanArbitrage } from "./optimizer";
import type {
  AgentId,
  ArbitrageSettings,
  ScanResult,
  TriggerEvaluation,
  TxLineEvent,
  VenueQuote,
} from "./types";

export interface PipelineResult {
  trigger: TriggerEvaluation;
  scan: ScanResult;
}

export function runPipeline(input: {
  agentId: AgentId;
  event: TxLineEvent | null;
  quotes: readonly VenueQuote[];
  settings: ArbitrageSettings;
  now: number;
}): PipelineResult {
  const trigger = evaluateTrigger(input.agentId, input.event);
  if (!trigger.active) {
    return {
      trigger,
      scan: {
        decision: "NO_TRADE",
        candidate: null,
        reasons: [],
        evaluatedPairs: 0,
      },
    };
  }
  const agent = getAgent(input.agentId);
  const scopedQuotes = input.quotes.filter(
    (quote) =>
      quote.contract.settlement.fixtureId === input.event?.fixtureId &&
      agent.marketFamilies.includes(quote.contract.family),
  );
  return {
    trigger,
    scan: scanArbitrage(scopedQuotes, input.settings, input.now),
  };
}
