import type { DbTransaction } from "@/server/db/types";

export const AUTOMATION_GRANT_STATUSES = Object.freeze([
  "PREPARED",
  "ACTIVE",
  "SUPERSESSION_PENDING",
  "SUPERSEDED",
  "REVOCATION_PENDING",
  "REVOKED",
  "EXPIRED",
  "INVALID",
] as const);

export type AutomationGrantStatus = (typeof AUTOMATION_GRANT_STATUSES)[number];

export interface AutomationGrantRecord {
  readonly id: string;
  readonly profileId: string;
  readonly status: AutomationGrantStatus;
  readonly expiresAt: string;
  readonly version: number;
}

interface GrantRow {
  readonly id: string;
  readonly profile_id: string;
  readonly status: AutomationGrantStatus;
  readonly expires_at: string | Date;
  readonly version: string | number;
}

function grant(row: GrantRow): AutomationGrantRecord {
  const version = Number(row.version);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error("Database returned an invalid grant version");
  }
  return Object.freeze({
    id: row.id,
    profileId: row.profile_id,
    status: row.status,
    expiresAt:
      row.expires_at instanceof Date
        ? row.expires_at.toISOString()
        : row.expires_at,
    version,
  });
}

const grantColumns = "id, profile_id, status, expires_at, version";

export function createAutomationGrantRepository(transaction: DbTransaction) {
  return Object.freeze({
    async compareAndSetStatus(input: {
      readonly profileId: string;
      readonly grantId: string;
      readonly expectedVersion: number;
      readonly nextStatus: AutomationGrantStatus;
    }): Promise<AutomationGrantRecord | null> {
      const result = await transaction.query<GrantRow>(
        `update public.automation_grants
         set status = $4, version = version + 1, updated_at = pg_catalog.now()
         where id = $1 and profile_id = $2 and version = $3
         returning ${grantColumns}`,
        [
          input.grantId,
          input.profileId,
          input.expectedVersion,
          input.nextStatus,
        ],
      );
      return result.rows[0] === undefined ? null : grant(result.rows[0]);
    },

    async listForProfile(input: {
      readonly profileId: string;
      readonly limit: number;
      readonly before: Readonly<{ createdAt: string; id: string }> | null;
    }): Promise<readonly AutomationGrantRecord[]> {
      if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) {
        throw new Error("Grant page size must be between 1 and 100");
      }
      const result = input.before
        ? await transaction.query<GrantRow>(
            `select ${grantColumns} from public.automation_grants
             where profile_id = $1
               and (created_at, id) < ($2::timestamptz, $3::uuid)
             order by created_at desc, id desc
             limit $4`,
            [input.profileId, input.before.createdAt, input.before.id, input.limit],
          )
        : await transaction.query<GrantRow>(
            `select ${grantColumns} from public.automation_grants
             where profile_id = $1
             order by created_at desc, id desc
             limit $2`,
            [input.profileId, input.limit],
          );
      return Object.freeze(result.rows.map(grant));
    },
  });
}
