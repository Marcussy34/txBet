import { describe, expect, it, vi } from "vitest";

import type { JsonValue } from "@/core/canonical-json";
import {
  BlobJournalConflictError,
  BLOB_JOURNAL_EVENT_LIMIT,
  appendBlobJournalEvent,
  claimBlobJournalEvent,
  readBlobJournal,
  type BlobExecutionJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";
import { blobJournalFixture } from "../fixtures/blob-journal";

const PROFILE_ID = "did:privy:user-1";

function memoryStore(): BlobJournalObjectStore & {
  readonly objects: Map<string, { body: string; etag: string }>;
} {
  const objects = new Map<string, { body: string; etag: string }>();
  let revision = 0;

  return {
    objects,
    async read(pathname) {
      const value = objects.get(pathname);
      return value === undefined ? null : { ...value };
    },
    async create(pathname, body) {
      if (objects.has(pathname)) throw new BlobJournalConflictError();
      const etag = `etag-${++revision}`;
      objects.set(pathname, { body, etag });
      return { etag };
    },
    async replace(pathname, body, expectedEtag) {
      const current = objects.get(pathname);
      if (current?.etag !== expectedEtag) throw new BlobJournalConflictError();
      const etag = `etag-${++revision}`;
      objects.set(pathname, { body, etag });
      return { etag };
    },
  };
}

function synchronizeFirstTwoReads(store: BlobJournalObjectStore): void {
  const originalRead = store.read.bind(store);
  let initialReadCount = 0;
  let releaseInitialReads = (): void => undefined;
  const bothInitialReads = new Promise<void>((resolve) => {
    releaseInitialReads = resolve;
  });
  store.read = vi.fn(async (pathname) => {
    const snapshot = await originalRead(pathname);
    initialReadCount += 1;
    if (initialReadCount <= 2) {
      if (initialReadCount === 2) releaseInitialReads();
      await bothInitialReads;
    }
    return snapshot;
  });
}

function claimedReservationMicros(journal: BlobExecutionJournal): number {
  return journal.events.reduce((total, event) => {
    if (
      event.kind !== "EXECUTION_STARTED" ||
      event.payload === null ||
      Array.isArray(event.payload) ||
      typeof event.payload !== "object"
    ) {
      return total;
    }
    const reservation = (event.payload as Readonly<Record<string, JsonValue>>)
      .reservationMicros;
    return typeof reservation === "number" ? total + reservation : total;
  }, 0);
}

describe("Vercel Blob execution journal", () => {
  it("creates an immutable hash-chained first event and reads it back", async () => {
    const store = memoryStore();

    const result = await appendBlobJournalEvent({
      store,
      profileId: PROFILE_ID,
      event: {
        id: "control-1",
        kind: "CONTROL_UPDATED",
        occurredAtMs: 1_000,
        payload: { mode: "shadow", maxTotalMicros: 1_000_000 },
      },
    });

    expect(result.revision).toBe(1);
    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      id: "control-1",
      kind: "CONTROL_UPDATED",
      previousHash: null,
    });
    expect(result.events[0]?.eventHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    await expect(readBlobJournal(store, PROFILE_ID)).resolves.toEqual(result);
  });

  it("is idempotent for an identical event id and rejects conflicting reuse", async () => {
    const store = memoryStore();
    const base = {
      store,
      profileId: PROFILE_ID,
      event: {
        id: "control-1",
        kind: "CONTROL_UPDATED",
        occurredAtMs: 1_000,
        payload: { mode: "shadow" },
      },
    } as const;

    const first = await appendBlobJournalEvent(base);
    await expect(appendBlobJournalEvent(base)).resolves.toEqual(first);
    await expect(
      appendBlobJournalEvent({
        ...base,
        event: { ...base.event, payload: { mode: "canary" } },
      }),
    ).rejects.toThrow(/event id/i);
  });

  it("returns already_started for an identical claim and rejects different evidence", async () => {
    const store = memoryStore();
    const claim = {
      store,
      profileId: PROFILE_ID,
      event: {
        id: "execution:start:1",
        kind: "EXECUTION_STARTED",
        occurredAtMs: 1_000,
        payload: { intentHash: `sha256:${"a".repeat(64)}` },
      },
    } as const;

    await expect(claimBlobJournalEvent(claim)).resolves.toMatchObject({
      status: "claimed",
      journal: { revision: 1 },
    });
    const rejectCurrentControl = vi.fn(() => {
      throw new Error("Current control no longer permits this claim");
    });
    await expect(claimBlobJournalEvent({
      ...claim,
      validate: rejectCurrentControl,
    })).resolves.toMatchObject({
      status: "already_started",
      journal: { revision: 1 },
    });
    expect(rejectCurrentControl).not.toHaveBeenCalled();
    await expect(
      claimBlobJournalEvent({
        ...claim,
        event: {
          ...claim.event,
          payload: { intentHash: `sha256:${"b".repeat(64)}` },
        },
      }),
    ).rejects.toThrow(/event id/i);
  });

  it("gives exactly one caller an atomic claim during a real race", async () => {
    const store = memoryStore();
    synchronizeFirstTwoReads(store);
    const claim = {
      store,
      profileId: PROFILE_ID,
      event: {
        id: "execution:start:race",
        kind: "EXECUTION_STARTED",
        occurredAtMs: 2_000,
        payload: { intentHash: `sha256:${"c".repeat(64)}` },
      },
    } as const;

    const results = await Promise.all([
      claimBlobJournalEvent(claim),
      claimBlobJournalEvent(claim),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([
      "already_started",
      "claimed",
    ]);
    expect(results[0]?.journal).toEqual(results[1]?.journal);
    await expect(readBlobJournal(store, PROFILE_ID)).resolves.toMatchObject({
      revision: 1,
      events: [{ id: "execution:start:race" }],
    });
  });

  it("revalidates the latest journal so two $6 claims cannot exceed a $10 budget", async () => {
    const store = memoryStore();
    synchronizeFirstTwoReads(store);
    const claim = (id: string) =>
      claimBlobJournalEvent({
        store,
        profileId: PROFILE_ID,
        event: {
          id,
          kind: "EXECUTION_STARTED",
          occurredAtMs: 3_000,
          payload: { reservationMicros: 6_000_000 },
        },
        validate(journal) {
          if (claimedReservationMicros(journal) + 6_000_000 > 10_000_000) {
            throw new Error("Execution budget would be exceeded");
          }
        },
      });

    const results = await Promise.allSettled([
      claim("execution:start:budget-a"),
      claim("execution:start:budget-b"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejection = results.find((result) => result.status === "rejected");
    expect(rejection).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ message: "Execution budget would be exceeded" }),
    });
    const journal = await readBlobJournal(store, PROFILE_ID);
    expect(journal.revision).toBe(1);
    expect(claimedReservationMicros(journal)).toBe(6_000_000);
  });

  it("retries a conditional-write race without dropping either event", async () => {
    const store = memoryStore();
    await appendBlobJournalEvent({
      store,
      profileId: PROFILE_ID,
      event: {
        id: "seed",
        kind: "CONTROL_UPDATED",
        occurredAtMs: 1_000,
        payload: { mode: "shadow" },
      },
    });

    const originalReplace = store.replace.bind(store);
    let raced = false;
    store.replace = vi.fn(async (pathname, body, etag) => {
      if (!raced) {
        raced = true;
        await appendBlobJournalEvent({
          store: { ...store, replace: originalReplace },
          profileId: PROFILE_ID,
          event: {
            id: "racer",
            kind: "READINESS_OBSERVED",
            occurredAtMs: 1_001,
            payload: { ready: false },
          },
        });
      }
      return originalReplace(pathname, body, etag);
    });

    const result = await appendBlobJournalEvent({
      store,
      profileId: PROFILE_ID,
      event: {
        id: "winner",
        kind: "READINESS_OBSERVED",
        occurredAtMs: 1_002,
        payload: { ready: true },
      },
    });

    expect(result.events.map((event) => event.id)).toEqual([
      "seed",
      "racer",
      "winner",
    ]);
    expect(result.revision).toBe(3);
  });

  it("fails closed when the stored chain or schema is malformed", async () => {
    const store = memoryStore();
    store.objects.set("txbet/execution/did%3Aprivy%3Auser-1/journal.json", {
      etag: "tampered",
      body: JSON.stringify({
        schemaVersion: "txbet-blob-journal-v1",
        profileId: PROFILE_ID,
        revision: 1,
        events: [
          {
            id: "event-1",
            kind: "CONTROL_UPDATED",
            occurredAtMs: 1_000,
            payload: {},
            previousHash: null,
            eventHash: `sha256:${"0".repeat(64)}`,
          },
        ],
      }),
    });

    await expect(readBlobJournal(store, PROFILE_ID)).rejects.toThrow(/journal/i);
  });

  it("fails closed at the hard monolithic-journal event limit", async () => {
    const store = memoryStore();
    const pathname = "txbet/execution/did%3Aprivy%3Auser-1/journal.json";
    store.objects.set(pathname, {
      etag: "at-capacity",
      body: blobJournalFixture(
        PROFILE_ID,
        Array.from({ length: BLOB_JOURNAL_EVENT_LIMIT }, (_, index) => ({
          id: `seed:${index}`,
          kind: "READINESS_OBSERVED",
          occurredAtMs: index,
          payload: { ready: false },
        })),
      ),
    });

    await expect(appendBlobJournalEvent({
      store,
      profileId: PROFILE_ID,
      event: {
        id: "over-capacity",
        kind: "READINESS_OBSERVED",
        occurredAtMs: BLOB_JOURNAL_EVENT_LIMIT,
        payload: { ready: false },
      },
    })).rejects.toThrow(/bounded event capacity/i);
  });
});
