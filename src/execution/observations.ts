import { asLiveMicros, parseAtomicAmount } from "@/core/live-money";

import type { ExecutionCostObservation } from "./types";

const SHA256_HEX = /^[a-f0-9]{64}$/;

function hash(value: string, label: string): string {
  if (!SHA256_HEX.test(value)) throw new Error(`${label} must be lowercase SHA-256 hex`);
  return value;
}

function identifier(value: string, label: string): string {
  if (value.trim().length === 0 || value.length > 256) {
    throw new Error(`${label} must be a bounded nonempty identifier`);
  }
  return value;
}

/** Validates cost arithmetic and provenance before accounting can consume it. */
export function createExecutionCostObservation(
  input: ExecutionCostObservation,
): ExecutionCostObservation {
  if (input.kind === "unknown") {
    return Object.freeze({
      kind: "unknown",
      heldReservedCostMicros: asLiveMicros(input.heldReservedCostMicros),
      evidenceHash:
        input.evidenceHash === null
          ? null
          : hash(input.evidenceHash, "Unknown-cost evidence hash"),
    });
  }

  const networkCostMicros = asLiveMicros(input.networkCostMicros);
  const setupCostMicros = asLiveMicros(input.setupCostMicros);
  const totalCostMicros = asLiveMicros(input.totalCostMicros);
  const sum = BigInt(networkCostMicros) + BigInt(setupCostMicros);
  if (sum !== BigInt(totalCostMicros)) {
    throw new Error("Total execution cost must equal the network and setup cost sum");
  }
  const finalityRevision = identifier(input.finalityRevision, "Finality revision");
  const evidenceHash = hash(input.evidenceHash, "Execution-cost evidence hash");

  if (totalCostMicros > 0) {
    if (
      input.chargedAssetId === null ||
      input.chargedAtomic === null ||
      input.valuationPolicyVersion === null ||
      input.receiptId === null
    ) {
      throw new Error("A positive execution cost requires complete charge provenance");
    }
    return Object.freeze({
      kind: "final",
      networkCostMicros,
      setupCostMicros,
      totalCostMicros,
      chargedAssetId: identifier(input.chargedAssetId, "Charged asset ID"),
      chargedAtomic: parseAtomicAmount(input.chargedAtomic),
      valuationPolicyVersion: identifier(
        input.valuationPolicyVersion,
        "Valuation policy version",
      ),
      receiptId: identifier(input.receiptId, "Receipt ID"),
      finalityRevision,
      evidenceHash,
    });
  }

  if (
    input.chargedAssetId !== null ||
    input.chargedAtomic !== null ||
    input.valuationPolicyVersion !== null
  ) {
    throw new Error("A proven zero cost cannot claim a charged asset");
  }
  return Object.freeze({
    kind: "final",
    networkCostMicros,
    setupCostMicros,
    totalCostMicros,
    chargedAssetId: null,
    chargedAtomic: null,
    valuationPolicyVersion: null,
    receiptId:
      input.receiptId === null ? null : identifier(input.receiptId, "Receipt ID"),
    finalityRevision,
    evidenceHash,
  });
}
