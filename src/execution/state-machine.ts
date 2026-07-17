export const BUNDLE_STATES = [
  "DETECTED",
  "RESERVED",
  "PREPARING",
  "PREPARED",
  "SUBMITTING",
  "RECONCILING",
  "MATCHED",
  "NO_TRADE",
  "COMPENSATING",
  "COMPENSATED",
  "BOUNDED_RESIDUAL",
  "UNHEDGED",
  "INVALID",
] as const;
export type BundleState = (typeof BUNDLE_STATES)[number];

export const ATTEMPT_STATES = [
  "PREPARING",
  "PREPARED",
  "SIGNING",
  "SIGNED",
  "SIMULATED",
  "BROADCAST_READY",
  "SUBMITTING",
  "ACKED",
  "UNKNOWN",
  "UNFILLED",
  "PARTIAL",
  "FILLED",
  "REJECTED",
] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

const bundleTransitions: Readonly<Record<BundleState, ReadonlySet<BundleState>>> = {
  DETECTED: new Set(["RESERVED", "NO_TRADE", "INVALID"]),
  RESERVED: new Set(["PREPARING", "NO_TRADE", "INVALID"]),
  PREPARING: new Set(["PREPARED", "NO_TRADE", "INVALID"]),
  PREPARED: new Set(["SUBMITTING", "NO_TRADE", "INVALID"]),
  SUBMITTING: new Set(["RECONCILING", "UNHEDGED", "INVALID"]),
  RECONCILING: new Set([
    "MATCHED",
    "NO_TRADE",
    "COMPENSATING",
    "BOUNDED_RESIDUAL",
    "UNHEDGED",
    "INVALID",
  ]),
  COMPENSATING: new Set(["COMPENSATED", "BOUNDED_RESIDUAL", "UNHEDGED", "INVALID"]),
  MATCHED: new Set(),
  NO_TRADE: new Set(),
  COMPENSATED: new Set(),
  BOUNDED_RESIDUAL: new Set(),
  UNHEDGED: new Set(),
  INVALID: new Set(),
};

const attemptTransitions: Readonly<Record<AttemptState, ReadonlySet<AttemptState>>> = {
  PREPARING: new Set(["PREPARED", "REJECTED"]),
  PREPARED: new Set(["SIGNING", "REJECTED"]),
  SIGNING: new Set(["SIGNED", "REJECTED"]),
  SIGNED: new Set(["SIMULATED", "REJECTED"]),
  SIMULATED: new Set(["BROADCAST_READY", "REJECTED"]),
  BROADCAST_READY: new Set(["SUBMITTING", "REJECTED"]),
  SUBMITTING: new Set(["ACKED", "UNKNOWN", "REJECTED"]),
  ACKED: new Set(["UNKNOWN", "UNFILLED", "PARTIAL", "FILLED"]),
  UNKNOWN: new Set(["ACKED", "UNFILLED", "PARTIAL", "FILLED", "REJECTED"]),
  PARTIAL: new Set(["PARTIAL", "UNKNOWN", "FILLED"]),
  UNFILLED: new Set(),
  FILLED: new Set(),
  REJECTED: new Set(),
};

export interface VersionedState<State extends string> {
  readonly state: State;
  readonly version: number;
}

export function canTransitionBundle(from: BundleState, to: BundleState): boolean {
  return bundleTransitions[from].has(to);
}

export function canTransitionAttempt(from: AttemptState, to: AttemptState): boolean {
  return attemptTransitions[from].has(to);
}

function transition<State extends string>(
  current: VersionedState<State>,
  expectedVersion: number,
  next: State,
  allowed: boolean,
): VersionedState<State> {
  if (current.version !== expectedVersion) {
    throw new Error(`State version mismatch: expected ${expectedVersion}, found ${current.version}`);
  }
  if (!allowed) throw new Error(`Illegal state transition: ${current.state} -> ${next}`);
  return Object.freeze({ state: next, version: current.version + 1 });
}

export function transitionBundle(
  current: VersionedState<BundleState>,
  expectedVersion: number,
  next: BundleState,
): VersionedState<BundleState> {
  return transition(current, expectedVersion, next, canTransitionBundle(current.state, next));
}

export function transitionAttempt(
  current: VersionedState<AttemptState>,
  expectedVersion: number,
  next: AttemptState,
): VersionedState<AttemptState> {
  return transition(current, expectedVersion, next, canTransitionAttempt(current.state, next));
}
