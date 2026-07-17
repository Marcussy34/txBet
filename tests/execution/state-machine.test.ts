import { describe, expect, it } from "vitest";

import {
  ATTEMPT_STATES,
  BUNDLE_STATES,
  canTransitionAttempt,
  canTransitionBundle,
  transitionAttempt,
  transitionBundle,
  type AttemptState,
  type BundleState,
} from "@/execution/state-machine";

const bundleTransitions: Readonly<Record<BundleState, readonly BundleState[]>> = {
  DETECTED: ["RESERVED", "NO_TRADE", "INVALID"],
  RESERVED: ["PREPARING", "NO_TRADE", "INVALID"],
  PREPARING: ["PREPARED", "NO_TRADE", "INVALID"],
  PREPARED: ["SUBMITTING", "NO_TRADE", "INVALID"],
  SUBMITTING: ["RECONCILING", "UNHEDGED", "INVALID"],
  RECONCILING: [
    "MATCHED",
    "NO_TRADE",
    "COMPENSATING",
    "BOUNDED_RESIDUAL",
    "UNHEDGED",
    "INVALID",
  ],
  COMPENSATING: ["COMPENSATED", "BOUNDED_RESIDUAL", "UNHEDGED", "INVALID"],
  MATCHED: [],
  NO_TRADE: [],
  COMPENSATED: [],
  BOUNDED_RESIDUAL: [],
  UNHEDGED: [],
  INVALID: [],
};

const attemptTransitions: Readonly<Record<AttemptState, readonly AttemptState[]>> = {
  PREPARING: ["PREPARED", "REJECTED"],
  PREPARED: ["SIGNING", "REJECTED"],
  SIGNING: ["SIGNED", "REJECTED"],
  SIGNED: ["SIMULATED", "REJECTED"],
  SIMULATED: ["BROADCAST_READY", "REJECTED"],
  BROADCAST_READY: ["SUBMITTING", "REJECTED"],
  SUBMITTING: ["ACKED", "UNKNOWN", "REJECTED"],
  ACKED: ["UNKNOWN", "UNFILLED", "PARTIAL", "FILLED"],
  UNKNOWN: ["ACKED", "UNFILLED", "PARTIAL", "FILLED", "REJECTED"],
  PARTIAL: ["PARTIAL", "UNKNOWN", "FILLED"],
  UNFILLED: [],
  FILLED: [],
  REJECTED: [],
};

describe("execution state machines", () => {
  it("defines every legal and illegal bundle transition explicitly", () => {
    for (const from of BUNDLE_STATES) {
      for (const to of BUNDLE_STATES) {
        expect(canTransitionBundle(from, to), `${from} -> ${to}`).toBe(
          bundleTransitions[from].includes(to),
        );
      }
    }
  });

  it("defines every legal and illegal attempt transition explicitly", () => {
    for (const from of ATTEMPT_STATES) {
      for (const to of ATTEMPT_STATES) {
        expect(canTransitionAttempt(from, to), `${from} -> ${to}`).toBe(
          attemptTransitions[from].includes(to),
        );
      }
    }
  });

  it("increments versions only for legal compare-and-set transitions", () => {
    expect(transitionBundle({ state: "DETECTED", version: 4 }, 4, "RESERVED")).toEqual({
      state: "RESERVED",
      version: 5,
    });
    expect(transitionAttempt({ state: "SIGNED", version: 8 }, 8, "SIMULATED")).toEqual({
      state: "SIMULATED",
      version: 9,
    });
    expect(() =>
      transitionBundle({ state: "DETECTED", version: 4 }, 3, "RESERVED"),
    ).toThrow(/version/i);
    expect(() =>
      transitionAttempt({ state: "PREPARING", version: 1 }, 1, "FILLED"),
    ).toThrow(/illegal/i);
  });

  it.each(["MATCHED", "NO_TRADE", "COMPENSATED", "BOUNDED_RESIDUAL", "UNHEDGED", "INVALID"] as const)(
    "keeps terminal/non-recoverable bundle state %s immutable",
    (state) => {
      expect(() => transitionBundle({ state, version: 1 }, 1, "DETECTED")).toThrow(
        /illegal/i,
      );
    },
  );
});
