import { getAddress } from "viem";

export const POLYMARKET_CHAIN_ID = 137 as const;
export const POLYMARKET_PUSD_ADDRESS =
  "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB" as const;
export const POLYMARKET_CTF_ADDRESS =
  "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045" as const;
export const POLYMARKET_STANDARD_EXCHANGE_ADDRESS =
  "0xE111180000d2663C0091e4f400237545B87B996B" as const;
export const POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS =
  "0xe2222d279d744050d28e00520010520000310F59" as const;

// Contract authority must be refreshed before live readiness can remain true.
export const POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS = 24 * 60 * 60 * 1_000;

export type PolymarketEvmAddress = `0x${string}`;

export interface PolymarketContractConfigInput {
  readonly chainId: unknown;
  readonly collateralAddress: unknown;
  readonly collateralDecimals: unknown;
  readonly conditionalTokensAddress: unknown;
  readonly exchangeAllowlist: readonly unknown[];
  readonly reviewedAtMs: unknown;
}

export interface PolymarketContracts {
  readonly chainId: typeof POLYMARKET_CHAIN_ID;
  readonly collateralAddress: typeof POLYMARKET_PUSD_ADDRESS;
  readonly collateralDecimals: 6;
  readonly conditionalTokensAddress: typeof POLYMARKET_CTF_ADDRESS;
  readonly standardExchangeAddress: typeof POLYMARKET_STANDARD_EXCHANGE_ADDRESS;
  readonly negRiskExchangeAddress: typeof POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS;
  readonly exchangeAllowlist: readonly [
    typeof POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
    typeof POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
  ];
  readonly reviewedAtMs: number;
}

export type PolymarketContractValidationCode =
  | "WRONG_CHAIN"
  | "WRONG_COLLATERAL"
  | "WRONG_CTF"
  | "WRONG_EXCHANGE_ALLOWLIST"
  | "INVALID_REVIEW_TIME"
  | "STALE_CONTRACT_CONFIG";

export class PolymarketContractValidationError extends Error {
  readonly code: PolymarketContractValidationCode;

  constructor(code: PolymarketContractValidationCode, message: string) {
    super(message);
    this.name = "PolymarketContractValidationError";
    this.code = code;
  }
}

function isSafeTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isExactChecksummedAddress(value: unknown, expected: string): boolean {
  if (typeof value !== "string" || value !== expected) return false;
  try {
    return getAddress(value) === value;
  } catch {
    return false;
  }
}

function hasExactExchangeAllowlist(value: readonly unknown[]): boolean {
  if (value.length !== 2) return false;
  if (!value.every((address) => typeof address === "string")) return false;
  const entries = new Set(value);
  return (
    entries.size === 2 &&
    isExactChecksummedAddress(
      POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
      POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
    ) &&
    isExactChecksummedAddress(
      POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
      POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
    ) &&
    entries.has(POLYMARKET_STANDARD_EXCHANGE_ADDRESS) &&
    entries.has(POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS)
  );
}

/**
 * Re-validates runtime configuration against the reviewed official baseline.
 * Unknown or stale configuration never falls back to an SDK default.
 */
export function validatePolymarketContractConfig(
  input: PolymarketContractConfigInput,
  nowMs: number,
): PolymarketContracts {
  if (input.chainId !== POLYMARKET_CHAIN_ID) {
    throw new PolymarketContractValidationError(
      "WRONG_CHAIN",
      "Polymarket execution requires Polygon chain ID 137",
    );
  }
  if (
    !isExactChecksummedAddress(input.collateralAddress, POLYMARKET_PUSD_ADDRESS) ||
    input.collateralDecimals !== 6
  ) {
    throw new PolymarketContractValidationError(
      "WRONG_COLLATERAL",
      "Polymarket collateral must be the current six-decimal pUSD proxy",
    );
  }
  if (!isExactChecksummedAddress(input.conditionalTokensAddress, POLYMARKET_CTF_ADDRESS)) {
    throw new PolymarketContractValidationError(
      "WRONG_CTF",
      "Polymarket outcome tokens must use the current CTF contract",
    );
  }
  if (!Array.isArray(input.exchangeAllowlist) || !hasExactExchangeAllowlist(input.exchangeAllowlist)) {
    throw new PolymarketContractValidationError(
      "WRONG_EXCHANGE_ALLOWLIST",
      "Polymarket exchange allowlist must contain only the current standard and neg-risk exchanges",
    );
  }
  if (
    !isSafeTimestamp(nowMs) ||
    !isSafeTimestamp(input.reviewedAtMs) ||
    input.reviewedAtMs > nowMs
  ) {
    throw new PolymarketContractValidationError(
      "INVALID_REVIEW_TIME",
      "Polymarket contract review time must be a non-future millisecond timestamp",
    );
  }
  if (nowMs - input.reviewedAtMs > POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS) {
    throw new PolymarketContractValidationError(
      "STALE_CONTRACT_CONFIG",
      "Polymarket contract configuration is stale",
    );
  }

  const exchangeAllowlist = Object.freeze([
    POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
    POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
  ] as const);
  return Object.freeze({
    chainId: POLYMARKET_CHAIN_ID,
    collateralAddress: POLYMARKET_PUSD_ADDRESS,
    collateralDecimals: 6 as const,
    conditionalTokensAddress: POLYMARKET_CTF_ADDRESS,
    standardExchangeAddress: POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
    negRiskExchangeAddress: POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
    exchangeAllowlist,
    reviewedAtMs: input.reviewedAtMs,
  });
}

export function selectPolymarketExchange(
  contracts: PolymarketContracts,
  negRisk: boolean,
): typeof POLYMARKET_STANDARD_EXCHANGE_ADDRESS | typeof POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS {
  if (
    contracts.standardExchangeAddress !== POLYMARKET_STANDARD_EXCHANGE_ADDRESS ||
    contracts.negRiskExchangeAddress !== POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS
  ) {
    throw new PolymarketContractValidationError(
      "WRONG_EXCHANGE_ALLOWLIST",
      "Polymarket runtime exchange bindings do not match the reviewed baseline",
    );
  }
  return negRisk
    ? POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS
    : POLYMARKET_STANDARD_EXCHANGE_ADDRESS;
}
