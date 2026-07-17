import type { LiveVenueId } from "@/contracts/venues";

import {
  worldCupStrategyInputSchema,
  type WorldCupStrategyInput,
} from "./schema";

export interface WorldCupStrategyRecord {
  readonly profileId: string;
  readonly version: number;
  readonly enabled: boolean;
  readonly venueIds: readonly LiveVenueId[];
  readonly marketScope: "all-verified-world-cup";
  readonly riskLimitsVersion: number;
}

export interface StrategyVenueReadiness {
  readonly venueId: LiveVenueId;
  readonly certified: boolean;
  readonly accountReady: boolean;
  readonly policyCurrent: boolean;
}

export interface StrategyActivationSnapshot {
  readonly currentRiskLimitsVersion: number;
  readonly nowMs: number;
  readonly grant: Readonly<{
    active: boolean;
    expiresAt: number;
    riskLimitsVersion: number;
    venueIds: readonly LiveVenueId[];
  }>;
  readonly venues: readonly StrategyVenueReadiness[];
}

export interface WorldCupStrategyRepository {
  loadActivationSnapshot(profileId: string): Promise<StrategyActivationSnapshot>;
  compareAndSet(
    profileId: string,
    input: WorldCupStrategyInput,
  ): Promise<WorldCupStrategyRecord | null>;
}

export class StrategyConflictError extends Error {
  override readonly name = "StrategyConflictError";

  constructor() {
    super("Strategy changed; reload the current version before updating");
  }
}

function assertActivationReady(
  input: WorldCupStrategyInput,
  snapshot: StrategyActivationSnapshot,
): void {
  const selectedVenues = new Set(input.venueIds);
  if (selectedVenues.size < 2 || selectedVenues.size !== input.venueIds.length) {
    throw new Error("An enabled strategy requires at least two distinct venues");
  }
  if (snapshot.currentRiskLimitsVersion !== input.riskLimitsVersion) {
    throw new Error("Strategy risk settings are stale");
  }
  if (
    !snapshot.grant.active ||
    snapshot.grant.expiresAt <= snapshot.nowMs ||
    snapshot.grant.riskLimitsVersion !== input.riskLimitsVersion
  ) {
    throw new Error("Strategy automation grant is not current and active");
  }
  const grantedVenues = new Set(snapshot.grant.venueIds);
  const readiness = new Map<LiveVenueId, StrategyVenueReadiness>();
  for (const venue of snapshot.venues) {
    if (readiness.has(venue.venueId)) {
      throw new Error("Strategy venue readiness evidence is ambiguous");
    }
    readiness.set(venue.venueId, venue);
  }

  for (const venueId of selectedVenues) {
    const venue = readiness.get(venueId);
    if (!grantedVenues.has(venueId)) {
      throw new Error(`Automation grant does not cover venue ${venueId}`);
    }
    if (
      venue === undefined ||
      !venue.certified ||
      !venue.accountReady ||
      !venue.policyCurrent
    ) {
      throw new Error(`Venue ${venueId} is not certified and ready`);
    }
  }
}

export function createWorldCupStrategyService(
  repository: WorldCupStrategyRepository,
) {
  return Object.freeze({
    async update(profileId: string, value: unknown): Promise<WorldCupStrategyRecord> {
      if (profileId.trim().length === 0) throw new Error("Profile ID is required");
      const parsed = worldCupStrategyInputSchema.parse(value);
      const input = Object.freeze({
        ...parsed,
        venueIds: Object.freeze([...parsed.venueIds]),
      });

      // Deactivation cannot be held hostage by an unavailable venue dependency.
      if (input.enabled) {
        assertActivationReady(
          input,
          await repository.loadActivationSnapshot(profileId),
        );
      }
      const updated = await repository.compareAndSet(profileId, input);
      if (updated === null) throw new StrategyConflictError();
      return updated;
    },
  });
}
