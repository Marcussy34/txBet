import { describe, expect, it } from "vitest";

import {
  BlobJournalConflictError,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";
import {
  ExecutionControlConflictError,
  readVercelExecutionControl,
  updateVercelExecutionControl,
} from "@/server/execution/vercel-control";

const PROFILE_ID = "did:privy:user-1";
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
    });
    await expect(
      updateVercelExecutionControl({ store, profileId: PROFILE_ID, nowMs: NOW, input }),
    ).resolves.toEqual(first);
    await expect(
      updateVercelExecutionControl({
        store,
        profileId: PROFILE_ID,
        nowMs: NOW,
        input: { ...input, maxTotalMicros: 2_000_000 },
      }),
    ).rejects.toBeInstanceOf(ExecutionControlConflictError);
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
