import { describe, expect, it } from "vitest";

import {
  BlobJournalConflictError,
  readBlobJournal,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";
import {
  ExecutionControlConflictError,
  ExecutionControlHistoryLimitError,
  ExecutionControlRateLimitError,
  VERCEL_CONTROL_UPDATE_LIMIT,
  readVercelExecutionControl,
  updateVercelExecutionControl,
} from "@/server/execution/vercel-control";
import { blobJournalFixture } from "../fixtures/blob-journal";

const PROFILE_ID = "did:privy:user-1";
const NOW = 1_784_249_200_000;

function memoryStore(initialBody?: string): BlobJournalObjectStore {
  const objects = new Map<string, { body: string; etag: string }>();
  let revision = 0;
  if (initialBody !== undefined) {
    revision = 1;
    objects.set("txbet/execution/did%3Aprivy%3Auser-1/journal.json", {
      body: initialBody,
      etag: "etag-1",
    });
  }
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

describe("Vercel-only execution control", () => {
  it("defaults to disabled and reports the two venue truths", async () => {
    await expect(
      readVercelExecutionControl(memoryStore(), PROFILE_ID, NOW),
    ).resolves.toEqual({
      schemaVersion: "txbet-vercel-control-view-v1",
      version: 0,
      requestedMode: "disabled",
      effectiveAgentMode: "disabled",
      maxTotalMicros: 0,
      expiresAtMs: null,
      worldCupOnly: true,
      polymarket: {
        mode: "disabled",
        exactInventorySellCanaryCandidate: true,
      },
      kalshiDflow: {
        mode: "shadow",
        executable: false,
        blocker: "DFLOW_EXACT_OUTPUT_AND_PRODUCTION_ELIGIBILITY_UNPROVEN",
        manualExactInputCanary: {
          candidate: true,
          authorized: false,
        },
      },
      pairedExecution: {
        executable: false,
        blockers: [
          "DFLOW_EXACT_OUTPUT_AND_PRODUCTION_ELIGIBILITY_UNPROVEN",
          "SECOND_EXACT_COMPLEMENTARY_LIVE_LEG_UNAVAILABLE",
        ],
      },
    });
  });

  it("persists user limits while holding the paired agent in shadow", async () => {
    const store = memoryStore();
    const view = await updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: {
        expectedVersion: 0,
        mode: "canary",
        maxTotalMicros: 5_000_000,
        expiresAtMs: NOW + 86_400_000,
        confirmRealMoney: true,
      },
    });

    expect(view).toMatchObject({
      version: 1,
      requestedMode: "canary",
      effectiveAgentMode: "shadow",
      maxTotalMicros: 5_000_000,
      polymarket: { mode: "canary" },
      pairedExecution: { executable: false },
    });
    await expect(readVercelExecutionControl(store, PROFILE_ID, NOW)).resolves.toEqual(
      view,
    );
  });

  it("requires explicit canary consent and enforces the $10 ceiling", async () => {
    const store = memoryStore();
    for (const input of [
      {
        expectedVersion: 0,
        mode: "canary",
        maxTotalMicros: 1_000_000,
        expiresAtMs: NOW + 1_000,
        confirmRealMoney: false,
      },
      {
        expectedVersion: 0,
        mode: "canary",
        maxTotalMicros: 10_000_001,
        expiresAtMs: NOW + 1_000,
        confirmRealMoney: true,
      },
    ] as const) {
      await expect(
        updateVercelExecutionControl({ store, profileId: PROFILE_ID, nowMs: NOW, input }),
      ).rejects.toThrow();
    }
  });

  it("uses versioned updates and makes exact duplicate submissions idempotent", async () => {
    const store = memoryStore();
    const input = {
      expectedVersion: 0,
      mode: "shadow" as const,
      maxTotalMicros: 1_000_000,
      expiresAtMs: NOW + 1_000,
      confirmRealMoney: false,
    };
    const first = await updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input,
      idempotencyKey: "shadow-v1",
    });
    await expect(
      updateVercelExecutionControl({
        store,
        profileId: PROFILE_ID,
        nowMs: NOW + 1,
        input,
        idempotencyKey: "shadow-v1",
      }),
    ).resolves.toEqual(first);
    await expect(
      updateVercelExecutionControl({
        store,
        profileId: PROFILE_ID,
        nowMs: NOW,
        input: { ...input, maxTotalMicros: 2_000_000 },
        idempotencyKey: "shadow-v1",
      }),
    ).rejects.toBeInstanceOf(ExecutionControlConflictError);

    const journal = await readBlobJournal(store, PROFILE_ID);
    expect(journal.events.at(-1)?.payload).toMatchObject({
      idempotencyKey: "shadow-v1",
      requestHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
  });

  it("replays concurrent matching keys and rejects key reuse with different input", async () => {
    const store = memoryStore();
    const input = {
      expectedVersion: 0,
      mode: "shadow" as const,
      maxTotalMicros: 1_000_000,
      expiresAtMs: NOW + 1_000,
      confirmRealMoney: false,
    };

    const [first, retry] = await Promise.all([
      updateVercelExecutionControl({
        store,
        profileId: PROFILE_ID,
        nowMs: NOW,
        input,
        idempotencyKey: "concurrent-v1",
      }),
      updateVercelExecutionControl({
        store,
        profileId: PROFILE_ID,
        nowMs: NOW + 1,
        input,
        idempotencyKey: "concurrent-v1",
      }),
    ]);

    expect(retry).toEqual(first);
    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW + 2,
      input: { ...input, maxTotalMicros: 2_000_000 },
      idempotencyKey: "concurrent-v1",
    })).rejects.toBeInstanceOf(ExecutionControlConflictError);
  });

  it("does not accept an unstored key through request-hash fallback", async () => {
    const store = memoryStore();
    const firstInput = {
      expectedVersion: 0,
      mode: "shadow" as const,
      maxTotalMicros: 1_000_000,
      expiresAtMs: NOW + 60_000,
      confirmRealMoney: false,
    };
    await updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: firstInput,
      idempotencyKey: "key-a",
    });

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW + 1,
      input: firstInput,
      idempotencyKey: "key-b",
    })).rejects.toBeInstanceOf(ExecutionControlConflictError);

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW + 5_000,
      input: {
        ...firstInput,
        expectedVersion: 1,
        maxTotalMicros: 2_000_000,
      },
      idempotencyKey: "key-b",
    })).resolves.toMatchObject({ version: 2, maxTotalMicros: 2_000_000 });
  });

  it("does not claim idempotent success for a legacy record without key evidence", async () => {
    const expiresAtMs = NOW + 60_000;
    const store = memoryStore(blobJournalFixture(PROFILE_ID, [{
      id: "control:1",
      kind: "CONTROL_UPDATED",
      occurredAtMs: NOW - 5_000,
      payload: {
        schemaVersion: "txbet-execution-control-v1",
        version: 1,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs,
        updatedAtMs: NOW - 5_000,
        worldCupOnly: true,
      },
    }]));

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: {
        expectedVersion: 0,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs,
        confirmRealMoney: false,
      },
      idempotencyKey: "legacy-key",
    })).rejects.toBeInstanceOf(ExecutionControlConflictError);

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: {
        expectedVersion: 1,
        mode: "shadow",
        maxTotalMicros: 2_000_000,
        expiresAtMs,
        confirmRealMoney: false,
      },
      idempotencyKey: "legacy-key",
    })).resolves.toMatchObject({ version: 2, maxTotalMicros: 2_000_000 });
  });

  it("rejects a racing retry when a newer control exists before recovery", async () => {
    const seeded = memoryStore();
    const firstInput = {
      expectedVersion: 0,
      mode: "shadow" as const,
      maxTotalMicros: 1_000_000,
      expiresAtMs: NOW + 60_000,
      confirmRealMoney: false,
    };
    await updateVercelExecutionControl({
      store: seeded,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: firstInput,
      idempotencyKey: "racing-key-a",
    });
    await updateVercelExecutionControl({
      store: seeded,
      profileId: PROFILE_ID,
      nowMs: NOW + 5_000,
      input: {
        ...firstInput,
        expectedVersion: 1,
        maxTotalMicros: 2_000_000,
      },
      idempotencyKey: "racing-key-b",
    });
    const pathname = "txbet/execution/did%3Aprivy%3Auser-1/journal.json";
    const advanced = await seeded.read(pathname);
    if (advanced === null) throw new Error("Seed journal missing");

    let reads = 0;
    const racingStore: BlobJournalObjectStore = {
      async read() {
        reads += 1;
        return reads <= 2 ? null : advanced;
      },
      async create() {
        throw new BlobJournalConflictError();
      },
      async replace() {
        throw new Error("Unexpected replacement");
      },
    };

    await expect(updateVercelExecutionControl({
      store: racingStore,
      profileId: PROFILE_ID,
      nowMs: NOW + 1,
      input: firstInput,
      idempotencyKey: "racing-key-a",
    })).rejects.toBeInstanceOf(ExecutionControlConflictError);
  });

  it("throttles authority increases but always permits immediate disable", async () => {
    const store = memoryStore();
    await updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: {
        expectedVersion: 0,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs: NOW + 60_000,
        confirmRealMoney: false,
      },
      idempotencyKey: "rate-v1",
    });

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW + 1,
      input: {
        expectedVersion: 1,
        mode: "shadow",
        maxTotalMicros: 2_000_000,
        expiresAtMs: NOW + 60_000,
        confirmRealMoney: false,
      },
      idempotencyKey: "rate-v2",
    })).rejects.toBeInstanceOf(ExecutionControlRateLimitError);

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW + 1,
      input: {
        expectedVersion: 1,
        mode: "disabled",
        maxTotalMicros: 0,
        expiresAtMs: null,
        confirmRealMoney: false,
      },
      idempotencyKey: "disable-v2",
    })).resolves.toMatchObject({ version: 2, requestedMode: "disabled" });
  });

  it("does not persist repeated no-op disables", async () => {
    const store = memoryStore();
    const disable = {
      mode: "disabled" as const,
      maxTotalMicros: 0,
      expiresAtMs: null,
      confirmRealMoney: false,
    };

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: { expectedVersion: 0, ...disable },
      idempotencyKey: "default-disable",
    })).resolves.toMatchObject({ version: 0, requestedMode: "disabled" });
    await expect(store.read(
      "txbet/execution/did%3Aprivy%3Auser-1/journal.json",
    )).resolves.toBeNull();

    await updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: {
        expectedVersion: 0,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs: NOW + 60_000,
        confirmRealMoney: false,
      },
      idempotencyKey: "arm-v1",
    });
    await updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW + 1,
      input: { expectedVersion: 1, ...disable },
      idempotencyKey: "disable-v2",
    });

    for (let index = 0; index < 10; index += 1) {
      await expect(updateVercelExecutionControl({
        store,
        profileId: PROFILE_ID,
        nowMs: NOW + 2 + index,
        input: { expectedVersion: 2, ...disable },
        idempotencyKey: `repeat-disable-${index}`,
      })).resolves.toMatchObject({ version: 2, requestedMode: "disabled" });
    }
    await expect(readBlobJournal(store, PROFILE_ID)).resolves.toMatchObject({
      revision: 2,
    });
  });

  it("reserves the final bounded control version for immediate disable", async () => {
    const seededEvents = Array.from(
      { length: VERCEL_CONTROL_UPDATE_LIMIT - 1 },
      (_, index) => {
        const version = index + 1;
        return {
          id: `control:${version}`,
          kind: "CONTROL_UPDATED",
          occurredAtMs: NOW - (VERCEL_CONTROL_UPDATE_LIMIT - version) * 5_000,
          payload: {
            schemaVersion: "txbet-execution-control-v1",
            version,
            mode: "shadow",
            maxTotalMicros: 1_000_000,
            expiresAtMs: NOW + 60_000,
            updatedAtMs: NOW - (VERCEL_CONTROL_UPDATE_LIMIT - version) * 5_000,
            worldCupOnly: true,
            idempotencyKey: `seed-control-${version}`,
            requestHash: `sha256:${"a".repeat(64)}`,
          },
        } as const;
      },
    );
    const store = memoryStore(blobJournalFixture(PROFILE_ID, seededEvents));

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: {
        expectedVersion: VERCEL_CONTROL_UPDATE_LIMIT - 1,
        mode: "disabled",
        maxTotalMicros: 0,
        expiresAtMs: null,
        confirmRealMoney: false,
      },
      idempotencyKey: "final-disable",
    })).resolves.toMatchObject({
      version: VERCEL_CONTROL_UPDATE_LIMIT,
      requestedMode: "disabled",
    });

    await expect(updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW + 5_000,
      input: {
        expectedVersion: VERCEL_CONTROL_UPDATE_LIMIT,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs: NOW + 60_000,
        confirmRealMoney: false,
      },
      idempotencyKey: "over-control-limit",
    })).rejects.toBeInstanceOf(ExecutionControlHistoryLimitError);
  });

  it("fails closed after the user grant expires", async () => {
    const store = memoryStore();
    await updateVercelExecutionControl({
      store,
      profileId: PROFILE_ID,
      nowMs: NOW,
      input: {
        expectedVersion: 0,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs: NOW + 1,
        confirmRealMoney: false,
      },
    });

    await expect(readVercelExecutionControl(store, PROFILE_ID, NOW + 1)).resolves.toMatchObject({
      requestedMode: "disabled",
      effectiveAgentMode: "disabled",
      version: 1,
    });
  });
});
