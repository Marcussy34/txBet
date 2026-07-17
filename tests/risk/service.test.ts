import { describe, expect, it, vi } from "vitest";

import {
  RiskSettingsConflictError,
  createRiskSettingsService,
} from "@/server/risk/service";

const input = {
  maxOrderUsd: "25",
  rolling24hUsd: "200",
  strategyBudgetUsd: "50",
  totalCapitalUsd: "100",
  emergencyLossUsd: "2",
  emergencyLossBps: 200,
  maxContractExposureUsd: "25",
  maxFixtureExposureUsd: "50",
  maxTeamExposureUsd: "50",
  maxVenueExposureUsd: "75",
  maxAggregateExposureUsd: "100",
  minNetReturnBps: 150,
  minNetProfitUsd: "0.25",
};

describe("risk settings service", () => {
  it("parses exact limits and passes expectedVersion to compare-and-set", async () => {
    const compareAndSet = vi.fn(async (_profileId, _expectedVersion, limits) => ({
      profileId: "profile-1",
      version: 4,
      limits,
    }));
    const service = createRiskSettingsService({
      get: vi.fn(),
      compareAndSet,
    });

    const result = await service.update("profile-1", {
      expectedVersion: 3,
      limits: input,
    });

    expect(result.version).toBe(4);
    expect(result.limits.maxOrderMicros).toBe(25_000_000);
    expect(compareAndSet).toHaveBeenCalledWith(
      "profile-1",
      3,
      expect.objectContaining({ minNetProfitMicros: 250_000 }),
    );
  });

  it("returns a typed conflict without overwriting the newer version", async () => {
    const compareAndSet = vi.fn(async () => null);
    const service = createRiskSettingsService({ get: vi.fn(), compareAndSet });

    await expect(
      service.update("profile-1", { expectedVersion: 3, limits: input }),
    ).rejects.toBeInstanceOf(RiskSettingsConflictError);
    expect(compareAndSet).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed or looser input before repository access", async () => {
    const compareAndSet = vi.fn();
    const service = createRiskSettingsService({ get: vi.fn(), compareAndSet });

    await expect(
      service.update("profile-1", {
        expectedVersion: 0,
        limits: { ...input, maxOrderUsd: "100.000001" },
      }),
    ).rejects.toThrow();
    expect(compareAndSet).not.toHaveBeenCalled();
  });
});
