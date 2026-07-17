import type { Micros } from "./money";
import { sha256Canonical } from "./canonical-json";

export type AtomicAmount = `${bigint}`;

export interface ExactShares {
  readonly numerator: AtomicAmount;
  readonly denominator: AtomicAmount;
}

export interface ExactRatio {
  readonly numerator: AtomicAmount;
  readonly denominator: AtomicAmount;
}

export interface VenueQuantity {
  readonly atomic: AtomicAmount;
  readonly scale: number;
  readonly exactShares: ExactShares;
  readonly conversionEvidenceHash: string;
}

function parseAtomic(value: string, label: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    throw new Error(`${label} must be a canonical nonnegative atomic integer`);
  }
  return BigInt(value);
}

function assertScale(scale: number): void {
  if (!Number.isSafeInteger(scale) || scale < 0 || scale > 30) {
    throw new Error("Venue quantity scale must be an integer from 0 through 30");
  }
}

function greatestCommonDivisor(left: bigint, right: bigint): bigint {
  let a = left;
  let b = right;
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a;
}

export function asLiveMicros(value: number): Micros {
  if (!Number.isSafeInteger(value)) {
    throw new Error("Live microdollars must be a safe integer");
  }
  if (value < 0) throw new Error("Live microdollars must be nonnegative");
  return value;
}

/** Parse a nonnegative USD decimal into exact integer microdollars. */
export function parseUsdMicros(value: string): Micros {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(value);
  if (!match) {
    throw new Error("USD value must be a canonical nonnegative decimal with at most 6 places");
  }

  const whole = BigInt(match[1]);
  const fractional = BigInt((match[2] ?? "").padEnd(6, "0"));
  return microsFromBigInt(whole * 1_000_000n + fractional);
}

/** Format exact integer microdollars with all six decimal places. */
export function formatUsdMicros(value: Micros): string {
  const micros = BigInt(asLiveMicros(value));
  const whole = micros / 1_000_000n;
  const fractional = (micros % 1_000_000n).toString().padStart(6, "0");
  return `${whole}.${fractional}`;
}

/** Normalize an unsigned decimal atomic amount. Zero must be opted into explicitly. */
export function parseAtomicAmount(
  value: string,
  options: { readonly allowZero?: boolean } = {},
): AtomicAmount {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error("Atomic amount must contain decimal digits only");
  }
  const parsed = BigInt(value);
  if (parsed === 0n && options.allowZero !== true) {
    throw new Error("Atomic amount must be positive unless zero is explicitly allowed");
  }
  return parsed.toString() as AtomicAmount;
}

export function addAtomic(left: AtomicAmount, right: AtomicAmount): AtomicAmount {
  return (parseAtomic(left, "Left atomic amount") + parseAtomic(right, "Right atomic amount"))
    .toString() as AtomicAmount;
}

export function compareAtomic(left: AtomicAmount, right: AtomicAmount): -1 | 0 | 1 {
  const a = parseAtomic(left, "Left atomic amount");
  const b = parseAtomic(right, "Right atomic amount");
  return a < b ? -1 : a > b ? 1 : 0;
}

export function microsFromBigInt(value: bigint): Micros {
  if (value < 0n) throw new Error("Microdollars must be nonnegative");
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Microdollars exceed the safe integer range");
  }
  return Number(value);
}

export function createExactShares(
  numeratorValue: string,
  denominatorValue: string,
): ExactShares {
  const numerator = parseAtomic(numeratorValue, "Share numerator");
  const denominator = parseAtomic(denominatorValue, "Share denominator");
  if (numerator <= 0n) throw new Error("Share numerator must be positive");
  if (denominator <= 0n) throw new Error("Share denominator must be positive");

  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({
    numerator: (numerator / divisor).toString() as AtomicAmount,
    denominator: (denominator / divisor).toString() as AtomicAmount,
  });
}

export function reduceShares(numerator: string, denominator: string): ExactShares {
  // Let the ratio constructor provide numerator/denominator-specific zero errors.
  const normalizedNumerator = parseAtomicAmount(numerator, { allowZero: true });
  const normalizedDenominator = parseAtomicAmount(denominator, { allowZero: true });
  return createExactShares(normalizedNumerator, normalizedDenominator);
}

