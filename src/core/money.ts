export type Micros = number;

export const USD_MICROS = 1_000_000;

function assertMicros(value: number, label: string): Micros {
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer number of microdollars`);
  }
  return value;
}

export function dollarsToMicros(dollars: number): Micros {
  if (!Number.isFinite(dollars)) throw new Error("Dollar value must be finite");
  return assertMicros(Math.round(dollars * USD_MICROS), "Dollar value");
}

export function centsToMicros(cents: number): Micros {
  if (!Number.isFinite(cents)) throw new Error("Cent value must be finite");
  return assertMicros(Math.round(cents * 10_000), "Cent value");
}

export function formatUsd(micros: Micros, digits = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(micros / USD_MICROS);
}

export function formatPrice(micros: Micros): string {
  return `$${(micros / USD_MICROS).toFixed(2)}`;
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}
