import {
  asLiveMicros,
  createExactShares,
  equalExactShares,
  venueQuantity,
  type VenueQuantity,
} from "@/core/live-money";

import type { LiveAcquisitionPath, LiveOrderIntent } from "./types";

const SHA256_HEX = /^[a-f0-9]{64}$/;

function identifier(value: string, label: string): string {
  if (value.trim().length === 0 || value.length > 256) {
    throw new Error(`${label} must be a bounded nonempty identifier`);
  }
  return value;
}

function positiveVersion(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}

function evidenceHash(value: string, label: string): string {
  if (!SHA256_HEX.test(value)) throw new Error(`${label} must be lowercase SHA-256 hex`);
  return value;
}

function exactQuantity(value: VenueQuantity, label: string): VenueQuantity {
  const canonical = venueQuantity(value.atomic, value.scale);
  if (
    value.conversionEvidenceHash !== canonical.conversionEvidenceHash ||
    !equalExactShares(value.exactShares, canonical.exactShares)
  ) {
    throw new Error(`${label} has invalid exact conversion evidence`);
  }
  return canonical;
}

function acquisitionPath(
  path: LiveAcquisitionPath,
  desiredOutcome: "YES" | "NO",
): LiveAcquisitionPath {
  if (path.kind === "direct-buy") {
    if (path.orderSide !== "BUY" || path.orderOutcome !== desiredOutcome) {
      throw new Error("Direct buy must buy the desired outcome");
    }
    return Object.freeze({ ...path });
  }

  const complement = desiredOutcome === "YES" ? "NO" : "YES";
  if (path.orderSide !== "SELL" || path.orderOutcome !== complement) {
    throw new Error("Complete-set acquisition must sell the complement outcome");
  }
  return Object.freeze({
    ...path,
    inventoryLotId: identifier(path.inventoryLotId, "Inventory lot ID"),
    inventoryLotVersion: positiveVersion(
      path.inventoryLotVersion,
      "Inventory lot version",
    ),
    inventoryReservationFence: positiveVersion(
      path.inventoryReservationFence,
      "Inventory reservation fence",
    ),
    inventoryEvidenceHash: evidenceHash(
      path.inventoryEvidenceHash,
      "Inventory evidence hash",
    ),
  });
}

/** Canonicalizes and freezes the immutable business authorization for one live leg. */
export function createLiveOrderIntent(input: LiveOrderIntent): LiveOrderIntent {
  if (input.desiredOutcome !== "YES" && input.desiredOutcome !== "NO") {
    throw new Error("Desired outcome must be YES or NO");
  }
  const exactNetShares = createExactShares(
    input.exactNetShares.numerator,
    input.exactNetShares.denominator,
  );
  const grossVenueQuantity = exactQuantity(
    input.grossVenueQuantity,
    "Gross venue quantity",
  );
  const minimumNetVenueQuantity = exactQuantity(
    input.minimumNetVenueQuantity,
    "Minimum net venue quantity",
  );
  const maximumNetVenueQuantity = exactQuantity(
    input.maximumNetVenueQuantity,
    "Maximum net venue quantity",
  );
  if (
    !equalExactShares(minimumNetVenueQuantity.exactShares, exactNetShares) ||
    !equalExactShares(maximumNetVenueQuantity.exactShares, exactNetShares)
  ) {
    throw new Error("Live net outcome bounds must both equal the canonical hedge quantity");
  }
  const limitPriceMicros = asLiveMicros(input.limitPriceMicros);
  if (limitPriceMicros > 1_000_000) {
    throw new Error("Limit price cannot exceed one dollar");
  }
  const maxSpendMicros = asLiveMicros(input.maxSpendMicros);
  if (!Number.isSafeInteger(input.expiresAt) || input.expiresAt <= 0) {
    throw new Error("Order intent expiry must be a positive safe integer timestamp");
  }

  return Object.freeze({
    contractVersionId: identifier(input.contractVersionId, "Contract version ID"),
    settlementSpecVersionId: identifier(
      input.settlementSpecVersionId,
      "Settlement specification version ID",
    ),
    desiredOutcome: input.desiredOutcome,
    acquisitionPath: acquisitionPath(input.acquisitionPath, input.desiredOutcome),
    exactNetShares: Object.freeze(exactNetShares),
    grossVenueQuantity,
    minimumNetVenueQuantity,
    maximumNetVenueQuantity,
    netOutcomeBoundsHash: evidenceHash(
      input.netOutcomeBoundsHash,
      "Net outcome bounds hash",
    ),
    feeScheduleVersion: identifier(input.feeScheduleVersion, "Fee schedule version"),
    limitPriceMicros,
    maxSpendMicros,
    expiresAt: input.expiresAt,
  });
}
