import { describe, expect, it } from "vitest";
import { runPipeline } from "../src/core/pipeline";
import { DEMO_SCENARIOS, DEMO_SETTINGS } from "../src/fixtures/demo-tapes";

describe("strategy pipeline", () => {
  it("does not scan when the selected agent is not triggered", () => {
    const frame = DEMO_SCENARIOS[0]!.frames[2]!;
    const result = runPipeline({
      agentId: "goal-reaction",
      event: frame.event,
      quotes: frame.quotes,
      settings: DEMO_SETTINGS,
      now: frame.now,
    });
    expect(result.trigger.active).toBe(false);
    expect(result.scan.evaluatedPairs).toBe(0);
    expect(result.scan.candidate).toBeNull();
  });

  it("keeps the settlement-proof frame executable for both modeled branches", () => {
    const frame = DEMO_SCENARIOS[0]!.frames.find((item) => item.settlement)!;
    const result = runPipeline({
      agentId: "red-card",
      event: frame.event,
      quotes: frame.quotes,
      settings: DEMO_SETTINGS,
      now: frame.now,
    });
    expect(result.scan.decision).toBe("EXECUTE");
    expect(result.scan.candidate).not.toBeNull();
  });

  it("does not scan quotes for a different fixture than the triggering event", () => {
    const frame = DEMO_SCENARIOS[0]!.frames[2]!;
    const result = runPipeline({
      agentId: "red-card",
      event: { ...frame.event!, fixtureId: "wc-other-fixture" },
      quotes: frame.quotes,
      settings: DEMO_SETTINGS,
      now: frame.now,
    });

    expect(result.trigger.active).toBe(true);
    expect(result.scan.decision).toBe("NO_TRADE");
    expect(result.scan.evaluatedPairs).toBe(0);
    expect(result.scan.candidate).toBeNull();
  });

  it("does not scan market families outside the selected agent definition", () => {
    const frame = DEMO_SCENARIOS[0]!.frames[2]!;
    const outOfScopeQuotes = frame.quotes.map((quote) => ({
      ...quote,
      contract: { ...quote.contract, family: "correct-score" as const },
    }));
    const result = runPipeline({
      agentId: "red-card",
      event: frame.event,
      quotes: outOfScopeQuotes,
      settings: DEMO_SETTINGS,
      now: frame.now,
    });

    expect(result.trigger.active).toBe(true);
    expect(result.scan.decision).toBe("NO_TRADE");
    expect(result.scan.evaluatedPairs).toBe(0);
    expect(result.scan.candidate).toBeNull();
  });
});
