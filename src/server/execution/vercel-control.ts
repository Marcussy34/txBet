import { z } from "zod";

import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import {
  appendBlobJournalEvent,
  BlobJournalConflictError,
  readBlobJournal,
  type BlobExecutionJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";

const PLATFORM_CANARY_CEILING_MICROS = 10_000_000;
const MAX_GRANT_DURATION_MS = 7 * 24 * 60 * 60 * 1_000;
const MIN_NON_DISABLE_UPDATE_INTERVAL_MS = 5_000;
export const VERCEL_CONTROL_UPDATE_LIMIT = 256;
const DFLOW_BLOCKER =
  "DFLOW_EXACT_OUTPUT_AND_PRODUCTION_ELIGIBILITY_UNPROVEN" as const;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{1,128}$/;
const REQUEST_HASH = /^sha256:[a-f0-9]{64}$/;

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
  // Optional fields preserve read compatibility with pre-idempotency journals.
  idempotencyKey: z.string().regex(IDEMPOTENCY_KEY).optional(),
  requestHash: z.string().regex(REQUEST_HASH).optional(),
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
    manualExactInputCanary: Readonly<{
      candidate: true;
      authorized: boolean;
    }>;
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

export class ExecutionControlRateLimitError extends Error {
  constructor() {
    super("Wait before changing execution authority again");
    this.name = "ExecutionControlRateLimitError";
  }
}

export class ExecutionControlHistoryLimitError extends Error {
  constructor() {
    super("Execution control history reached its bounded MVP limit");
    this.name = "ExecutionControlHistoryLimitError";
  }
}

function storedControls(
  journal: BlobExecutionJournal,
): readonly StoredExecutionControl[] {
  const controls =
    journal.events
      .filter((event) => event.kind === "CONTROL_UPDATED")
      .map((event) => storedControlSchema.parse(event.payload));
  const idempotencyKeys = new Set<string>();
  let expectedVersion = 1;
  for (const control of controls) {
    if (control.version !== expectedVersion) {
      throw new Error("Execution control history has a version gap");
    }
    if ((control.idempotencyKey === undefined) !== (control.requestHash === undefined)) {
      throw new Error("Execution control idempotency evidence is incomplete");
    }
    if (
      control.idempotencyKey !== undefined &&
      idempotencyKeys.has(control.idempotencyKey)
    ) {
      throw new Error("Execution control idempotency key is duplicated");
    }
    if (control.idempotencyKey !== undefined) {
      idempotencyKeys.add(control.idempotencyKey);
    }
    expectedVersion += 1;
  }
  return Object.freeze(controls);
}

function latestStoredControl(
  journal: BlobExecutionJournal,
): StoredExecutionControl | null {
  const controls = storedControls(journal);
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
      manualExactInputCanary: Object.freeze({
        candidate: true,
        authorized: requestedMode === "canary",
      }),
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

function controlRequestHash(input: ExecutionControlInput): string {
  return `sha256:${sha256Canonical({
    expectedVersion: input.expectedVersion,
    mode: input.mode,
    maxTotalMicros: input.maxTotalMicros,
    expiresAtMs: input.expiresAtMs,
    confirmRealMoney: input.confirmRealMoney,
  })}`;
}

function normalizedIdempotencyKey(
  supplied: string | null | undefined,
  expectedVersion: number,
): string {
  const value = supplied ?? `internal:control:${expectedVersion + 1}`;
  if (!IDEMPOTENCY_KEY.test(value)) {
    throw new Error("Execution control idempotency key is invalid");
  }
  return value;
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
  return vercelExecutionControlViewFromJournal(journal, nowMs);
}

/** Reuses an already verified journal so Cron does not read it twice per tick. */
export function vercelExecutionControlViewFromJournal(
  journal: BlobExecutionJournal,
  nowMs: number,
): VercelExecutionControlView {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Execution control read time is invalid");
  }
  return viewFromStored(latestStoredControl(journal), nowMs);
}

/** Persists user authority; the paired DFlow agent remains structurally shadow-only. */
export async function updateVercelExecutionControl(input: {
  readonly store: BlobJournalObjectStore;
  readonly profileId: string;
  readonly nowMs: number;
  readonly input: unknown;
  readonly idempotencyKey?: string | null;
}): Promise<VercelExecutionControlView> {
  if (!Number.isSafeInteger(input.nowMs) || input.nowMs < 0) {
    throw new Error("Execution control update time is invalid");
  }
  const update = executionControlInputSchema.parse(input.input);
  assertUpdate(update, input.nowMs);
  const idempotencyKey = normalizedIdempotencyKey(
    input.idempotencyKey,
    update.expectedVersion,
  );
  const requestHash = controlRequestHash(update);

  const journal = await readBlobJournal(input.store, input.profileId);
  const controls = storedControls(journal);
  const current = controls.at(-1) ?? null;
  const currentVersion = current?.version ?? 0;
  const replay = controls.find(
    (control) => control.idempotencyKey === idempotencyKey,
  );
  if (replay !== undefined) {
    if (
      replay.requestHash !== requestHash ||
      replay.version !== currentVersion
    ) {
      throw new ExecutionControlConflictError();
    }
    return viewFromStored(replay, input.nowMs);
  }
  if (currentVersion !== update.expectedVersion) {
    // Legacy records have no durable key/hash evidence, so even a matching
    // body cannot be replayed safely under a newly supplied key.
    throw new ExecutionControlConflictError();
  }

  // A default/already-disabled profile has no authority to revoke. Return the
  // current view without consuming durable history; active -> disabled still
  // appends immediately and remains exempt from throttling.
  if (
    update.mode === "disabled" &&
    (current === null || current.mode === "disabled")
  ) {
    return viewFromStored(current, input.nowMs);
  }

  const finalDisable =
    currentVersion === VERCEL_CONTROL_UPDATE_LIMIT - 1 &&
    current?.mode !== "disabled" &&
    update.mode === "disabled";
  if (currentVersion >= VERCEL_CONTROL_UPDATE_LIMIT ||
    (currentVersion === VERCEL_CONTROL_UPDATE_LIMIT - 1 && !finalDisable)) {
    throw new ExecutionControlHistoryLimitError();
  }
  if (
    update.mode !== "disabled" &&
    current !== null &&
    input.nowMs - current.updatedAtMs < MIN_NON_DISABLE_UPDATE_INTERVAL_MS
  ) {
    throw new ExecutionControlRateLimitError();
  }

  const next: StoredExecutionControl = Object.freeze({
    schemaVersion: "txbet-execution-control-v1",
    version: currentVersion + 1,
    mode: update.mode,
    maxTotalMicros: update.maxTotalMicros,
    expiresAtMs: update.expiresAtMs,
    updatedAtMs: input.nowMs,
    worldCupOnly: true,
    idempotencyKey,
    requestHash,
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
    // A racing retry can use a different server timestamp. Recover through
    // the durable key/hash record instead of comparing timestamped payloads.
    const recovered = await readBlobJournal(input.store, input.profileId);
    const recoveredControls = storedControls(recovered);
    const recoveredControl = recoveredControls.find(
      (control) => control.idempotencyKey === idempotencyKey,
    );
    const recoveredLatest = recoveredControls.at(-1);
    if (
      recoveredControl?.requestHash === requestHash &&
      recoveredControl.version === next.version &&
      recoveredLatest?.version === recoveredControl.version
    ) {
      return viewFromStored(recoveredControl, input.nowMs);
    }
    if (
      error instanceof BlobJournalConflictError ||
      /event ID/i.test(String(error))
    ) {
      throw new ExecutionControlConflictError();
    }
    throw error;
  }
  return viewFromStored(latestStoredControl(appended), input.nowMs);
}
