import type { DbTransaction } from "@/server/db/types";

import type { RiskLimits } from "./policy";
import type { RiskSettingsRecord } from "./service";

interface RiskRow {
  readonly profile_id: string;
  readonly version: string | number;
  readonly max_order_micros: string | number;
  readonly rolling_24h_micros: string | number;
  readonly strategy_budget_micros: string | number;
  readonly total_capital_micros: string | number;
  readonly emergency_loss_micros: string | number;
  readonly emergency_loss_bps: string | number;
  readonly max_contract_exposure_micros: string | number;
  readonly max_fixture_exposure_micros: string | number;
  readonly max_team_exposure_micros: string | number;
  readonly max_venue_exposure_micros: string | number;
  readonly max_aggregate_exposure_micros: string | number;
  readonly min_net_return_bps: string | number;
  readonly min_net_profit_micros: string | number;
}

function integer(value: string | number, label: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`Database returned invalid ${label}`);
  }
  return parsed;
}

function record(row: RiskRow): RiskSettingsRecord {
  const limits: RiskLimits = Object.freeze({
    maxOrderMicros: integer(row.max_order_micros, "maximum order"),
    rolling24hMicros: integer(row.rolling_24h_micros, "rolling spend"),
    strategyBudgetMicros: integer(row.strategy_budget_micros, "strategy budget"),
    totalCapitalMicros: integer(row.total_capital_micros, "total capital"),
    emergencyLossMicros: integer(row.emergency_loss_micros, "emergency loss"),
    emergencyLossBps: integer(row.emergency_loss_bps, "emergency loss bps"),
    maxContractExposureMicros: integer(
      row.max_contract_exposure_micros,
      "contract exposure",
    ),
    maxFixtureExposureMicros: integer(
      row.max_fixture_exposure_micros,
      "fixture exposure",
    ),
    maxTeamExposureMicros: integer(row.max_team_exposure_micros, "team exposure"),
    maxVenueExposureMicros: integer(row.max_venue_exposure_micros, "venue exposure"),
    maxAggregateExposureMicros: integer(
      row.max_aggregate_exposure_micros,
      "aggregate exposure",
    ),
    minNetReturnBps: integer(row.min_net_return_bps, "minimum return"),
    minNetProfitMicros: integer(row.min_net_profit_micros, "minimum profit"),
  });
  return Object.freeze({
    profileId: row.profile_id,
    version: integer(row.version, "risk version", 1),
    limits,
  });
}

const columns = `profile_id, version, max_order_micros, rolling_24h_micros,
  strategy_budget_micros, total_capital_micros, emergency_loss_micros,
  emergency_loss_bps, max_contract_exposure_micros,
  max_fixture_exposure_micros, max_team_exposure_micros,
  max_venue_exposure_micros, max_aggregate_exposure_micros,
  min_net_return_bps, min_net_profit_micros`;

export function createRiskLimitsRepository(transaction: DbTransaction) {
  return Object.freeze({
    async get(profileId: string): Promise<RiskSettingsRecord | null> {
      const result = await transaction.query<RiskRow>(
        `select ${columns} from public.risk_limits where profile_id = $1`,
        [profileId],
      );
      return result.rows[0] === undefined ? null : record(result.rows[0]);
    },

    async compareAndSet(
      profileId: string,
      expectedVersion: number,
      limits: RiskLimits,
    ): Promise<RiskSettingsRecord | null> {
      const result = await transaction.query<RiskRow>(
        `insert into public.risk_limits
           (profile_id, version, max_order_micros, rolling_24h_micros,
            strategy_budget_micros, total_capital_micros, emergency_loss_micros,
            emergency_loss_bps, max_contract_exposure_micros,
            max_fixture_exposure_micros, max_team_exposure_micros,
            max_venue_exposure_micros, max_aggregate_exposure_micros,
            min_net_return_bps, min_net_profit_micros)
         select $1, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
         where $2 = 0 or exists (
           select 1 from public.risk_limits current
           where current.profile_id = $1 and current.version = $2
         )
         on conflict (profile_id) do update set
           max_order_micros = excluded.max_order_micros,
           rolling_24h_micros = excluded.rolling_24h_micros,
           strategy_budget_micros = excluded.strategy_budget_micros,
           total_capital_micros = excluded.total_capital_micros,
           emergency_loss_micros = excluded.emergency_loss_micros,
           emergency_loss_bps = excluded.emergency_loss_bps,
           max_contract_exposure_micros = excluded.max_contract_exposure_micros,
           max_fixture_exposure_micros = excluded.max_fixture_exposure_micros,
           max_team_exposure_micros = excluded.max_team_exposure_micros,
           max_venue_exposure_micros = excluded.max_venue_exposure_micros,
           max_aggregate_exposure_micros = excluded.max_aggregate_exposure_micros,
           min_net_return_bps = excluded.min_net_return_bps,
           min_net_profit_micros = excluded.min_net_profit_micros,
           version = risk_limits.version + 1,
           updated_at = pg_catalog.now()
         where risk_limits.profile_id = $1 and risk_limits.version = $2
         returning ${columns}`,
        [
          profileId,
          expectedVersion,
          limits.maxOrderMicros,
          limits.rolling24hMicros,
          limits.strategyBudgetMicros,
          limits.totalCapitalMicros,
          limits.emergencyLossMicros,
          limits.emergencyLossBps,
          limits.maxContractExposureMicros,
          limits.maxFixtureExposureMicros,
          limits.maxTeamExposureMicros,
          limits.maxVenueExposureMicros,
          limits.maxAggregateExposureMicros,
          limits.minNetReturnBps,
          limits.minNetProfitMicros,
        ],
      );
      return result.rows[0] === undefined ? null : record(result.rows[0]);
    },
  });
}
