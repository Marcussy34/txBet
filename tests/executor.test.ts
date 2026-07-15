import { describe, expect, it } from "vitest";
import { simulateBundleExecution, settlementBranches } from "../src/core/executor";
import { scanArbitrage } from "../src/core/optimizer";
import { DEMO_SCENARIOS, DEMO_SETTINGS } from "../src/fixtures/demo-tapes";

const frame = DEMO_SCENARIOS[0]!.frames[2]!;
const candidate = scanArbitrage(frame.quotes, DEMO_SETTINGS, frame.now).candidate!;

describe("bundle execution", () => {
  it("marks equal completed fills as matched", () => {
    expect(simulateBundleExecution(candidate)).toMatchObject({
      state: "MATCHED",
      matchedQuantity: 100,
      residualQuantity: 0,
      killSwitch: false,
    });
  });

  it("marks unequal fills as unhedged and trips the kill switch", () => {
    expect(simulateBundleExecution(candidate, { yesQuantity: 100, noQuantity: 70 })).toMatchObject({
      state: "UNHEDGED",
      matchedQuantity: 70,
      residualOutcome: "YES",
      residualQuantity: 30,
      killSwitch: true,
    });
  });

  it("does not trip the kill switch when neither leg fills", () => {
    expect(simulateBundleExecution(candidate, { yesQuantity: 0, noQuantity: 0 })).toMatchObject({
      state: "UNFILLED",
      matchedQuantity: 0,
      killSwitch: false,
    });
  });

  it.each([
    ["NaN", Number.NaN],
    ["positive infinity", Number.POSITIVE_INFINITY],
    ["negative infinity", Number.NEGATIVE_INFINITY],
    ["negative", -1],
    ["fractional", 99.5],
    ["overfilled", candidate.quantity + 1],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1],
  ])("fails closed for a %s simulated fill on either leg", (_label, invalidQuantity) => {
    for (const plan of [
      { yesQuantity: invalidQuantity },
      { noQuantity: invalidQuantity },
    ]) {
      expect(simulateBundleExecution(candidate, plan)).toMatchObject({
        state: "INVALID",
        yes: { filledQuantity: 0, status: "UNFILLED" },
        no: { filledQuantity: 0, status: "UNFILLED" },
        matchedQuantity: 0,
        residualOutcome: null,
        residualQuantity: 0,
        killSwitch: true,
      });
    }
  });

  it("models identical profit for either settlement outcome", () => {
    const branches = settlementBranches(candidate);
    expect(branches[0]!.winner).toBe("YES");
    expect(branches[1]!.winner).toBe("NO");
    expect(branches[0]!.modeledProfitMicros).toBe(branches[1]!.modeledProfitMicros);
  });
});
