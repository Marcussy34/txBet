import {
  canonicalJson,
  sha256Canonical,
  type JsonValue,
} from "@/core/canonical-json";

const PROFILE_ID = /^did:privy:[A-Za-z0-9._:-]{1,500}$/;
const EVENT_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const EVENT_KIND = /^[A-Z][A-Z0-9_]{0,99}$/;
const EVENT_HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_CAS_ATTEMPTS = 6;
export const BLOB_JOURNAL_EVENT_LIMIT = 2_048;

export interface BlobJournalObject {
  readonly body: string;
  readonly etag: string;
}

/** Narrow storage boundary so the journal can be tested without a remote Blob store. */
export interface BlobJournalObjectStore {
  read(pathname: string): Promise<BlobJournalObject | null>;
  create(pathname: string, body: string): Promise<Readonly<{ etag: string }>>;
  replace(
    pathname: string,
    body: string,
    expectedEtag: string,
  ): Promise<Readonly<{ etag: string }>>;
}

export class BlobJournalConflictError extends Error {
  constructor() {
    super("The execution journal changed concurrently");
    this.name = "BlobJournalConflictError";
  }
}

export interface BlobJournalEventInput {
  readonly id: string;
  readonly kind: string;
  readonly occurredAtMs: number;
  readonly payload: JsonValue;
}

export interface BlobJournalEvent extends BlobJournalEventInput {
  readonly previousHash: string | null;
  readonly eventHash: string;
}

export interface BlobExecutionJournal {
  readonly schemaVersion: "txbet-blob-journal-v1";
  readonly profileId: string;
  readonly revision: number;
  readonly events: readonly BlobJournalEvent[];
}

function pathnameFor(profileId: string): string {
  assertProfileId(profileId);
  return `txbet/execution/${encodeURIComponent(profileId)}/journal.json`;
}

function assertProfileId(profileId: string): void {
  if (!PROFILE_ID.test(profileId)) {
    throw new Error("Execution journal profile ID is invalid");
  }
}

function normalizePayload(payload: JsonValue): JsonValue {
  // Canonical serialization also rejects floats, accessors, cycles, and undefined.
  return freezeJson(JSON.parse(canonicalJson(payload)) as JsonValue);
}

function freezeJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => freezeJson(entry)));
  }
  if (value !== null && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [key, freezeJson(entry)]),
      ),
    );
  }
  return value;
}

function assertEventInput(event: BlobJournalEventInput): void {
  if (!EVENT_ID.test(event.id)) {
    throw new Error("Execution journal event ID is invalid");
  }
  if (!EVENT_KIND.test(event.kind)) {
    throw new Error("Execution journal event kind is invalid");
  }
  if (!Number.isSafeInteger(event.occurredAtMs) || event.occurredAtMs < 0) {
    throw new Error("Execution journal event time is invalid");
  }
  canonicalJson(event.payload);
}

function eventHash(
  profileId: string,
  event: BlobJournalEventInput,
  previousHash: string | null,
): string {
  return `sha256:${sha256Canonical({
    hashDomain: "txbet:blob-journal-event:v1",
    profileId,
    id: event.id,
    kind: event.kind,
    occurredAtMs: event.occurredAtMs,
    payload: event.payload,
    previousHash,
  })}`;
}

