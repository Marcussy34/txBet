import { describe, expect, it, vi } from "vitest";

import { createRiskLimitsRepository } from "@/server/risk/repository";
import type { DbTransaction } from "@/server/db/types";
import type { RiskLimits } from "@/server/risk/policy";

const limits: RiskLimits = {
  maxOrderMicros: 10_000_000,
  rolling24hMicros: 20_000_000,
  strategyBudgetMicros: 10_000_000,
  totalCapitalMicros: 20_000_000,
  emergencyLossMicros: 500_000,
  emergencyLossBps: 500,
  maxContractExposureMicros: 5_000_000,
  maxFixtureExposureMicros: 5_000_000,
  maxTeamExposureMicros: 5_000_000,
  maxVenueExposureMicros: 5_000_000,
  maxAggregateExposureMicros: 10_000_000,
  minNetReturnBps: 100,
  minNetProfitMicros: 100_000,
};

describe("risk repository", () => {
  it("uses profile and expected version in one parameterized compare-and-set", async () => {
    const query = vi.fn(async (_text: string, values?: readonly unknown[]) => ({
      rows: [{
        profile_id: values?.[0],
        version: "4",
        max_order_micros: limits.maxOrderMicros,
        rolling_24h_micros: limits.rolling24hMicros,
        strategy_budget_micros: limits.strategyBudgetMicros,
        total_capital_micros: limits.totalCapitalMicros,
        emergency_loss_micros: limits.emergencyLossMicros,
        emergency_loss_bps: limits.emergencyLossBps,
        max_contract_exposure_micros: limits.maxContractExposureMicros,
        max_fixture_exposure_micros: limits.maxFixtureExposureMicros,
        max_team_exposure_micros: limits.maxTeamExposureMicros,
        max_venue_exposure_micros: limits.maxVenueExposureMicros,
        max_aggregate_exposure_micros: limits.maxAggregateExposureMicros,
        min_net_return_bps: limits.minNetReturnBps,
        min_net_profit_micros: limits.minNetProfitMicros,
      }],
      rowCount: 1,
    }));
    const repository = createRiskLimitsRepository({ query } as DbTransaction);

    const updated = await repository.compareAndSet(
      "00000000-0000-4000-8000-000000000001",
      3,
      limits,
    );

    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toContain("profile_id = $1");
    expect(sql).toContain("version = $2");
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(values?.[0]).toBe("00000000-0000-4000-8000-000000000001");
    expect(values?.[1]).toBe(3);
    expect(updated?.version).toBe(4);
  });

  it("returns null on an optimistic version conflict", async () => {
    const repository = createRiskLimitsRepository({
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as DbTransaction);

    await expect(
      repository.compareAndSet(
        "00000000-0000-4000-8000-000000000001",
        9,
        limits,
      ),
    ).resolves.toBeNull();
  });

  it("permits an initial insert only when the caller expects version zero", async () => {
    const query = vi.fn(async (...args: [text: string, values?: readonly unknown[]]) => {
      void args;
      return { rows: [], rowCount: 0 };
    });
    const repository = createRiskLimitsRepository({ query } as DbTransaction);

    await repository.compareAndSet(
      "00000000-0000-4000-8000-000000000001",
      0,
      limits,
    );

    const [sql] = query.mock.calls[0] ?? [];
    expect(sql).toMatch(/select\s+\$1,\s*1,/i);
    expect(sql).toContain("where $2 = 0");
  });
});
