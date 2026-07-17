import type { AttemptState } from "./state-machine";

export interface DurableAttemptRecoverySnapshot {
  readonly state: AttemptState;
  readonly preparedArtifactPersisted: boolean;
  readonly signedArtifactPersisted: boolean;
  readonly simulationPassed: boolean;
  readonly broadcastReadyPersisted: boolean;
  readonly submitStartedAt: number | null;
  readonly mutationStartedAt: number | null;
}

export type AttemptRecoveryDirective =
  | "RESUME_PREPARE"
  | "RESUME_SIGN"
  | "RESUME_SIMULATE"
  | "RERUN_BROADCAST_GATE"
  | "RESUME_SUBMIT_PROTOCOL"
  | "RECONCILE_ONLY"
  | "RECONCILE_MUTATION_ONLY"
  | "TERMINAL";

const terminalStates = new Set<AttemptState>([
  "UNFILLED",
  "FILLED",
  "REJECTED",
]);
const postSubmitStates = new Set<AttemptState>([
  "SUBMITTING",
  "ACKED",
  "UNKNOWN",
  "PARTIAL",
]);

/** Chooses restart work only from durable evidence; a submit marker is never replayed. */
export function classifyAttemptRecovery(
  snapshot: DurableAttemptRecoverySnapshot,
): AttemptRecoveryDirective {
  if (terminalStates.has(snapshot.state)) return "TERMINAL";

  if (snapshot.submitStartedAt !== null) return "RECONCILE_ONLY";
  if (postSubmitStates.has(snapshot.state)) {
    throw new Error("Post-submit state is missing its durable submit-start marker");
  }
  if (snapshot.mutationStartedAt !== null) return "RECONCILE_MUTATION_ONLY";

  if (snapshot.signedArtifactPersisted && !snapshot.preparedArtifactPersisted) {
    throw new Error("Signed artifact exists without its prepared artifact");
  }
  if (snapshot.simulationPassed && !snapshot.signedArtifactPersisted) {
    throw new Error("Simulation proof exists without a signed artifact");
  }
  if (snapshot.broadcastReadyPersisted && !snapshot.simulationPassed) {
    throw new Error("Broadcast readiness exists without successful simulation");
  }

  // Durable artifacts win over a lagging projection state after a crash.
  if (snapshot.broadcastReadyPersisted) return "RESUME_SUBMIT_PROTOCOL";
  if (snapshot.simulationPassed) return "RERUN_BROADCAST_GATE";
  if (snapshot.signedArtifactPersisted) return "RESUME_SIMULATE";
  if (snapshot.preparedArtifactPersisted) return "RESUME_SIGN";
  return "RESUME_PREPARE";
}

export function canExpireReleaseReservation(input: {
  readonly submitStartedAt: number | null;
  readonly mutationStartedAt: number | null;
}): boolean {
  return input.submitStartedAt === null && input.mutationStartedAt === null;
}
