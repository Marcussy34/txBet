import type { JsonValue } from "@/core/canonical-json";
import {
  appendBlobJournalEvent,
  readBlobJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";
import {
  vercelExecutionControlViewFromJournal,
} from "@/server/execution/vercel-control";

const MAX_PROFILES_PER_CYCLE = 100;

type PolymarketShadowStatus = "unconfigured" | "unavailable" | "scanned";

export interface VercelExecutionCycleResult {
  readonly schemaVersion: "txbet-vercel-cycle-v1";
  readonly observedAtMs: number;
  readonly profilesDiscovered: number;
  readonly profilesProcessed: number;
  readonly profilesDeferred: number;
  readonly failedProfiles: number;
  readonly disabledProfiles: number;
  readonly activeProfiles: number;
  readonly shadowProfiles: number;
  readonly canaryRequestedProfiles: number;
  readonly polymarketShadowStatus: PolymarketShadowStatus | "not-run";
  readonly liveSubmissions: 0;
  readonly dflowMutations: 0;
  readonly pairedExecution: false;
}

interface ActiveProfile {
  readonly profileId: string;
  readonly controlVersion: number;
  readonly requestedMode: "shadow" | "canary";
  readonly maxTotalMicros: number;
  readonly expiresAtMs: number | null;
  readonly journalEventIds: readonly string[];
}

export interface RunVercelExecutionCycleInput {
  readonly store: BlobJournalObjectStore;
  readonly profileIds: readonly string[];
  readonly nowMs: number;
  readonly readShadowStatus: () => Promise<Readonly<{
    status: PolymarketShadowStatus;
  }>>;
}

function assertCycleInput(input: RunVercelExecutionCycleInput): readonly string[] {
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    throw new Error("Vercel execution cycle time is invalid");
  }
  return Object.freeze([...new Set(input.profileIds)].sort());
}

function cycleBatch(
  profileIds: readonly string[],
  nowMs: number,
): readonly string[] {
  if (profileIds.length <= MAX_PROFILES_PER_CYCLE) return profileIds;
  // Deterministic minute buckets give every bounded page a turn without
  // requiring a separate cursor database for the hackathon deployment.
  const batchCount = Math.ceil(profileIds.length / MAX_PROFILES_PER_CYCLE);
  const batchIndex = Math.floor(nowMs / 60_000) % batchCount;
  const start = batchIndex * MAX_PROFILES_PER_CYCLE;
  return Object.freeze(profileIds.slice(start, start + MAX_PROFILES_PER_CYCLE));
}

function cyclePayload(
  profile: ActiveProfile,
  shadowStatus: PolymarketShadowStatus,
): JsonValue {
  return Object.freeze({
    schemaVersion: "txbet-agent-cycle-observation-v1",
    requestedMode: profile.requestedMode,
    effectiveMode: "shadow",
    maxTotalMicros: profile.maxTotalMicros,
    expiresAtMs: profile.expiresAtMs,
    worldCupOnly: true,
    polymarketShadowStatus: shadowStatus,
    dflowMode: "shadow",
    dflowExecutable: false,
    pairedExecution: false,
    liveSubmissions: 0,
  });
}

/**
 * Wakes user profiles inside one Vercel function. This cycle intentionally has
 * no dispatch callback while an exact second live leg is unavailable.
 */
export async function runVercelExecutionCycle(
  input: RunVercelExecutionCycleInput,
): Promise<VercelExecutionCycleResult> {
  const profileIds = assertCycleInput(input);
  const selectedProfileIds = cycleBatch(profileIds, input.nowMs);
  const active: ActiveProfile[] = [];
  let disabledProfiles = 0;
  let failedProfiles = 0;
  let shadowProfiles = 0;
  let canaryRequestedProfiles = 0;

  for (const profileId of selectedProfileIds) {
    let control;
    try {
      const journal = await readBlobJournal(input.store, profileId);
      control = vercelExecutionControlViewFromJournal(journal, input.nowMs);
      if (control.requestedMode !== "disabled") {
        active.push(Object.freeze({
          profileId,
          controlVersion: control.version,
          requestedMode: control.requestedMode,
          maxTotalMicros: control.maxTotalMicros,
          expiresAtMs: control.expiresAtMs,
          journalEventIds: Object.freeze(journal.events.map((event) => event.id)),
        }));
      }
    } catch {
      // A corrupt or unavailable profile fails closed without starving peers.
      failedProfiles += 1;
      continue;
    }
    if (control.requestedMode === "disabled") {
      disabledProfiles += 1;
      continue;
    }
    if (control.requestedMode === "shadow") shadowProfiles += 1;
    if (control.requestedMode === "canary") canaryRequestedProfiles += 1;
  }

  const shadowStatus = active.length === 0
    ? "not-run" as const
    : (await input.readShadowStatus()).status;

  if (shadowStatus !== "not-run") {
    for (const profile of active) {
      const eventId =
        `cycle:control:${profile.controlVersion}:shadow:${shadowStatus}`;
      // The control/status state was already durably observed. Avoid another
      // full-journal parse/hash/write on every scheduled wakeup.
      if (profile.journalEventIds.includes(eventId)) continue;
      try {
        await appendBlobJournalEvent({
          store: input.store,
          profileId: profile.profileId,
          event: {
            id: eventId,
            kind: "AGENT_CYCLE_OBSERVED",
            occurredAtMs: input.nowMs,
            payload: cyclePayload(profile, shadowStatus),
          },
        });
      } catch {
        failedProfiles += 1;
      }
    }
  }

  return Object.freeze({
    schemaVersion: "txbet-vercel-cycle-v1",
    observedAtMs: input.nowMs,
    profilesDiscovered: profileIds.length,
    profilesProcessed: selectedProfileIds.length,
    profilesDeferred: profileIds.length - selectedProfileIds.length,
    failedProfiles,
    disabledProfiles,
    activeProfiles: active.length,
    shadowProfiles,
    canaryRequestedProfiles,
    polymarketShadowStatus: shadowStatus,
    liveSubmissions: 0,
    dflowMutations: 0,
    pairedExecution: false,
  });
}
