import { z } from "zod";

import { parseRiskLimits, type RiskLimits } from "./policy";
import { riskLimitsInputSchema } from "./schema";

export interface RiskSettingsRecord {
  readonly profileId: string;
  readonly version: number;
  readonly limits: RiskLimits;
}

export interface RiskSettingsRepository {
  get(profileId: string): Promise<RiskSettingsRecord | null>;
  compareAndSet(
    profileId: string,
    expectedVersion: number,
    limits: RiskLimits,
  ): Promise<RiskSettingsRecord | null>;
}

const updateSchema = z.strictObject({
  expectedVersion: z.number().int().nonnegative().safe(),
  limits: riskLimitsInputSchema,
});

export class RiskSettingsConflictError extends Error {
  override readonly name = "RiskSettingsConflictError";

  constructor() {
    super("Risk settings changed; reload the current version before updating");
  }
}

export function createRiskSettingsService(repository: RiskSettingsRepository) {
  return Object.freeze({
    get(profileId: string): Promise<RiskSettingsRecord | null> {
      if (profileId.trim().length === 0) throw new Error("Profile ID is required");
      return repository.get(profileId);
    },

    async update(profileId: string, value: unknown): Promise<RiskSettingsRecord> {
      if (profileId.trim().length === 0) throw new Error("Profile ID is required");
      const parsed = updateSchema.parse(value);
      const limits = parseRiskLimits(parsed.limits);
      const updated = await repository.compareAndSet(
        profileId,
        parsed.expectedVersion,
        limits,
      );
      if (updated === null) throw new RiskSettingsConflictError();
      return updated;
    },
  });
}
