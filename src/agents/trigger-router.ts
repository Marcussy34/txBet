import type { AgentId, TriggerEvaluation, TxLineEvent } from "../core/types";
import { getAgent } from "./definitions";

export function evaluateTrigger(agentId: AgentId, event: TxLineEvent | null): TriggerEvaluation {
  const agent = getAgent(agentId);
  if (!event) {
    return { active: false, agentId, reason: "Waiting for a qualifying TxLINE match action." };
  }
  if (!event.confirmed && event.action !== "var_review_started") {
    return { active: false, agentId, reason: "Provider event is not confirmed." };
  }
  if (!agent.eventTypes.includes(event.action)) {
    return { active: false, agentId, reason: `${agent.shortName} does not activate on ${event.action}.` };
  }

  if (agentId === "injury" && (event.metrics?.playerImportance ?? 0) < 0.7) {
    return { active: false, agentId, reason: "Player-importance score is below the 0.70 trigger threshold." };
  }
  if (agentId === "corner-pressure") {
    const metrics = event.metrics;
    const pressure =
      (metrics?.cornersLast10 ?? 0) >= 2 &&
      (metrics?.shotsLast10 ?? 0) >= 3 &&
      (metrics?.possessionPct ?? 0) >= 60;
    if (!pressure) {
      return { active: false, agentId, reason: "The pressure window has not met corners, shots, and possession thresholds." };
    }
  }

  return {
    active: true,
    agentId,
    reason: `${event.description} activated ${agent.name}.`,
  };
}