function freezeJournal(journal: BlobExecutionJournal): BlobExecutionJournal {
  return Object.freeze({
    ...journal,
    events: Object.freeze(
      journal.events.map((event) =>
        Object.freeze({ ...event, payload: normalizePayload(event.payload) }),
      ),
    ),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseEvent(value: unknown): BlobJournalEvent {
  if (!isRecord(value)) throw new Error("Execution journal event is malformed");
  const input: BlobJournalEventInput = {
    id: value.id as string,
    kind: value.kind as string,
    occurredAtMs: value.occurredAtMs as number,
    payload: value.payload as JsonValue,
  };
  assertEventInput(input);
  if (
    (value.previousHash !== null &&
      (typeof value.previousHash !== "string" || !EVENT_HASH.test(value.previousHash))) ||
    typeof value.eventHash !== "string" ||
    !EVENT_HASH.test(value.eventHash)
  ) {
    throw new Error("Execution journal event hash is malformed");
  }
  if (Object.keys(value).sort().join(",") !==
    ["eventHash", "id", "kind", "occurredAtMs", "payload", "previousHash"]
      .sort()
      .join(",")) {
    throw new Error("Execution journal event has unexpected fields");
  }
  return Object.freeze({
    ...input,
    payload: normalizePayload(input.payload),
    previousHash: value.previousHash,
    eventHash: value.eventHash,
  });
}

function parseJournal(body: string, expectedProfileId: string): BlobExecutionJournal {
  let value: unknown;
  try {
    value = JSON.parse(body) as unknown;
  } catch {
    throw new Error("Execution journal is not valid JSON");
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== "txbet-blob-journal-v1" ||
    value.profileId !== expectedProfileId ||
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    !Array.isArray(value.events) ||
    Object.keys(value).sort().join(",") !==
      ["events", "profileId", "revision", "schemaVersion"].sort().join(",")
  ) {
    throw new Error("Execution journal header is malformed");
  }

  const events = value.events.map(parseEvent);
  if (value.revision !== events.length) {
    throw new Error("Execution journal revision does not match its event count");
  }
  let previousHash: string | null = null;
  const ids = new Set<string>();
  for (const event of events) {
    if (ids.has(event.id)) {
      throw new Error("Execution journal contains a duplicate event ID");
    }
    ids.add(event.id);
    if (
      event.previousHash !== previousHash ||
      event.eventHash !== eventHash(expectedProfileId, event, previousHash)
    ) {
      throw new Error("Execution journal hash chain is invalid");
    }
    previousHash = event.eventHash;
  }

  return freezeJournal({
    schemaVersion: "txbet-blob-journal-v1",
    profileId: expectedProfileId,
    revision: value.revision as number,
    events,
  });
}

function emptyJournal(profileId: string): BlobExecutionJournal {
  return freezeJournal({
    schemaVersion: "txbet-blob-journal-v1",
    profileId,
    revision: 0,
    events: [],
  });
}

function eventInputsEqual(
  existing: BlobJournalEvent,
  incoming: BlobJournalEventInput,
): boolean {
  return canonicalJson({
    id: existing.id,
    kind: existing.kind,
    occurredAtMs: existing.occurredAtMs,
    payload: existing.payload,
  }) === canonicalJson({
    id: incoming.id,
    kind: incoming.kind,
    occurredAtMs: incoming.occurredAtMs,
    payload: incoming.payload,
  });
}

function appendEvent(
  journal: BlobExecutionJournal,
  event: BlobJournalEventInput,
): BlobExecutionJournal {
  const existing = journal.events.find((entry) => entry.id === event.id);
  if (existing !== undefined) {
    if (!eventInputsEqual(existing, event)) {
      throw new Error("Execution journal event ID was reused with different evidence");
    }
    return journal;
  }
  if (journal.events.length >= BLOB_JOURNAL_EVENT_LIMIT) {
    throw new Error("Execution journal reached its bounded event capacity");
  }
  const payload = normalizePayload(event.payload);
  const previousHash = journal.events.at(-1)?.eventHash ?? null;
  const nextEvent = Object.freeze({
    ...event,
    payload,
    previousHash,
    eventHash: eventHash(journal.profileId, { ...event, payload }, previousHash),
  });
  return freezeJournal({
    ...journal,
    revision: journal.revision + 1,
    events: [...journal.events, nextEvent],
  });
}

function serializeJournal(journal: BlobExecutionJournal): string {
  return canonicalJson(journal as unknown as JsonValue);
}

async function readWithEtag(
  store: BlobJournalObjectStore,
  profileId: string,
): Promise<Readonly<{ journal: BlobExecutionJournal; etag: string | null }>> {
  const stored = await store.read(pathnameFor(profileId));
  if (stored === null) {
    return Object.freeze({ journal: emptyJournal(profileId), etag: null });
  }
  if (stored.etag.trim().length === 0) {
    throw new Error("Execution journal storage ETag is missing");
  }
  return Object.freeze({
    journal: parseJournal(stored.body, profileId),
    etag: stored.etag,
  });
}

export async function readBlobJournal(
  store: BlobJournalObjectStore,
  profileId: string,
): Promise<BlobExecutionJournal> {
  return (await readWithEtag(store, profileId)).journal;
}

/** Appends one event using Blob ETag compare-and-swap and a bounded conflict retry. */
export async function appendBlobJournalEvent(input: {
  readonly store: BlobJournalObjectStore;
  readonly profileId: string;
  readonly event: BlobJournalEventInput;
}): Promise<BlobExecutionJournal> {
  assertProfileId(input.profileId);
  assertEventInput(input.event);
  const normalizedEvent = Object.freeze({
    ...input.event,
    payload: normalizePayload(input.event.payload),
  });
  const pathname = pathnameFor(input.profileId);

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    const current = await readWithEtag(input.store, input.profileId);
    const next = appendEvent(current.journal, normalizedEvent);
    if (next === current.journal) return current.journal;

    try {
      if (current.etag === null) {
        await input.store.create(pathname, serializeJournal(next));
      } else {
        await input.store.replace(pathname, serializeJournal(next), current.etag);
      }
      return next;
    } catch (error) {
      if (!(error instanceof BlobJournalConflictError)) throw error;
    }
  }

  throw new BlobJournalConflictError();
}
