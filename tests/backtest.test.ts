import { describe, expect, it } from "vitest";
import { runBacktest } from "../src/core/backtest";
import { dollarsToMicros } from "../src/core/money";
import { DEMO_SETTINGS, SYNTHETIC_BACKTEST_WINDOWS } from "../src/fixtures/demo-tapes";

describe("synthetic backtest report", () => {
  const report = runBacktest(SYNTHETIC_BACKTEST_WINDOWS, DEMO_SETTINGS);

  it("counts matched, unhedged, and blocked windows separately", () => {
    expect(report).toMatchObject({
      windows: 7,
      candidateCount: 3,
      matchedCount: 2,
      unhedgedCount: 1,
      noTradeCount: 4,
    });
  });

  it("counts only fully matched bundles in locked P&L", () => {
    // Red-card bundle ($4.7958) plus the goal-reaction bundle ($5.8001).
    expect(report.lockedProfitMicros).toBe(dollarsToMicros(10.5959));
    expect(report.lockedReturnBps).toBe(559);
  });

  it("keeps the roster-completing windows honest", () => {
    const injury = report.traces.find((trace) => trace.id === "injury-no-edge")!;
    const goal = report.traces.find((trace) => trace.id === "goal-reaction-fast")!;
    const freeKick = report.traces.find((trace) => trace.id === "free-kick-margin")!;
    expect(injury.scan.decision).toBe("NO_TRADE");
    expect(injury.scan.reasons).toContain("COMBINED_COST_GTE_PAYOUT");
    expect(goal.scan.decision).toBe("EXECUTE");
    expect(goal.execution?.state).toBe("MATCHED");
    expect(freeKick.scan.decision).toBe("NO_TRADE");
    expect(freeKick.scan.reasons).toContain("MIN_RETURN_NOT_MET");
  });

  it("shows that a three-second recheck misses the synthetic red-card gap", () => {
    const fast = report.traces.find((trace) => trace.id === "red-card-fast")!;
    const delayed = report.traces.find((trace) => trace.id === "red-card-delayed")!;
    expect(fast.scan.decision).toBe("EXECUTE");
    expect(fast.execution?.state).toBe("MATCHED");
    expect(delayed.scan.decision).toBe("NO_TRADE");
    expect(delayed.scan.reasons).toContain("COMBINED_COST_GTE_PAYOUT");
  });

  it("does not count unhedged exposure as profit", () => {
    const partial = report.traces.find((trace) => trace.id === "penalty-partial")!;
    expect(partial.execution?.state).toBe("UNHEDGED");
    expect(partial.execution?.killSwitch).toBe(true);
  });
});
