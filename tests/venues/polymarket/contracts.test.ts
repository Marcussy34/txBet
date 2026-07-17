import { describe, expect, it } from "vitest";

import {
  POLYMARKET_CHAIN_ID,
  POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS,
  POLYMARKET_CTF_ADDRESS,
  POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
  POLYMARKET_PUSD_ADDRESS,
  POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
  PolymarketContractValidationError,
  selectPolymarketExchange,
  validatePolymarketContractConfig,
  type PolymarketContractConfigInput,
} from "@/venues/polymarket/contracts";

const NOW_MS = Date.parse("2026-07-17T10:00:00.000Z");

function validInput(
  overrides: Partial<PolymarketContractConfigInput> = {},
): PolymarketContractConfigInput {
  return {
    chainId: POLYMARKET_CHAIN_ID,
    collateralAddress: POLYMARKET_PUSD_ADDRESS,
    collateralDecimals: 6,
    conditionalTokensAddress: POLYMARKET_CTF_ADDRESS,
    exchangeAllowlist: [
      POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
      POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
    ],
    reviewedAtMs: NOW_MS - 1_000,
    ...overrides,
  };
}

function expectContractError(
  run: () => unknown,
  code: PolymarketContractValidationError["code"],
): void {
  try {
    run();
    throw new Error("Expected Polymarket contract validation to fail");
  } catch (error) {
    expect(error).toBeInstanceOf(PolymarketContractValidationError);
    expect(error).toMatchObject({ code });
  }
}

describe("Polymarket contract baseline", () => {
  it("accepts only the current checksummed Polygon pUSD, CTF, and exchange set", () => {
    const contracts = validatePolymarketContractConfig(validInput(), NOW_MS);

    expect(contracts).toEqual({
      chainId: 137,
      collateralAddress: POLYMARKET_PUSD_ADDRESS,
      collateralDecimals: 6,
      conditionalTokensAddress: POLYMARKET_CTF_ADDRESS,
      standardExchangeAddress: POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
      negRiskExchangeAddress: POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
      exchangeAllowlist: [
        POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
        POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
      ],
      reviewedAtMs: NOW_MS - 1_000,
    });
    expect(Object.isFrozen(contracts)).toBe(true);
    expect(Object.isFrozen(contracts.exchangeAllowlist)).toBe(true);
    expect(selectPolymarketExchange(contracts, false)).toBe(
      POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
    );
    expect(selectPolymarketExchange(contracts, true)).toBe(
      POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
    );
  });

  it.each([
    ["wrong chain", { chainId: 1 }, "WRONG_CHAIN"],
    [
      "wrong pUSD proxy",
      { collateralAddress: "0x1111111111111111111111111111111111111111" },
      "WRONG_COLLATERAL",
    ],
    ["wrong collateral decimals", { collateralDecimals: 18 }, "WRONG_COLLATERAL"],
    [
      "wrong CTF proxy",
      { conditionalTokensAddress: "0x2222222222222222222222222222222222222222" },
      "WRONG_CTF",
    ],
    [
      "missing standard exchange",
      { exchangeAllowlist: [POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS] },
      "WRONG_EXCHANGE_ALLOWLIST",
    ],
    [
      "missing neg-risk exchange",
      { exchangeAllowlist: [POLYMARKET_STANDARD_EXCHANGE_ADDRESS] },
      "WRONG_EXCHANGE_ALLOWLIST",
    ],
    [
      "attacker exchange",
      {
        exchangeAllowlist: [
          POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
          "0x3333333333333333333333333333333333333333",
        ],
      },
      "WRONG_EXCHANGE_ALLOWLIST",
    ],
    [
      "duplicate exchange",
      {
        exchangeAllowlist: [
          POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
          POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
        ],
      },
      "WRONG_EXCHANGE_ALLOWLIST",
    ],
    [
      "non-checksummed exchange",
      {
        exchangeAllowlist: [
          POLYMARKET_STANDARD_EXCHANGE_ADDRESS.toLowerCase(),
          POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
        ],
      },
      "WRONG_EXCHANGE_ALLOWLIST",
    ],
  ] as const)("rejects %s", (_label, overrides, code) => {
    expectContractError(
      () => validatePolymarketContractConfig(validInput(overrides), NOW_MS),
      code,
    );
  });

  it("rejects stale and future-dated contract reviews", () => {
    expectContractError(
      () =>
        validatePolymarketContractConfig(
          validInput({
            reviewedAtMs: NOW_MS - POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS - 1,
          }),
          NOW_MS,
        ),
      "STALE_CONTRACT_CONFIG",
    );
    expectContractError(
      () =>
        validatePolymarketContractConfig(
          validInput({ reviewedAtMs: NOW_MS + 1 }),
          NOW_MS,
        ),
      "INVALID_REVIEW_TIME",
    );
  });
});
