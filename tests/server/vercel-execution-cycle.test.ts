import { describe, expect, it, vi } from "vitest";

import {
  BlobJournalConflictError,
  readBlobJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";
import {
  runVercelExecutionCycle,
} from "@/server/execution/vercel-cycle";
import { updateVercelExecutionControl } from "@/server/execution/vercel-control";

const NOW = 1_784_249_200_000;

function memoryStore(): BlobJournalObjectStore {
  const objects = new Map<string, { body: string; etag: string }>();
  let revision = 0;
  return {
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

describe("single-deployment Vercel execution cycle", () => {
  it("wakes active profiles in shadow and has no money-mutation branch", async () => {
    const store = memoryStore();
    await updateVercelExecutionControl({
      store,
      profileId: "did:privy:shadow-user",
      nowMs: NOW,
      input: {
        expectedVersion: 0,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs: NOW + 86_400_000,
        confirmRealMoney: false,
      },
    });
    await updateVercelExecutionControl({
      store,
      profileId: "did:privy:canary-user",
      nowMs: NOW,
      input: {
        expectedVersion: 0,
        mode: "canary",
        maxTotalMicros: 2_000_000,
        expiresAtMs: NOW + 86_400_000,
        confirmRealMoney: true,
      },
    });
    const readShadowStatus = vi.fn(async () => ({ status: "scanned" as const }));

    await expect(runVercelExecutionCycle({
      store,
      profileIds: [
        "did:privy:disabled-user",
        "did:privy:shadow-user",
        "did:privy:canary-user",
      ],
      nowMs: NOW + 1_000,
      readShadowStatus,
    })).resolves.toEqual({
      schemaVersion: "txbet-vercel-cycle-v1",
      observedAtMs: NOW + 1_000,
      profilesDiscovered: 3,
      profilesProcessed: 3,
      profilesDeferred: 0,
      failedProfiles: 0,
      disabledProfiles: 1,
      activeProfiles: 2,
      shadowProfiles: 1,
      canaryRequestedProfiles: 1,
      polymarketShadowStatus: "scanned",
      liveSubmissions: 0,
      dflowMutations: 0,
      pairedExecution: false,
    });
    expect(readShadowStatus).toHaveBeenCalledTimes(1);

    const journal = await readBlobJournal(store, "did:privy:canary-user");
    expect(journal.events.at(-1)).toMatchObject({
      kind: "AGENT_CYCLE_OBSERVED",
      payload: {
        requestedMode: "canary",
        effectiveMode: "shadow",
        pairedExecution: false,
        liveSubmissions: 0,
      },
    });

    const readSpy = vi.spyOn(store, "read");
    await runVercelExecutionCycle({
      store,
      profileIds: ["did:privy:shadow-user", "did:privy:canary-user"],
      nowMs: NOW + 2_000,
      readShadowStatus,
    });
    const retriedJournal = await readBlobJournal(store, "did:privy:canary-user");
    expect(
      retriedJournal.events.filter((event) => event.kind === "AGENT_CYCLE_OBSERVED"),
    ).toHaveLength(1);
    // Two control reads plus the explicit assertion read: no duplicate append read.
    expect(readSpy).toHaveBeenCalledTimes(3);
  });

  it("does not scan when every discovered profile is disabled", async () => {
    const readShadowStatus = vi.fn(async () => ({ status: "scanned" as const }));
    await expect(runVercelExecutionCycle({
      store: memoryStore(),
      profileIds: ["did:privy:disabled-user"],
      nowMs: NOW,
      readShadowStatus,
    })).resolves.toMatchObject({
      activeProfiles: 0,
      polymarketShadowStatus: "not-run",
      liveSubmissions: 0,
    });
    expect(readShadowStatus).not.toHaveBeenCalled();
  });

  it("rotates bounded profile batches instead of rejecting the 101st journal", async () => {
    const profileIds = Array.from(
      { length: 101 },
      (_, index) => `did:privy:user-${String(index).padStart(3, "0")}`,
    );
    const readShadowStatus = vi.fn(async () => ({ status: "scanned" as const }));

    const first = await runVercelExecutionCycle({
      store: memoryStore(),
      profileIds,
      nowMs: NOW,
      readShadowStatus,
    });
    const second = await runVercelExecutionCycle({
      store: memoryStore(),
      profileIds,
      nowMs: NOW + 60_000,
      readShadowStatus,
    });

    expect([first.profilesProcessed, second.profilesProcessed].sort()).toEqual([1, 100]);
    expect([first.profilesDeferred, second.profilesDeferred].sort()).toEqual([1, 100]);
    expect(first.profilesDiscovered).toBe(101);
    expect(second.profilesDiscovered).toBe(101);
    expect(readShadowStatus).not.toHaveBeenCalled();
  });

  it("fails one unreadable profile closed without starving its peers", async () => {
    const store = memoryStore();
    const read = store.read.bind(store);
    store.read = async (pathname) => {
      if (pathname.includes("broken-user")) throw new Error("unavailable");
      return read(pathname);
    };

    await expect(runVercelExecutionCycle({
      store,
      profileIds: ["did:privy:broken-user", "did:privy:disabled-user"],
      nowMs: NOW,
      readShadowStatus: vi.fn(async () => ({ status: "scanned" as const })),
    })).resolves.toMatchObject({
      profilesProcessed: 2,
      failedProfiles: 1,
      disabledProfiles: 1,
      activeProfiles: 0,
    });
  });
});
