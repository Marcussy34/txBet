import { describe, expect, it, vi } from "vitest";

import {
  StrategyConflictError,
  createWorldCupStrategyService,
} from "@/server/strategies/service";

const enabledInput = {
  enabled: true,
  venueIds: ["polymarket", "kalshi-dflow"],
  marketScope: "all-verified-world-cup",
  riskLimitsVersion: 4,
  expectedVersion: 2,
} as const;

function readySnapshot() {
  return {
    currentRiskLimitsVersion: 4,
    nowMs: 1_000,
    grant: {
      active: true,
      expiresAt: 2_000,
      riskLimitsVersion: 4,
      venueIds: ["polymarket", "kalshi-dflow"] as (
        | "polymarket"
        | "kalshi-dflow"
      )[],
    },
    venues: [
      {
        venueId: "polymarket" as const,
        certified: true,
        accountReady: true,
        policyCurrent: true,
      },
      {
        venueId: "kalshi-dflow" as const,
        certified: true,
        accountReady: true,
        policyCurrent: true,
      },
    ],
  };
}

describe("World Cup strategy activation", () => {
  it("activates only the fixed complementary all-verified scope", async () => {
    const compareAndSet = vi.fn(async (_profileId, input) => ({
      profileId: "profile-1",
      version: 3,
      enabled: input.enabled,
      venueIds: input.venueIds,
      marketScope: input.marketScope,
      riskLimitsVersion: input.riskLimitsVersion,
    }));
    const service = createWorldCupStrategyService({
      loadActivationSnapshot: vi.fn(async () => readySnapshot()),
      compareAndSet,
    });

    await expect(service.update("profile-1", enabledInput)).resolves.toMatchObject({
      enabled: true,
      marketScope: "all-verified-world-cup",
      version: 3,
    });
    expect(compareAndSet).toHaveBeenCalledTimes(1);
  });

  it("rejects unknown fields, duplicate/single venues, directional scope, and stale risk", async () => {
    const loadActivationSnapshot = vi.fn(async () => readySnapshot());
    const compareAndSet = vi.fn();
    const service = createWorldCupStrategyService({
      loadActivationSnapshot,
      compareAndSet,
    });

    for (const mutation of [
      { venueIds: ["polymarket"] },
      { venueIds: ["polymarket", "polymarket"] },
      { venueIds: ["polymarket", "unknown"] },
      { marketScope: "directional-world-cup" },
      { riskLimitsVersion: 3 },
      { extra: true },
    ]) {
      await expect(
        service.update("profile-1", { ...enabledInput, ...mutation }),
      ).rejects.toThrow();
    }
    expect(compareAndSet).not.toHaveBeenCalled();
  });

  it("fails closed for uncertified, unready, stale-policy, uncovered, or expired venues", async () => {
    for (const mutate of [
      (snapshot: ReturnType<typeof readySnapshot>) => {
        snapshot.venues[1].certified = false;
      },
      (snapshot: ReturnType<typeof readySnapshot>) => {
        snapshot.venues[1].accountReady = false;
      },
      (snapshot: ReturnType<typeof readySnapshot>) => {
        snapshot.venues[1].policyCurrent = false;
      },
      (snapshot: ReturnType<typeof readySnapshot>) => {
        snapshot.grant.venueIds = ["polymarket"];
      },
      (snapshot: ReturnType<typeof readySnapshot>) => {
        snapshot.grant.expiresAt = 1_000;
      },
      (snapshot: ReturnType<typeof readySnapshot>) => {
        snapshot.grant.active = false;
      },
    ]) {
      const snapshot = readySnapshot();
      mutate(snapshot);
      const compareAndSet = vi.fn();
      const service = createWorldCupStrategyService({
        loadActivationSnapshot: vi.fn(async () => snapshot),
        compareAndSet,
      });
      await expect(service.update("profile-1", enabledInput)).rejects.toThrow();
      expect(compareAndSet).not.toHaveBeenCalled();
    }
  });

  it("deactivates immediately without requiring upstream readiness", async () => {
    const loadActivationSnapshot = vi.fn();
    const compareAndSet = vi.fn(async () => ({
      profileId: "profile-1",
      version: 3,
      enabled: false,
      venueIds: enabledInput.venueIds,
      marketScope: enabledInput.marketScope,
      riskLimitsVersion: enabledInput.riskLimitsVersion,
    }));
    const service = createWorldCupStrategyService({
      loadActivationSnapshot,
      compareAndSet,
    });

    await expect(
      service.update("profile-1", { ...enabledInput, enabled: false }),
    ).resolves.toMatchObject({ enabled: false });
    expect(loadActivationSnapshot).not.toHaveBeenCalled();
  });

  it("surfaces optimistic conflicts", async () => {
    const service = createWorldCupStrategyService({
      loadActivationSnapshot: vi.fn(async () => readySnapshot()),
      compareAndSet: vi.fn(async () => null),
    });
    await expect(service.update("profile-1", enabledInput)).rejects.toBeInstanceOf(
      StrategyConflictError,
    );
  });
});
