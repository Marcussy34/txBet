import { describe, expect, it, vi } from "vitest";

import {
  BlobJournalConflictError,
  appendBlobJournalEvent,
  readBlobJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";

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
});
