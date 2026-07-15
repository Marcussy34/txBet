import { describe, expect, it } from "vitest";
import { runBacktest } from "../src/core/backtest";
import { dollarsToMicros } from "../src/core/money";
import { DEMO_SETTINGS, SYNTHETIC_BACKTEST_WINDOWS } from "../src/fixtures/demo-tapes";

describe("synthetic backtest report", () => {
  const report = runBacktest(SYNTHETIC_BACKTEST_WINDOWS, DEMO_SETTINGS);

  it("counts matched, unhedged, and blocked windows separately", () => {
    expect(report).toMatchObject({
      windows: 4,
      candidateCount: 2,
      matchedCount: 1,
      unhedgedCount: 1,
      noTradeCount: 2,
    });
  });

  it("counts only fully matched bundles in locked P&L", () => {
    expect(report.lockedProfitMicros).toBe(dollarsToMicros(4.7958));
    expect(report.lockedReturnBps).toBe(503);
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