export function compareShares(left: ExactShares, right: ExactShares): -1 | 0 | 1 {
  const normalizedLeft = createExactShares(left.numerator, left.denominator);
  const normalizedRight = createExactShares(right.numerator, right.denominator);
  const difference =
    BigInt(normalizedLeft.numerator) * BigInt(normalizedRight.denominator) -
    BigInt(normalizedRight.numerator) * BigInt(normalizedLeft.denominator);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function equalExactShares(left: ExactShares, right: ExactShares): boolean {
  const leftNumerator = parseAtomic(left.numerator, "Left share numerator");
  const leftDenominator = parseAtomic(left.denominator, "Left share denominator");
  const rightNumerator = parseAtomic(right.numerator, "Right share numerator");
  const rightDenominator = parseAtomic(right.denominator, "Right share denominator");
  if (leftDenominator === 0n || rightDenominator === 0n) return false;
  return leftNumerator * rightDenominator === rightNumerator * leftDenominator;
}

export function createVenueQuantity(
  atomicValue: string,
  scale: number,
  conversionEvidenceHash: string,
): VenueQuantity {
  const atomic = parseAtomic(atomicValue, "Venue quantity");
  if (atomic <= 0n) throw new Error("Venue quantity must be positive");
  assertScale(scale);
  if (!/^[a-f0-9]{64}$/.test(conversionEvidenceHash)) {
    throw new Error("Conversion evidence hash must be lowercase SHA-256 hex");
  }

  return Object.freeze({
    atomic: atomic.toString() as AtomicAmount,
    scale,
    exactShares: createExactShares(atomic.toString(), (10n ** BigInt(scale)).toString()),
    conversionEvidenceHash,
  });
}

/** Construct a quantity whose evidence hash binds the exact atomic-to-share conversion. */
export function venueQuantity(atomicValue: string, scale: number): VenueQuantity {
  assertScale(scale);
  const atomic = parseAtomicAmount(atomicValue);
  const exactShares = createExactShares(atomic, (10n ** BigInt(scale)).toString());
  const conversionEvidenceHash = sha256Canonical({
    schemaVersion: "venue-quantity-conversion-v1",
    atomic,
    scale,
    exactShares: {
      numerator: exactShares.numerator,
      denominator: exactShares.denominator,
    },
  });
  return Object.freeze({ atomic, scale, exactShares, conversionEvidenceHash });
}

/** Convert atomics between decimal scales, refusing any lossy down-scaling. */
export function convertAtomicScale(
  atomicValue: AtomicAmount,
  fromScale: number,
  toScale: number,
): AtomicAmount {
  assertScale(fromScale);
  assertScale(toScale);
  const atomic = parseAtomic(atomicValue, "Atomic amount");
  if (fromScale === toScale) return atomicValue;

  const difference = Math.abs(toScale - fromScale);
  const factor = 10n ** BigInt(difference);
  if (toScale > fromScale) return (atomic * factor).toString() as AtomicAmount;
  if (atomic % factor !== 0n) {
    throw new Error("Atomic amount is not exactly divisible at the target scale");
  }
  return (atomic / factor).toString() as AtomicAmount;
}

export function equalAtomicAcrossScales(
  leftAtomic: AtomicAmount,
  leftScale: number,
  rightAtomic: AtomicAmount,
  rightScale: number,
): boolean {
  assertScale(leftScale);
  assertScale(rightScale);
  const left = parseAtomic(leftAtomic, "Left atomic amount");
  const right = parseAtomic(rightAtomic, "Right atomic amount");
  return left * 10n ** BigInt(rightScale) === right * 10n ** BigInt(leftScale);
}

/** Multiply a microdollar ratio by shares and conservatively round upward. */
export function ceilRatioProductMicros(ratio: ExactRatio, shares: ExactShares): Micros {
  const ratioNumerator = parseAtomic(ratio.numerator, "Ratio numerator");
  const ratioDenominator = parseAtomic(ratio.denominator, "Ratio denominator");
  if (ratioDenominator <= 0n) throw new Error("Ratio denominator must be positive");
  const normalizedShares = createExactShares(shares.numerator, shares.denominator);
  const numerator = ratioNumerator * BigInt(normalizedShares.numerator);
  const denominator = ratioDenominator * BigInt(normalizedShares.denominator);
  return microsFromBigInt((numerator + denominator - 1n) / denominator);
}

/** Perform a full bigint multiply/divide before proving the result is a safe Micros. */
export function mulDivFloorMicros(
  value: Micros,
  numerator: number,
  denominator: number,
): Micros {
  const micros = asLiveMicros(value);
  if (!Number.isSafeInteger(numerator) || numerator < 0) {
    throw new Error("Multiplier numerator must be a nonnegative safe integer");
  }
  if (!Number.isSafeInteger(denominator) || denominator <= 0) {
    throw new Error("Multiplier denominator must be a positive safe integer");
  }
  return microsFromBigInt(
    (BigInt(micros) * BigInt(numerator)) / BigInt(denominator),
  );
}
