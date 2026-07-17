import { describe, expect, it, vi } from "vitest";

import {
  MAX_UINT256,
  assessPolymarketAllowanceReadiness,
  validatePolymarketApprovalPlan,
  type PolymarketAllowanceReader,
  type PolymarketAllowanceRequirement,
  type PolymarketApprovalAction,
} from "@/venues/polymarket/allowances";
import {
  POLYMARKET_CHAIN_ID,
  POLYMARKET_CTF_ADDRESS,
  POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
  POLYMARKET_PUSD_ADDRESS,
  POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
  validatePolymarketContractConfig,
} from "@/venues/polymarket/contracts";

const NOW_MS = Date.parse("2026-07-17T10:00:00.000Z");
const OWNER = "0x1111111111111111111111111111111111111111";
const CONDITION_ID = `0x${"22".repeat(32)}`;
const OUTCOME_TOKEN_ID = "123456789012345678901234567890";
const BLOCK_HASH = `0x${"33".repeat(32)}`;

const contracts = validatePolymarketContractConfig(
  {
    chainId: POLYMARKET_CHAIN_ID,
    collateralAddress: POLYMARKET_PUSD_ADDRESS,
    collateralDecimals: 6,
    conditionalTokensAddress: POLYMARKET_CTF_ADDRESS,
    exchangeAllowlist: [
      POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
      POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
    ],
    reviewedAtMs: NOW_MS - 1_000,
  },
  NOW_MS,
);

function requirement(
  overrides: Partial<PolymarketAllowanceRequirement> = {},
): PolymarketAllowanceRequirement {
  return {
    depositWalletAddress: OWNER,
    negRisk: false,
    armedStrategyBudgetAtomic: 10_000_000n,
    allowanceBufferAtomic: 500_000n,
    maxAuthorizedCollateralAtomic: 11_000_000n,
    requiredOutcomeTokenAtomic: 0n,
    conditionId: null,
    outcomeTokenId: null,
    gasFunding: { kind: "relayer-sponsored" },
    ...overrides,
  };
}

function reader(options: {
  chainId?: unknown;
  observedAtMs?: unknown;
  collateralAllowance?: unknown;
  outcomeApproved?: unknown;
  nativeBalance?: unknown;
  fail?: "block" | "collateral" | "outcome" | "gas";
} = {}): PolymarketAllowanceReader {
  return {
    getFinalizedBlock: vi.fn(async () => {
      if (options.fail === "block") throw new Error("rpc unavailable");
      return {
        chainId: options.chainId ?? 137,
        blockNumber: 1_234_567n,
        blockHash: BLOCK_HASH,
        observedAtMs: options.observedAtMs ?? NOW_MS - 1_000,
      };
    }),
    readCollateralAllowance: vi.fn(async () => {
      if (options.fail === "collateral") throw new Error("eth_call failed");
      return options.collateralAllowance ?? 0n;
    }),
    readOutcomeApprovalForAll: vi.fn(async () => {
      if (options.fail === "outcome") throw new Error("eth_call failed");
      return options.outcomeApproved ?? false;
    }),
    readNativeBalance: vi.fn(async () => {
      if (options.fail === "gas") throw new Error("eth_getBalance failed");
      return options.nativeBalance ?? 0n;
    }),
  };
}

