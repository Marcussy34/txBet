import type { AgentId, MarketFamily, MatchAction } from "../core/types";

export interface AgentDefinition {
  id: AgentId;
  name: string;
  shortName: string;
  description: string;
  eventTypes: readonly MatchAction[];
  marketFamilies: readonly MarketFamily[];
}

export const AGENTS: readonly AgentDefinition[] = [
  {
    id: "red-card",
    name: "Red Card Arbitrage Agent",
    shortName: "Red card",
    description: "Scans exact binary winner, qualification, next-goal, and totals complements after a confirmed dismissal.",
    eventTypes: ["red_card"],
    marketFamilies: ["match-winner-binary", "qualification", "next-goal", "total-goals"],
  },
  {
    id: "injury",
    name: "Injury Arbitrage Agent",
    shortName: "Injury",
    description: "Activates for high-importance injuries or substitutions, then routes into the shared matcher.",
    eventTypes: ["injury", "key_player_substitution"],
    marketFamilies: ["match-winner-binary", "qualification", "next-goal"],
  },
  {
    id: "penalty-var",
    name: "Penalty & VAR Arbitrage Agent",
    shortName: "Penalty / VAR",
    description: "Rescans at each penalty and VAR transition; unmatched orders are cancelled before reversals.",
    eventTypes: [
      "penalty_awarded",
      "var_review_started",
      "penalty_overturned",
      "penalty_scored",
      "penalty_missed",
    ],
    marketFamilies: ["match-winner-binary", "next-goal", "total-goals"],
  },
  {
    id: "goal-reaction",
    name: "Goal Reaction Arbitrage Agent",
    shortName: "Goal reaction",
    description: "Compares venue repricing after a confirmed goal across binary match, qualification, next-goal, and totals markets.",
    eventTypes: ["goal"],
    marketFamilies: ["match-winner-binary", "qualification", "next-goal", "total-goals"],
  },
  {
    id: "corner-pressure",
    name: "Corner Pressure Agent",
    shortName: "Corner pressure",
    description: "Requires a pressure window—not a single corner—before checking next-goal and totals complements.",
    eventTypes: ["pressure_window"],
    marketFamilies: ["next-goal", "total-goals"],
  },
  {
    id: "dangerous-free-kick",
    name: "Dangerous Free-Kick Agent",
    shortName: "Free kick",
    description: "Uses a dangerous-zone free kick as a scan trigger without betting that the kick itself scores.",
    eventTypes: ["dangerous_free_kick"],
    marketFamilies: ["next-goal", "total-goals"],
  },
] as const;

export function getAgent(id: AgentId): AgentDefinition {
  const agent = AGENTS.find((candidate) => candidate.id === id);
  if (!agent) throw new Error(`Unknown agent ${id}`);
  return agent;
}
