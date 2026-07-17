import { describe, expect, it } from "vitest";

import {
  ARG_SUI_DOMINANCE_TRADES,
  ARG_SUI_FIXTURE,
  ARG_SUI_WINDOWS,
} from "@/fixtures/matches/arg-sui-2026-07-11";
import {
  MATCH_BANKROLL_MICROS,
  runAgentMatchBacktest,
  settleDominance,
} from "@/core/match-backtest";

describe("arg-sui artifact invariants", () => {
  it("keeps windows chronological with well-formed quotes", () => {
    expect(ARG_SUI_WINDOWS.length).toBeGreaterThanOrEqual(8);
    for (let i = 1; i < ARG_SUI_WINDOWS.length; i += 1) {
      expect(ARG_SUI_WINDOWS[i]!.now).toBeGreaterThanOrEqual(ARG_SUI_WINDOWS[i - 1]!.now);
    }
    for (const window of ARG_SUI_WINDOWS) {
      expect(window.quotes.length).toBeGreaterThan(0);
      for (const quote of window.quotes) {
        expect(Number.isSafeInteger(quote.asks[0]!.priceMicros)).toBe(true);
        expect(quote.asks[0]!.priceMicros).toBeGreaterThan(0);
        expect(quote.asks[0]!.priceMicros).toBeLessThan(1_000_000);
        expect(quote.updatedAt).toBeLessThan(window.now);
      }
    }
  });

  it("pins the match's settled propositions", () => {
    expect(ARG_SUI_FIXTURE.settledPropositions["match-draw-regulation"]).toBe(true);
    expect(ARG_SUI_FIXTURE.settledPropositions["argentina-advances"]).toBe(true);
    expect(ARG_SUI_FIXTURE.settledPropositions["match-winner-arg-regulation"]).toBe(false);
    expect(ARG_SUI_FIXTURE.settledPropositions["switzerland-advances"]).toBe(false);
  });
});

describe("per-agent $100 bankroll backtest", () => {
  const reports = runAgentMatchBacktest(ARG_SUI_WINDOWS);

  it("covers all six agents and never overdraws capital", () => {
    expect(reports).toHaveLength(6);
    for (const report of reports) {
      expect(report.deployedMicros).toBeLessThanOrEqual(MATCH_BANKROLL_MICROS);
      expect(report.deployedMicros).toBeGreaterThanOrEqual(0);
      expect(report.endingCapitalMicros).toBe(MATCH_BANKROLL_MICROS + report.lockedProfitMicros);
      expect(report.trades.length + report.refusals.length).toBe(report.windowsScanned);
    }
  });

  it("locks a profitable complement on the equalizer window", () => {
    const goalReaction = reports.find((r) => r.agent.id === "goal-reaction");
    expect(goalReaction).toBeDefined();
    const equalizer = goalReaction!.trades.find((t) => t.windowId === "goal-sui-equalizer");
    expect(equalizer).toBeDefined();
    expect(equalizer!.lockedProfitMicros).toBeGreaterThan(0);
    expect(equalizer!.costMicros).toBeLessThanOrEqual(MATCH_BANKROLL_MICROS);
  });

  it("refuses while the VAR review suspends the affected books", () => {
    const penaltyVar = reports.find((r) => r.agent.id === "penalty-var");
    const review = penaltyVar!.refusals.find((r) => r.windowId === "var-review");
    expect(review).toBeDefined();
    expect(review!.reasons).toContain("SUSPENDED_QUOTE");
  });

  it("preserves capital on refusal-only agents", () => {
    for (const report of reports) {
      if (report.trades.length === 0) {
        expect(report.endingCapitalMicros).toBe(MATCH_BANKROLL_MICROS);
      }
    }
  });
});

describe("match-dominance settlement", () => {
  const report = settleDominance(ARG_SUI_DOMINANCE_TRADES);

  it("enters ahead of the outcome and settles at real prices", () => {
    expect(report.positions.length).toBeGreaterThanOrEqual(1);
    for (const position of report.positions) {
      expect(position.entryPriceMicros).toBeGreaterThan(0);
      expect(position.entryPriceMicros).toBeLessThanOrEqual(800_000); // rule: entry <= $0.80
      expect(position.costMicros).toBeLessThanOrEqual(MATCH_BANKROLL_MICROS / 4 + position.entryPriceMicros);
    }
    expect(report.endingCapitalMicros).toBe(
      MATCH_BANKROLL_MICROS - report.deployedMicros + report.positions.reduce((s, p) => s + p.payoutMicros, 0),
    );
  });

  it("shows a positive settled PnL on this match", () => {
    expect(report.pnlMicros).toBeGreaterThan(0);
  });
});