describe("Polymarket allowance verification and planning", () => {
  it("quarantines any request that would create operator-wide CTF authority", async () => {
    const reads = reader();

    await expect(
      assessPolymarketAllowanceReadiness({
        contracts,
        requirement: requirement({
          requiredOutcomeTokenAtomic: 4_000_000n,
          conditionId: CONDITION_ID,
          outcomeTokenId: OUTCOME_TOKEN_ID,
        }),
        reader: reads,
        nowMs: NOW_MS,
      }),
    ).resolves.toEqual({
      status: "blocked",
      reason: "OPERATOR_WIDE_CTF_APPROVAL_FORBIDDEN",
    });
    expect(reads.getFinalizedBlock).not.toHaveBeenCalled();
  });

  it("plans only exact bounded pUSD for the standard exchange", async () => {
    const reads = reader();
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement(),
      reader: reads,
      nowMs: NOW_MS,
    });

    expect(result).toMatchObject({
      status: "approval_required",
      blockNumber: 1_234_567n,
      collateralTargetAtomic: 10_500_000n,
    });
    if (result.status !== "approval_required") throw new Error("Expected a plan");
    expect(result.actions).toEqual([
      {
        kind: "prepareErc20Approval",
        sdkMethod: "prepareErc20Approval",
        chainId: 137,
        ownerAddress: OWNER,
        tokenAddress: POLYMARKET_PUSD_ADDRESS,
        spenderAddress: POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
        amountAtomic: 10_500_000n,
      },
    ]);
    expect(reads.readCollateralAllowance).toHaveBeenCalledWith({
      chainId: 137,
      blockNumber: 1_234_567n,
      blockHash: BLOCK_HASH,
      ownerAddress: OWNER,
      tokenAddress: POLYMARKET_PUSD_ADDRESS,
      spenderAddress: POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
    });
    expect(reads.readOutcomeApprovalForAll).toHaveBeenCalledWith({
      chainId: 137,
      blockNumber: 1_234_567n,
      blockHash: BLOCK_HASH,
      ownerAddress: OWNER,
      tokenAddress: POLYMARKET_CTF_ADDRESS,
      operatorAddress: POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
    });
    expect(JSON.stringify(result, (_key, value) =>
      typeof value === "bigint" ? value.toString() : value,
    )).not.toContain("max");
  });

  it("selects only the pinned neg-risk exchange without accepting a spender", async () => {
    const reads = reader();
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement({ negRisk: true }),
      reader: reads,
      nowMs: NOW_MS,
    });

    expect(result.status).toBe("approval_required");
    if (result.status !== "approval_required") throw new Error("Expected a plan");
    expect(result.actions.every((action) =>
      "spenderAddress" in action
        ? action.spenderAddress === POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS
        : action.operatorAddress === POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
    )).toBe(true);
  });

  it("emits no calls when exact minimum permissions already exist", async () => {
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement(),
      reader: reader({
        collateralAllowance: 10_500_000n,
        outcomeApproved: false,
      }),
      nowMs: NOW_MS,
    });

    expect(result).toMatchObject({
      status: "ready",
      collateralAllowanceAtomic: 10_500_000n,
      outcomeApprovedForAll: false,
    });
  });

  it("creates the minimum set of corrective calls", async () => {
    const collateralOnly = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement(),
      reader: reader({ collateralAllowance: 0n, outcomeApproved: false }),
      nowMs: NOW_MS,
    });
    const outcomeOnly = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement(),
      reader: reader({ collateralAllowance: 10_500_000n, outcomeApproved: true }),
      nowMs: NOW_MS,
    });

    expect(collateralOnly.status).toBe("approval_required");
    expect(outcomeOnly.status).toBe("approval_required");
    if (collateralOnly.status !== "approval_required" || outcomeOnly.status !== "approval_required") {
      throw new Error("Expected corrective plans");
    }
    expect(collateralOnly.actions.map((action) => action.kind)).toEqual([
      "prepareErc20Approval",
    ]);
    expect(outcomeOnly.actions.map((action) => action.kind)).toEqual([
      "prepareErc1155ApprovalForAll",
    ]);
  });

  it("replaces overbroad and MAX_UINT pUSD approvals with the exact target", async () => {
    for (const collateralAllowance of [11_000_000n, MAX_UINT256]) {
      const result = await assessPolymarketAllowanceReadiness({
        contracts,
        requirement: requirement(),
        reader: reader({ collateralAllowance, outcomeApproved: false }),
        nowMs: NOW_MS,
      });

      expect(result.status).toBe("approval_required");
      if (result.status !== "approval_required") throw new Error("Expected a plan");
      expect(result.actions).toEqual([
        expect.objectContaining({
          kind: "prepareErc20Approval",
          amountAtomic: 10_500_000n,
        }),
      ]);
    }
  });

  it("plans explicit revocation when an armed strategy requires neither permission", async () => {
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement({
        armedStrategyBudgetAtomic: 0n,
        allowanceBufferAtomic: 0n,
        requiredOutcomeTokenAtomic: 0n,
        conditionId: null,
        outcomeTokenId: null,
      }),
      reader: reader({ collateralAllowance: 7n, outcomeApproved: true }),
      nowMs: NOW_MS,
    });

    expect(result.status).toBe("approval_required");
    if (result.status !== "approval_required") throw new Error("Expected a plan");
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: "prepareErc20Approval",
        amountAtomic: 0n,
      }),
      expect.objectContaining({
        kind: "prepareErc1155ApprovalForAll",
        approved: false,
        conditionId: null,
        outcomeTokenId: null,
        authorizedOutcomeTokenAtomic: 0n,
      }),
    ]);
  });

  it.each([
    [
      "budget exceeds authorization",
      { maxAuthorizedCollateralAtomic: 10_499_999n },
      "COLLATERAL_AUTHORIZATION_EXCEEDED",
    ],
    [
      "MAX_UINT target",
      {
        armedStrategyBudgetAtomic: MAX_UINT256,
        allowanceBufferAtomic: 0n,
        maxAuthorizedCollateralAtomic: MAX_UINT256,
      },
      "UNBOUNDED_ALLOWANCE_FORBIDDEN",
    ],
    [
      "outcome amount lacks binding",
      {
        requiredOutcomeTokenAtomic: 1n,
        conditionId: null,
        outcomeTokenId: null,
      },
      "INVALID_OUTCOME_BINDING",
    ],
    [
      "invalid outcome token",
      { outcomeTokenId: "-1" },
      "INVALID_OUTCOME_BINDING",
    ],
  ] as const)("fails closed before reads when %s", async (_label, overrides, reason) => {
    const reads = reader();
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement(overrides),
      reader: reads,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ status: "blocked", reason });
    expect(reads.getFinalizedBlock).not.toHaveBeenCalled();
  });

  it("fails closed on a malformed gas-funding boundary", async () => {
    const reads = reader();
    const malformed = {
      ...requirement(),
      gasFunding: null,
    } as unknown as PolymarketAllowanceRequirement;

    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: malformed,
      reader: reads,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ status: "blocked", reason: "INVALID_GAS_REQUIREMENT" });
    expect(reads.getFinalizedBlock).not.toHaveBeenCalled();
  });

  it.each([
    ["wrong chain", { chainId: 1 }, "WRONG_CHAIN"],
    [
      "stale evidence",
      { observedAtMs: NOW_MS - 60_001 },
      "STALE_ALLOWANCE_EVIDENCE",
    ],
    ["block read failure", { fail: "block" }, "ALLOWANCE_READ_FAILED"],
    ["allowance read failure", { fail: "collateral" }, "ALLOWANCE_READ_FAILED"],
    ["outcome read failure", { fail: "outcome" }, "ALLOWANCE_READ_FAILED"],
    ["malformed allowance", { collateralAllowance: -1n }, "ALLOWANCE_READ_FAILED"],
    ["malformed approval", { outcomeApproved: "yes" }, "ALLOWANCE_READ_FAILED"],
  ] as const)("fails closed on %s", async (_label, readOptions, reason) => {
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement(),
      reader: reader(readOptions),
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ status: "blocked", reason });
  });

  it("checks native gas before reading permissions on a self-funded path", async () => {
    const reads = reader({ nativeBalance: 99n });
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement({
        gasFunding: { kind: "self-funded", requiredNativeGasWei: 100n },
      }),
      reader: reads,
      nowMs: NOW_MS,
    });

    expect(result).toEqual({ status: "blocked", reason: "INSUFFICIENT_NATIVE_GAS" });
    expect(reads.readCollateralAllowance).not.toHaveBeenCalled();
    expect(reads.readOutcomeApprovalForAll).not.toHaveBeenCalled();
  });

  it("never reads native gas for the official relayer-sponsored path", async () => {
    const reads = reader({ collateralAllowance: 10_500_000n });
    const result = await assessPolymarketAllowanceReadiness({
      contracts,
      requirement: requirement({
        requiredOutcomeTokenAtomic: 0n,
        conditionId: null,
        outcomeTokenId: null,
      }),
      reader: reads,
      nowMs: NOW_MS,
    });

    expect(result).toMatchObject({
      status: "ready",
      chainId: 137,
      ownerAddress: OWNER,
      exchangeAddress: POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
      collateralTokenAddress: POLYMARKET_PUSD_ADDRESS,
      outcomeTokenContractAddress: POLYMARKET_CTF_ADDRESS,
      negRisk: false,
      contractReviewedAtMs: NOW_MS - 1_000,
    });
    expect(reads.readNativeBalance).not.toHaveBeenCalled();
  });

  it("fails closed before reads when a forged contract object substitutes either exchange", async () => {
    const attacker = "0x4444444444444444444444444444444444444444";

    for (const negRisk of [false, true]) {
      const reads = reader();
      const field = negRisk
        ? "negRiskExchangeAddress"
        : "standardExchangeAddress";
      const forged = {
        ...contracts,
        [field]: attacker,
      } as unknown as typeof contracts;

      await expect(
        assessPolymarketAllowanceReadiness({
          contracts: forged,
          requirement: requirement({ negRisk }),
          reader: reads,
          nowMs: NOW_MS,
        }),
      ).resolves.toEqual({
        status: "blocked",
        reason: "CONTRACT_CONFIG_INVALID",
      });
      expect(reads.getFinalizedBlock).not.toHaveBeenCalled();
    }
  });

  it("rejects forbidden SDK helpers, user-supplied spenders, and MAX_UINT plans", () => {
    const base = {
      chainId: 137 as const,
      ownerAddress: OWNER,
      tokenAddress: POLYMARKET_PUSD_ADDRESS,
      spenderAddress: POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
      amountAtomic: 10_500_000n,
    } as const;

    expect(() =>
      validatePolymarketApprovalPlan(
        [{ ...base, kind: "setupTradingApprovals", sdkMethod: "setupTradingApprovals" }] as unknown as PolymarketApprovalAction[],
        contracts,
        OWNER,
        10_500_000n,
      ),
    ).toThrow(/setupTradingApprovals/);
    expect(() =>
      validatePolymarketApprovalPlan(
        [{
          ...base,
          kind: "prepareErc20Approval",
          sdkMethod: "prepareErc20Approval",
          spenderAddress: "0x4444444444444444444444444444444444444444",
        }],
        contracts,
        OWNER,
        10_500_000n,
      ),
    ).toThrow(/allowlisted exchange/);
    expect(() =>
      validatePolymarketApprovalPlan(
        [{
          ...base,
          kind: "prepareErc20Approval",
          sdkMethod: "prepareErc20Approval",
          amountAtomic: MAX_UINT256,
        }],
        contracts,
        OWNER,
        10_500_000n,
      ),
    ).toThrow(/MAX_UINT256/);
    expect(() =>
      validatePolymarketApprovalPlan(
        [{
          ...base,
          kind: "prepareErc20Approval",
          sdkMethod: "prepareErc20Approval",
          amountAtomic: MAX_UINT256 - 1n,
        }],
        contracts,
        OWNER,
        10_500_000n,
      ),
    ).toThrow(/policy target|exact/i);
    expect(() =>
      validatePolymarketApprovalPlan(
        [{
          ...base,
          kind: "prepareErc20Approval",
          sdkMethod: "prepareErc20Approval",
          calls: [],
        }] as unknown as PolymarketApprovalAction[],
        contracts,
        OWNER,
        10_500_000n,
      ),
    ).toThrow(/unexpected|shape/i);
  });
});
