import { describe, expect, it } from "vitest";

import {
  canExpireReleaseReservation,
  classifyAttemptRecovery,
} from "@/execution/recovery";

function snapshot() {
  return {
    state: "PREPARING" as const,
    preparedArtifactPersisted: false,
    signedArtifactPersisted: false,
    simulationPassed: false,
    broadcastReadyPersisted: false,
    submitStartedAt: null,
    mutationStartedAt: null,
  };
}

describe("crash recovery directives", () => {
  it("resumes only pre-submit work proven by durable artifacts", () => {
    expect(classifyAttemptRecovery(snapshot())).toBe("RESUME_PREPARE");
    expect(
      classifyAttemptRecovery({
        ...snapshot(),
        state: "PREPARED",
        preparedArtifactPersisted: true,
      }),
    ).toBe("RESUME_SIGN");
    expect(
      classifyAttemptRecovery({
        ...snapshot(),
        state: "SIGNED",
        preparedArtifactPersisted: true,
        signedArtifactPersisted: true,
      }),
    ).toBe("RESUME_SIMULATE");
    expect(
      classifyAttemptRecovery({
        ...snapshot(),
        state: "SIMULATED",
        preparedArtifactPersisted: true,
        signedArtifactPersisted: true,
        simulationPassed: true,
      }),
    ).toBe("RERUN_BROADCAST_GATE");
    expect(
      classifyAttemptRecovery({
        ...snapshot(),
        state: "BROADCAST_READY",
        preparedArtifactPersisted: true,
        signedArtifactPersisted: true,
        simulationPassed: true,
        broadcastReadyPersisted: true,
      }),
    ).toBe("RESUME_SUBMIT_PROTOCOL");
  });

  it("never submits after a durable submit-start marker", () => {
    for (const state of ["SUBMITTING", "ACKED", "UNKNOWN", "PARTIAL"] as const) {
      expect(
        classifyAttemptRecovery({
          ...snapshot(),
          state,
          preparedArtifactPersisted: true,
          signedArtifactPersisted: true,
          simulationPassed: true,
          broadcastReadyPersisted: true,
          submitStartedAt: 1_000,
        }),
      ).toBe("RECONCILE_ONLY");
    }
  });

  it("treats a post-submit state without its marker as an invariant failure", () => {
    for (const state of ["SUBMITTING", "ACKED", "UNKNOWN", "PARTIAL"] as const) {
      expect(() =>
        classifyAttemptRecovery({
          ...snapshot(),
          state,
          preparedArtifactPersisted: true,
          signedArtifactPersisted: true,
          simulationPassed: true,
          broadcastReadyPersisted: true,
        }),
      ).toThrow(/submit-start marker/i);
    }
  });

  it("does no new work for terminal attempts", () => {
    for (const state of ["UNFILLED", "FILLED", "REJECTED"] as const) {
      expect(classifyAttemptRecovery({ ...snapshot(), state })).toBe("TERMINAL");
    }
  });

  it("releases expiry only when no submit or mutation can be ambiguous", () => {
    expect(
      canExpireReleaseReservation({
        submitStartedAt: null,
        mutationStartedAt: null,
      }),
    ).toBe(true);
    expect(
      canExpireReleaseReservation({
        submitStartedAt: 1,
        mutationStartedAt: null,
      }),
    ).toBe(false);
    expect(
      canExpireReleaseReservation({
        submitStartedAt: null,
        mutationStartedAt: 1,
      }),
    ).toBe(false);
  });

  it("rejects impossible artifact progress instead of guessing", () => {
    expect(() =>
      classifyAttemptRecovery({
        ...snapshot(),
        state: "SIGNED",
        signedArtifactPersisted: true,
      }),
    ).toThrow(/prepared artifact/i);
    expect(() =>
      classifyAttemptRecovery({
        ...snapshot(),
        state: "BROADCAST_READY",
        preparedArtifactPersisted: true,
        signedArtifactPersisted: true,
        simulationPassed: false,
        broadcastReadyPersisted: true,
      }),
    ).toThrow(/simulation/i);
  });
});
