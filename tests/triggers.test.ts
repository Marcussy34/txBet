import { describe, expect, it } from "vitest";
import { evaluateTrigger } from "../src/agents/trigger-router";
import type { MatchAction, TxLineEvent } from "../src/core/types";

function event(action: MatchAction, metrics?: TxLineEvent["metrics"]): TxLineEvent {
  return {
    id: `event-${action}`,
    fixtureId: "fixture-1",
    occurredAt: 1,
    minute: 60,
    action,
    description: action,
    confirmed: true,
    ...(metrics ? { metrics } : {}),
  };
}

describe("agent trigger router", () => {
  it("activates the red-card agent only on red cards", () => {
    expect(evaluateTrigger("red-card", event("red_card")).active).toBe(true);
    expect(evaluateTrigger("red-card", event("goal")).active).toBe(false);
  });

  it("requires a high-importance injury", () => {
    expect(evaluateTrigger("injury", event("injury", { playerImportance: 0.69 })).active).toBe(false);
    expect(evaluateTrigger("injury", event("injury", { playerImportance: 0.8 })).active).toBe(true);
  });

  it("requires the complete corner-pressure window", () => {
    expect(evaluateTrigger("corner-pressure", event("pressure_window", {
      cornersLast10: 3,
      shotsLast10: 2,
      possessionPct: 70,
    })).active).toBe(false);
    expect(evaluateTrigger("corner-pressure", event("pressure_window", {
      cornersLast10: 3,
      shotsLast10: 4,
      possessionPct: 68,
    })).active).toBe(true);
  });

  it("allows VAR review to trigger while the decision is provisional", () => {
    const provisional = { ...event("var_review_started"), confirmed: false };
    expect(evaluateTrigger("penalty-var", provisional).active).toBe(true);
  });

  it("waits when no event exists", () => {
    expect(evaluateTrigger("goal-reaction", null).active).toBe(false);
  });
});
