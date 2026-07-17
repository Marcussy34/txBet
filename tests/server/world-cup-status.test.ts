import { describe, expect, it, vi } from "vitest";

import {
  createTxLineWorldCupStatusReader,
  readWorldCupStatus,
  type TxLineWorldCupDependencies,
} from "@/server/txline/world-cup-status";

const NOW = Date.parse("2026-07-17T12:00:00.000Z");
const MAX_LIVE_AGE_MS = 30_000;
const TOKEN = "never-return-this-token";

function dependencies(
  rows: readonly unknown[] = [
    {
      fixtureId: 123,
      competitionId: 500005,
      action: "Goal",
      gameState: "H2",
      ts: NOW - 1_000,
      seq: 42,
      confirmed: true,
    },
  ],
): TxLineWorldCupDependencies {
  return {
    startGuestSession: vi.fn().mockResolvedValue("guest-jwt"),
    fetchScoreSnapshot: vi.fn().mockResolvedValue(rows),
  };
}

const configured = {
  TXLINE_BASE_URL: "https://txline.txodds.com",
  TXLINE_API_TOKEN: TOKEN,
  TXLINE_FIXTURE_ID: "123",
};

describe("readWorldCupStatus", () => {
  it("returns an explicit unconfigured status without touching the network", async () => {
    const deps = dependencies();

    await expect(
      readWorldCupStatus({ source: {}, nowMs: NOW, dependencies: deps }),
    ).resolves.toEqual({
      status: "unconfigured",
      provenance: "deterministic-replay",
      verification: "REPLAY_NOT_LIVE",
      reason: "TXLINE_MVP_NOT_CONFIGURED",
    });
    expect(deps.startGuestSession).not.toHaveBeenCalled();
  });

  it("returns the latest valid official snapshot row as live but unverified", async () => {
    const deps = dependencies([
      {
        fixtureId: 123,
        competitionId: 500005,
        action: "Kickoff",
        gameState: "H1",
        ts: NOW - 2_000,
        seq: 40,
        confirmed: true,
      },
      {
        fixtureId: 123,
        competitionId: 500005,
        action: "Goal",
        gameState: "H2",
        ts: NOW - 1_000,
        seq: 42,
        confirmed: true,
      },
    ]);

    const result = await readWorldCupStatus({
      source: configured,
      nowMs: NOW,
      dependencies: deps,
    });

    expect(result).toEqual({
      status: "live",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      fixtureId: "123",
      competitionId: "500005",
      action: "Goal",
      gameState: "H2",
      observedAtMs: NOW - 1_000,
      sequence: 42,
      confirmed: true,
      ageMs: 1_000,
    });
    expect(deps.startGuestSession).toHaveBeenCalledWith(
      "https://txline.txodds.com",
      { signal: expect.any(AbortSignal) },
    );
    expect(deps.fetchScoreSnapshot).toHaveBeenCalledWith({
      baseUrl: "https://txline.txodds.com",
      fixtureId: "123",
      guestJwt: "guest-jwt",
      apiToken: TOKEN,
      signal: expect.any(AbortSignal),
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("accepts a confirmed observation exactly at the freshness boundary", async () => {
    await expect(
      readWorldCupStatus({
        source: configured,
        nowMs: NOW,
        dependencies: dependencies([
          {
            fixtureId: 123,
            competitionId: 500005,
            action: "Goal",
            gameState: "H2",
            ts: NOW - MAX_LIVE_AGE_MS,
            seq: 42,
            confirmed: true,
          },
        ]),
      }),
    ).resolves.toMatchObject({ status: "live", ageMs: MAX_LIVE_AGE_MS });
  });

  it.each([
    ["stale", { ts: NOW - MAX_LIVE_AGE_MS - 1, confirmed: true }],
    ["unconfirmed", { ts: NOW - 1, confirmed: false }],
  ])("fails closed for a %s observation", async (_label, state) => {
    await expect(
      readWorldCupStatus({
        source: configured,
        nowMs: NOW,
        dependencies: dependencies([
          {
            fixtureId: 123,
            competitionId: 500005,
            action: "Goal",
            gameState: "H2",
            seq: 42,
            ...state,
          },
        ]),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      reason: "NO_VALID_TXLINE_OBSERVATION",
    });
  });

  it("rechecks observation freshness after upstream I/O completes", async () => {
    const clock = vi
      .fn<() => number>()
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 2_000);

    await expect(
      readWorldCupStatus({
        source: configured,
        nowMs: NOW,
        clock,
        dependencies: dependencies([
          {
            fixtureId: 123,
            competitionId: 500005,
            action: "Goal",
            gameState: "H2",
            ts: NOW - 29_000,
            seq: 42,
            confirmed: true,
          },
        ]),
      }),
    ).resolves.toEqual({
      status: "unavailable",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      reason: "NO_VALID_TXLINE_OBSERVATION",
    });
    expect(clock).toHaveBeenCalledTimes(2);
  });

  it("ignores malformed, wrong-fixture, and future rows", async () => {
    const result = await readWorldCupStatus({
      source: configured,
      nowMs: NOW,
      dependencies: dependencies([
        null,
        { fixtureId: 999, competitionId: 1, action: "Goal", gameState: "H2", ts: NOW - 1, seq: 1, confirmed: true },
        { fixtureId: 123, competitionId: 1, action: "Goal", gameState: "H2", ts: NOW + 1, seq: 1, confirmed: true },
      ]),
    });

    expect(result).toEqual({
      status: "unavailable",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      reason: "NO_VALID_TXLINE_OBSERVATION",
    });
  });

  it("normalizes dependency failures without leaking credential material", async () => {
    const deps = dependencies();
    vi.mocked(deps.startGuestSession).mockRejectedValue(
      new Error(`upstream echoed ${TOKEN}`),
    );

    const result = await readWorldCupStatus({
      source: configured,
      nowMs: NOW,
      dependencies: deps,
    });

    expect(result).toEqual({
      status: "unavailable",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      reason: "TXLINE_READ_FAILED",
    });
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("fails closed within the configured deadline when an upstream read hangs", async () => {
    const deps = dependencies();
    vi.mocked(deps.startGuestSession).mockImplementation(
      (_baseUrl, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            "abort",
            () => reject(options.signal?.reason),
            { once: true },
          );
        }),
    );

    const result = await Promise.race([
      readWorldCupStatus({
        source: configured,
        nowMs: NOW,
        dependencies: deps,
        requestTimeoutMs: 5,
      }),
      new Promise<"TEST_TIMEOUT">((resolve) =>
        setTimeout(() => resolve("TEST_TIMEOUT"), 100),
      ),
    ]);

    expect(result).toEqual({
      status: "unavailable",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      reason: "TXLINE_READ_FAILED",
    });
  });

  it.each([
    { ...configured, TXLINE_BASE_URL: "https://lookalike.example" },
    { ...configured, TXLINE_FIXTURE_ID: "../secret" },
    { ...configured, TXLINE_API_TOKEN: "" },
  ])("fails closed for partial or invalid configuration", async (source) => {
    await expect(
      readWorldCupStatus({ source, nowMs: NOW, dependencies: dependencies() }),
    ).resolves.toMatchObject({
      status: "unavailable",
      reason: "INVALID_TXLINE_MVP_CONFIGURATION",
    });
  });
});

describe("createTxLineWorldCupStatusReader", () => {
  const unconfigured = Object.freeze({
    status: "unconfigured",
    provenance: "deterministic-replay",
    verification: "REPLAY_NOT_LIVE",
    reason: "TXLINE_MVP_NOT_CONFIGURED",
  } as const);

  it("coalesces concurrent reads and retains a settled result for one second", async () => {
    let nowMs = NOW;
    const read = vi.fn(async () => unconfigured);
    const reader = createTxLineWorldCupStatusReader({
      read,
      clock: () => nowMs,
    });

    const first = reader();
    expect(reader()).toBe(first);
    await first;
    nowMs += 999;
    expect(reader()).toBe(first);
    nowMs += 1;
    expect(reader()).not.toBe(first);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("never caches a live observation beyond its freshness window", async () => {
    let nowMs = NOW;
    const read = vi.fn(async () => ({
      status: "live",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      fixtureId: "123",
      competitionId: "500005",
      action: "Goal",
      gameState: "H2",
      observedAtMs: NOW - MAX_LIVE_AGE_MS + 500,
      sequence: 42,
      confirmed: true,
      ageMs: MAX_LIVE_AGE_MS - 500,
    } as const));
    const reader = createTxLineWorldCupStatusReader({
      read,
      clock: () => nowMs,
    });

    const first = reader();
    await first;
    nowMs += 499;
    expect(reader()).toBe(first);
    nowMs += 1;
    expect(reader()).not.toBe(first);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("invalidates the cache and fails closed when its clock moves backward", async () => {
    let nowMs = NOW;
    const read = vi.fn(async () => unconfigured);
    const reader = createTxLineWorldCupStatusReader({
      read,
      clock: () => nowMs,
    });

    const first = reader();
    await first;
    nowMs -= 1;
    const rollback = reader();

    expect(rollback).not.toBe(first);
    await expect(rollback).resolves.toEqual({
      status: "unavailable",
      provenance: "txline-mainnet-rest",
      verification: "LIVE_UNVERIFIED",
      reason: "INVALID_TXLINE_MVP_CONFIGURATION",
    });
    expect(read).toHaveBeenCalledOnce();
  });
});
