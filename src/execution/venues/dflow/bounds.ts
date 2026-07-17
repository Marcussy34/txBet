const CANONICAL_ATOMIC = /^(0|[1-9][0-9]*)$/;

function parseCanonicalAtomic(value: string, label: string): bigint {
  if (!CANONICAL_ATOMIC.test(value)) {
    throw new Error(`${label} must be a canonical nonnegative atomic integer`);
  }
  return BigInt(value);
}

/** Returns the parsed amount only after enforcing the configured hard ceiling. */
export function assertAtomicAtMost(
  actual: string,
  maximum: string,
  label: string,
): bigint {
  const parsedActual = parseCanonicalAtomic(actual, label);
  const parsedMaximum = parseCanonicalAtomic(maximum, `${label} maximum`);
  if (parsedActual > parsedMaximum) {
    throw new Error(`${label} exceeds its configured maximum`);
  }
  return parsedActual;
}

/** The last valid height is inclusive; any later height is expired. */
export function assertFreshBlockHeight(
  currentBlockHeight: number,
  lastValidBlockHeight: number,
): void {
  for (const [label, value] of [
    ["Current block height", currentBlockHeight],
    ["Last valid block height", lastValidBlockHeight],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a safe nonnegative integer`);
    }
  }
  if (currentBlockHeight > lastValidBlockHeight) {
    throw new Error("Sanitized DFlow fixture blockhash is expired");
  }
}
