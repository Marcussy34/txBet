import { z } from "zod";

import type { JsonValue } from "@/core/canonical-json";
import {
  appendBlobJournalEvent,
  readBlobJournal,
  type BlobExecutionJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";

const PLATFORM_CANARY_CEILING_MICROS = 10_000_000;
const MAX_GRANT_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const DFLOW_BLOCKER =
  "DFLOW_EXACT_OUTPUT_AND_PRODUCTION_ELIGIBILITY_UNPROVEN" as const;

export const executionControlInputSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative().safe(),
  mode: z.enum(["disabled", "shadow", "canary"]),
  maxTotalMicros: z.number().int().nonnegative().safe(),
  expiresAtMs: z.number().int().nonnegative().safe().nullable(),
  confirmRealMoney: z.boolean(),
});

const storedControlSchema = z.strictObject({
  schemaVersion: z.literal("txbet-execution-control-v1"),
  version: z.number().int().positive().safe(),
  mode: z.enum(["disabled", "shadow", "canary"]),
  maxTotalMicros: z.number().int().nonnegative().safe(),
  expiresAtMs: z.number().int().nonnegative().safe().nullable(),
  updatedAtMs: z.number().int().nonnegative().safe(),
  worldCupOnly: z.literal(true),
});

type StoredExecutionControl = Readonly<z.infer<typeof storedControlSchema>>;
export type ExecutionControlInput = Readonly<
  z.input<typeof executionControlInputSchema>
>;

export interface VercelExecutionControlView {
  readonly schemaVersion: "txbet-vercel-control-view-v1";
  readonly version: number;
  readonly requestedMode: "disabled" | "shadow" | "canary";
  readonly effectiveAgentMode: "disabled" | "shadow";
  readonly maxTotalMicros: number;
  readonly expiresAtMs: number | null;
  readonly worldCupOnly: true;
  readonly polymarket: Readonly<{
    mode: "disabled" | "shadow" | "canary";
    exactInventorySellCanaryCandidate: true;
  }>;
  readonly kalshiDflow: Readonly<{
    mode: "shadow";
    executable: false;
    blocker: typeof DFLOW_BLOCKER;
  }>;
  readonly pairedExecution: Readonly<{
    executable: false;
    blockers: readonly [
      typeof DFLOW_BLOCKER,
      "SECOND_EXACT_COMPLEMENTARY_LIVE_LEG_UNAVAILABLE",
    ];
  }>;
}

export class ExecutionControlConflictError extends Error {
  constructor() {
    super("Execution control changed; reload before updating");
    this.name = "ExecutionControlConflictError";
  }
}

function storedControls(
  journal: BlobExecutionJournal,
): readonly StoredExecutionControl[] {
  return Object.freeze(
    journal.events
      .filter((event) => event.kind === "CONTROL_UPDATED")
      .map((event) => storedControlSchema.parse(event.payload)),
  );
}

function latestStoredControl(
  journal: BlobExecutionJournal,
): StoredExecutionControl | null {
  const controls = storedControls(journal);
  let expectedVersion = 1;
  for (const control of controls) {
    if (control.version !== expectedVersion) {
      throw new Error("Execution control history has a version gap");
    }
    expectedVersion += 1;
  }
  return controls.at(-1) ?? null;
}

function viewFromStored(
  stored: StoredExecutionControl | null,
  nowMs: number,
): VercelExecutionControlView {
  const expired = stored?.expiresAtMs !== null &&
    stored?.expiresAtMs !== undefined &&
    stored.expiresAtMs <= nowMs;
  const requestedMode = stored === null || expired ? "disabled" : stored.mode;
  const maxTotalMicros = stored === null || expired ? 0 : stored.maxTotalMicros;
  const expiresAtMs = stored === null || expired ? null : stored.expiresAtMs;

  return Object.freeze({
    schemaVersion: "txbet-vercel-control-view-v1",
    version: stored?.version ?? 0,
    requestedMode,
    effectiveAgentMode: requestedMode === "disabled" ? "disabled" : "shadow",
    maxTotalMicros,
    expiresAtMs,
    worldCupOnly: true,
    polymarket: Object.freeze({
      mode: requestedMode,
      exactInventorySellCanaryCandidate: true,
    }),
    kalshiDflow: Object.freeze({
      mode: "shadow",
      executable: false,
      blocker: DFLOW_BLOCKER,
    }),
    pairedExecution: Object.freeze({
      executable: false,
      blockers: Object.freeze([
        DFLOW_BLOCKER,
        "SECOND_EXACT_COMPLEMENTARY_LIVE_LEG_UNAVAILABLE",
      ] as const),
    }),
  });
}

