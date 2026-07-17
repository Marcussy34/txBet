import { describe, expect, it } from "vitest";

import {
  assertDflowCanaryClaimBudget,
  calculateDflowRiskMicros,
} from "@/server/execution/dflow-canary-budget";
import type { BlobExecutionJournal, BlobJournalEvent } from "@/server/execution/blob-journal";

function journal(events: readonly Partial<BlobJournalEvent>[]): BlobExecutionJournal {
  return {
    schemaVersion: "txbet-blob-journal-v1",
    profileId: "did:privy:user-1",
    revision: events.length,
    events: events as readonly BlobJournalEvent[],
  };
}

const control = {
  id: "control:1",
  kind: "CONTROL_UPDATED",
  occurredAtMs: 1_000,
  payload: {
    schemaVersion: "txbet-execution-control-v1",
    version: 1,
    mode: "canary",
    maxTotalMicros: 10_000_000,
    expiresAtMs: 10_000,
    updatedAtMs: 1_000,
    worldCupOnly: true,
  },
};

describe("DFlow canary budget", () => {
  it("converts conservative SOL lamport exposure upward into microdollars", () => {
    expect(calculateDflowRiskMicros({
      amountMicros: 5_000_000,
      priorityFeeLamports: "200",
      initCostLamports: "2",
      baseFeeLamports: "5000",
      solUsdUpperBoundMicros: "1000000000",
    })).toEqual({
      networkCostMicros: 5_202,
      riskMicros: 5_005_202,
      totalLamports: "5202",
    });
  });

  it("requires current canary authority and atomically counts all prior starts", () => {
    const events = [
      control,
      {
        id: "dflow:one:submit-started",
        kind: "DFLOW_SUBMIT_STARTED",
        occurredAtMs: 2_000,
        payload: {
          schemaVersion: "txbet-dflow-submit-started-v1",
          riskMicros: 6_000_000,
        },
      },
    ];
    expect(() => assertDflowCanaryClaimBudget({
      journal: journal(events),
      expectedControlVersion: 1,
      riskMicros: 4_000_001,
      configuredMaxTotalMicros: 10_000_000,
      nowMs: 3_000,
    })).toThrow(/budget/i);
    expect(assertDflowCanaryClaimBudget({
      journal: journal(events),
      expectedControlVersion: 1,
      riskMicros: 4_000_000,
      configuredMaxTotalMicros: 10_000_000,
      nowMs: 3_000,
    })).toEqual({ reservedBeforeMicros: 6_000_000, reservedAfterMicros: 10_000_000 });
  });

  it("fails closed on expiry, version drift, shadow mode, and malformed reservations", () => {
    expect(() => assertDflowCanaryClaimBudget({
      journal: journal([control]),
      expectedControlVersion: 2,
      riskMicros: 1,
      configuredMaxTotalMicros: 10_000_000,
      nowMs: 3_000,
    })).toThrow(/version/i);
    expect(() => assertDflowCanaryClaimBudget({
      journal: journal([control]),
      expectedControlVersion: 1,
      riskMicros: 1,
      configuredMaxTotalMicros: 10_000_000,
      nowMs: 10_000,
    })).toThrow(/canary|authority/i);
    expect(() => assertDflowCanaryClaimBudget({
      journal: journal([{
        ...control,
        payload: { ...control.payload, mode: "shadow" },
      }]),
      expectedControlVersion: 1,
      riskMicros: 1,
      configuredMaxTotalMicros: 10_000_000,
      nowMs: 3_000,
    })).toThrow(/canary|authority/i);
    expect(() => assertDflowCanaryClaimBudget({
      journal: journal([
        control,
        {
          id: "dflow:bad:submit-started",
          kind: "DFLOW_SUBMIT_STARTED",
          occurredAtMs: 2_000,
          payload: { riskMicros: "not-an-integer" },
        },
      ]),
      expectedControlVersion: 1,
      riskMicros: 1,
      configuredMaxTotalMicros: 10_000_000,
      nowMs: 3_000,
    })).toThrow();
  });
});
