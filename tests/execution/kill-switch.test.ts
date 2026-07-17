import { describe, expect, it } from "vitest";

import {
  evaluateExecutionAction,
  type ExecutionAction,
  type ExecutionSafetySnapshot,
} from "@/execution/kill-switch";

function healthy(): ExecutionSafetySnapshot {
  return {
    entryPaused: false,
    unresolvedResidual: false,
    marketDataTrusted: true,
    marketDataFresh: true,
    independentOrderStatusFresh: true,
    independentResolutionFresh: true,
    settlementValid: true,
    targetWriteIntegrity: "trusted",
    recoveryMode: "enabled",
    recoveryPathHealthy: true,
    grantCurrent: true,
    certificationCurrent: true,
    eligibilityFresh: true,
    databaseCertain: true,
    reconciliationBacklogClear: true,
  };
}

const actions: readonly ExecutionAction[] = [
  "entry",
  "cancel",
  "compensate",
  "redeem",
  "reconcile",
];

describe("typed execution action matrix", () => {
  it.each(actions)("allows %s in a fully healthy snapshot", (action) => {
    expect(evaluateExecutionAction(action, healthy())).toEqual({
      allowed: true,
      reasonCodes: [],
    });
  });

  it("entry pause and residual block only new entry", () => {
    for (const mutation of [
      { entryPaused: true },
      { unresolvedResidual: true },
    ]) {
      expect(
        evaluateExecutionAction("entry", { ...healthy(), ...mutation }).allowed,
      ).toBe(false);
      for (const action of ["cancel", "compensate", "redeem", "reconcile"] as const) {
        expect(
          evaluateExecutionAction(action, { ...healthy(), ...mutation }).allowed,
        ).toBe(true);
      }
    }
  });

  it("applies the untrusted market-data row exactly", () => {
    const snapshot = { ...healthy(), marketDataTrusted: false };
    expect(evaluateExecutionAction("entry", snapshot).allowed).toBe(false);
    expect(evaluateExecutionAction("cancel", snapshot).allowed).toBe(true);
    expect(evaluateExecutionAction("compensate", snapshot).allowed).toBe(false);
    expect(evaluateExecutionAction("redeem", snapshot).allowed).toBe(true);
    expect(evaluateExecutionAction("reconcile", snapshot).allowed).toBe(true);

    expect(
      evaluateExecutionAction("cancel", {
        ...snapshot,
        independentOrderStatusFresh: false,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateExecutionAction("redeem", {
        ...snapshot,
        independentResolutionFresh: false,
      }).allowed,
    ).toBe(false);
  });

  it("allows only risk-reducing cancellation and reconciliation for invalid settlement", () => {
    const snapshot = { ...healthy(), settlementValid: false };
    expect(evaluateExecutionAction("entry", snapshot).allowed).toBe(false);
    expect(evaluateExecutionAction("cancel", snapshot).allowed).toBe(true);
    expect(evaluateExecutionAction("compensate", snapshot).allowed).toBe(false);
    expect(evaluateExecutionAction("redeem", snapshot).allowed).toBe(false);
    expect(evaluateExecutionAction("reconcile", snapshot).allowed).toBe(true);
  });

  it("blocks every write to a compromised target while preserving reconciliation", () => {
    const snapshot = { ...healthy(), targetWriteIntegrity: "compromised" as const };
    for (const action of ["entry", "cancel", "compensate", "redeem"] as const) {
      expect(evaluateExecutionAction(action, snapshot).allowed).toBe(false);
    }
    expect(evaluateExecutionAction("reconcile", snapshot).allowed).toBe(true);
  });

  it("freezes every new mutation when recovery is frozen or unhealthy", () => {
    for (const mutation of [
      { recoveryMode: "frozen" as const },
      { recoveryPathHealthy: false },
    ]) {
      for (const action of ["entry", "cancel", "compensate", "redeem"] as const) {
        expect(
          evaluateExecutionAction(action, { ...healthy(), ...mutation }).allowed,
        ).toBe(false);
      }
      expect(
        evaluateExecutionAction("reconcile", { ...healthy(), ...mutation }).allowed,
      ).toBe(true);
    }
  });

  it.each([
    ["grantCurrent", "GRANT_NOT_CURRENT"],
    ["certificationCurrent", "CERTIFICATION_NOT_CURRENT"],
    ["eligibilityFresh", "ELIGIBILITY_NOT_FRESH"],
    ["databaseCertain", "DATABASE_UNCERTAIN"],
  ] as const)("fails closed on %s for writes but not reads", (field, reason) => {
    const snapshot = { ...healthy(), [field]: false };
    for (const action of ["entry", "cancel", "compensate", "redeem"] as const) {
      expect(evaluateExecutionAction(action, snapshot)).toMatchObject({
        allowed: false,
        reasonCodes: expect.arrayContaining([reason]),
      });
    }
    expect(evaluateExecutionAction("reconcile", snapshot).allowed).toBe(true);
  });

  it("uses freshness and reconciliation backlog only where new priced risk is created", () => {
    const stale = { ...healthy(), marketDataFresh: false };
    expect(evaluateExecutionAction("entry", stale).allowed).toBe(false);
    expect(evaluateExecutionAction("compensate", stale).allowed).toBe(false);
    expect(evaluateExecutionAction("cancel", stale).allowed).toBe(true);
    expect(evaluateExecutionAction("redeem", stale).allowed).toBe(true);

    const backlog = { ...healthy(), reconciliationBacklogClear: false };
    expect(evaluateExecutionAction("entry", backlog).allowed).toBe(false);
    expect(evaluateExecutionAction("cancel", backlog).allowed).toBe(true);
    expect(evaluateExecutionAction("reconcile", backlog).allowed).toBe(true);
  });

  it("returns every applicable reason in deterministic precedence order", () => {
    expect(
      evaluateExecutionAction("entry", {
        ...healthy(),
        entryPaused: true,
        unresolvedResidual: true,
        marketDataTrusted: false,
        recoveryMode: "frozen",
        databaseCertain: false,
      }).reasonCodes,
    ).toEqual([
      "DATABASE_UNCERTAIN",
      "RECOVERY_FROZEN",
      "ENTRY_PAUSED",
      "UNRESOLVED_RESIDUAL",
      "MARKET_DATA_UNTRUSTED",
    ]);
  });
});