function assertUpdate(
  input: ExecutionControlInput,
  nowMs: number,
): void {
  if (input.mode === "disabled") {
    if (
      input.maxTotalMicros !== 0 ||
      input.expiresAtMs !== null ||
      input.confirmRealMoney
    ) {
      throw new Error("Disabled execution control must remove spend authority");
    }
    return;
  }
  if (
    input.maxTotalMicros <= 0 ||
    input.maxTotalMicros > PLATFORM_CANARY_CEILING_MICROS
  ) {
    throw new Error("Execution control exceeds the $10 canary ceiling");
  }
  if (
    input.expiresAtMs === null ||
    input.expiresAtMs <= nowMs ||
    input.expiresAtMs - nowMs > MAX_GRANT_DURATION_MS
  ) {
    throw new Error("Execution control expiry must be within seven days");
  }
  if (input.mode === "canary" && input.confirmRealMoney !== true) {
    throw new Error("Real-money canary mode requires explicit confirmation");
  }
}

function sameRequestedControl(
  stored: StoredExecutionControl,
  input: ExecutionControlInput,
): boolean {
  return (
    stored.mode === input.mode &&
    stored.maxTotalMicros === input.maxTotalMicros &&
    stored.expiresAtMs === input.expiresAtMs
  );
}

export async function readVercelExecutionControl(
  store: BlobJournalObjectStore,
  profileId: string,
  nowMs: number,
): Promise<VercelExecutionControlView> {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Execution control read time is invalid");
  }
  const journal = await readBlobJournal(store, profileId);
  return viewFromStored(latestStoredControl(journal), nowMs);
}

/** Persists a user-owned, versioned control update; DFlow remains structurally shadow-only. */
export async function updateVercelExecutionControl(input: {
  readonly store: BlobJournalObjectStore;
  readonly profileId: string;
  readonly nowMs: number;
  readonly input: unknown;
}): Promise<VercelExecutionControlView> {
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    throw new Error("Execution control update time is invalid");
  }
  const update = executionControlInputSchema.parse(input.input);
  assertUpdate(update, input.nowMs);

  const journal = await readBlobJournal(input.store, input.profileId);
  const current = latestStoredControl(journal);
  const currentVersion = current?.version ?? 0;
  if (currentVersion !== update.expectedVersion) {
    // An HTTP retry of the exact same versioned command is safe and idempotent.
    if (
      currentVersion === update.expectedVersion + 1 &&
      current !== null &&
      sameRequestedControl(current, update)
    ) {
      return viewFromStored(current, input.nowMs);
    }
    throw new ExecutionControlConflictError();
  }

  const next: StoredExecutionControl = Object.freeze({
    schemaVersion: "txbet-execution-control-v1",
    version: currentVersion + 1,
    mode: update.mode,
    maxTotalMicros: update.maxTotalMicros,
    expiresAtMs: update.expiresAtMs,
    updatedAtMs: input.nowMs,
    worldCupOnly: true,
  });

  let appended: BlobExecutionJournal;
  try {
    appended = await appendBlobJournalEvent({
      store: input.store,
      profileId: input.profileId,
      event: {
        id: `control:${next.version}`,
        kind: "CONTROL_UPDATED",
        occurredAtMs: input.nowMs,
        payload: next as unknown as JsonValue,
      },
    });
  } catch (error) {
    if (/event ID/i.test(String(error))) {
      throw new ExecutionControlConflictError();
    }
    throw error;
  }
  return viewFromStored(latestStoredControl(appended), input.nowMs);
}
