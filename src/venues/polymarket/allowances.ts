import { getAddress } from "viem";

import {
  POLYMARKET_CHAIN_ID,
  POLYMARKET_CTF_ADDRESS,
  POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS,
  POLYMARKET_PUSD_ADDRESS,
  POLYMARKET_STANDARD_EXCHANGE_ADDRESS,
  PolymarketContractValidationError,
  selectPolymarketExchange,
  validatePolymarketContractConfig,
  type PolymarketContracts,
  type PolymarketEvmAddress,
} from "@/venues/polymarket/contracts";

export const MAX_UINT256 = (1n << 256n) - 1n;
export const POLYMARKET_ALLOWANCE_EVIDENCE_MAX_AGE_MS = 60_000;

const CONDITION_ID = /^0x[a-fA-F0-9]{64}$/;
const BLOCK_HASH = /^0x[a-fA-F0-9]{64}$/;
const UINT256_DECIMAL = /^(0|[1-9][0-9]*)$/;
const FORBIDDEN_BROAD_SETUP_METHOD = ["setup", "Trading", "Approvals"].join("");

export type PolymarketGasFunding =
  | Readonly<{ kind: "relayer-sponsored" }>
  | Readonly<{ kind: "self-funded"; requiredNativeGasWei: bigint }>;

export interface PolymarketAllowanceRequirement {
  readonly depositWalletAddress: string;
  readonly negRisk: boolean;
  readonly armedStrategyBudgetAtomic: bigint;
  readonly allowanceBufferAtomic: bigint;
  readonly maxAuthorizedCollateralAtomic: bigint;
  readonly requiredOutcomeTokenAtomic: bigint;
  readonly conditionId: string | null;
  readonly outcomeTokenId: string | null;
  readonly gasFunding: PolymarketGasFunding;
}

export interface PolymarketFinalizedBlockObservation {
  readonly chainId: unknown;
  readonly blockNumber: unknown;
  readonly blockHash: unknown;
  readonly observedAtMs: unknown;
}

interface FixedReadContext {
  readonly chainId: typeof POLYMARKET_CHAIN_ID;
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
  readonly ownerAddress: PolymarketEvmAddress;
}

export interface PolymarketCollateralAllowanceRead extends FixedReadContext {
  readonly tokenAddress: typeof POLYMARKET_PUSD_ADDRESS;
  readonly spenderAddress: PolymarketEvmAddress;
}

export interface PolymarketOutcomeApprovalRead extends FixedReadContext {
  readonly tokenAddress: typeof POLYMARKET_CTF_ADDRESS;
  readonly operatorAddress: PolymarketEvmAddress;
}

export type PolymarketNativeBalanceRead = FixedReadContext;

/** An injected read-only boundary. This module never creates an RPC transport. */
export interface PolymarketAllowanceReader {
  getFinalizedBlock(
    chainId: typeof POLYMARKET_CHAIN_ID,
  ): Promise<PolymarketFinalizedBlockObservation>;
  readCollateralAllowance(request: PolymarketCollateralAllowanceRead): Promise<unknown>;
  readOutcomeApprovalForAll(request: PolymarketOutcomeApprovalRead): Promise<unknown>;
  readNativeBalance(request: PolymarketNativeBalanceRead): Promise<unknown>;
}

export interface PolymarketErc20ApprovalAction {
  readonly kind: "prepareErc20Approval";
  readonly sdkMethod: "prepareErc20Approval";
  readonly chainId: typeof POLYMARKET_CHAIN_ID;
  readonly ownerAddress: PolymarketEvmAddress;
  readonly tokenAddress: typeof POLYMARKET_PUSD_ADDRESS;
  readonly spenderAddress: PolymarketEvmAddress;
  readonly amountAtomic: bigint;
}

export interface PolymarketErc1155ApprovalAction {
  readonly kind: "prepareErc1155ApprovalForAll";
  readonly sdkMethod: "prepareErc1155ApprovalForAll";
  readonly chainId: typeof POLYMARKET_CHAIN_ID;
  readonly ownerAddress: PolymarketEvmAddress;
  readonly tokenAddress: typeof POLYMARKET_CTF_ADDRESS;
  readonly operatorAddress: PolymarketEvmAddress;
  readonly approved: boolean;
  /** ERC-1155 is operator-wide, so txBet binds the narrower authorization context here. */
  readonly conditionId: string | null;
  readonly outcomeTokenId: string | null;
  readonly authorizedOutcomeTokenAtomic: bigint;
}

export type PolymarketApprovalAction =
  | PolymarketErc20ApprovalAction
  | PolymarketErc1155ApprovalAction;

export type PolymarketAllowanceBlockedReason =
  | "CONTRACT_CONFIG_INVALID"
  | "CONTRACT_CONFIG_STALE"
  | "INVALID_WALLET"
  | "INVALID_COLLATERAL_REQUIREMENT"
  | "COLLATERAL_AUTHORIZATION_EXCEEDED"
  | "UNBOUNDED_ALLOWANCE_FORBIDDEN"
  | "INVALID_OUTCOME_BINDING"
  | "OPERATOR_WIDE_CTF_APPROVAL_FORBIDDEN"
  | "INVALID_GAS_REQUIREMENT"
  | "WRONG_CHAIN"
  | "STALE_ALLOWANCE_EVIDENCE"
  | "ALLOWANCE_READ_FAILED"
  | "INSUFFICIENT_NATIVE_GAS";

interface AllowanceEvidence {
  readonly chainId: typeof POLYMARKET_CHAIN_ID;
  readonly ownerAddress: PolymarketEvmAddress;
  readonly exchangeAddress: PolymarketEvmAddress;
  readonly collateralTokenAddress: typeof POLYMARKET_PUSD_ADDRESS;
  readonly outcomeTokenContractAddress: typeof POLYMARKET_CTF_ADDRESS;
  readonly negRisk: boolean;
  readonly contractReviewedAtMs: number;
  readonly conditionId: string | null;
  readonly outcomeTokenId: string | null;
  readonly blockNumber: bigint;
  readonly blockHash: `0x${string}`;
  readonly observedAtMs: number;
  readonly collateralTargetAtomic: bigint;
  readonly collateralAllowanceAtomic: bigint;
  readonly outcomeApprovedForAll: boolean;
}

export type PolymarketAllowanceReadiness =
  | Readonly<{
      status: "blocked";
      reason: PolymarketAllowanceBlockedReason;
    }>
  | (Readonly<{ status: "ready" }> & AllowanceEvidence)
  | (Readonly<{
      status: "approval_required";
      actions: readonly PolymarketApprovalAction[];
    }> & AllowanceEvidence);

export interface AssessPolymarketAllowanceReadinessInput {
  readonly contracts: PolymarketContracts;
  readonly requirement: PolymarketAllowanceRequirement;
  readonly reader: PolymarketAllowanceReader;
  readonly nowMs: number;
}

function blocked(reason: PolymarketAllowanceBlockedReason): PolymarketAllowanceReadiness {
  return Object.freeze({ status: "blocked", reason });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isChecksummedAddress(value: unknown): value is PolymarketEvmAddress {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{40}$/.test(value)) return false;
  try {
    return getAddress(value) === value;
  } catch {
    return false;
  }
}

function isUint256(value: unknown): value is bigint {
  return typeof value === "bigint" && value >= 0n && value <= MAX_UINT256;
}

function isPositiveTokenId(value: unknown): value is string {
  if (typeof value !== "string" || !UINT256_DECIMAL.test(value)) return false;
  try {
    const tokenId = BigInt(value);
    return tokenId > 0n && tokenId <= MAX_UINT256;
  } catch {
    return false;
  }
}

function revalidateContracts(
  contracts: PolymarketContracts,
  nowMs: number,
): PolymarketAllowanceBlockedReason | null {
  try {
    const canonical = validatePolymarketContractConfig(
      {
        chainId: contracts.chainId,
        collateralAddress: contracts.collateralAddress,
        collateralDecimals: contracts.collateralDecimals,
        conditionalTokensAddress: contracts.conditionalTokensAddress,
        exchangeAllowlist: contracts.exchangeAllowlist,
        reviewedAtMs: contracts.reviewedAtMs,
      },
      nowMs,
    );
    // PolymarketContracts is a runtime boundary. Do not trust fields omitted from
    // the validator input merely because TypeScript says they are canonical.
    if (
      contracts.standardExchangeAddress !== canonical.standardExchangeAddress ||
      contracts.negRiskExchangeAddress !== canonical.negRiskExchangeAddress
    ) {
      return "CONTRACT_CONFIG_INVALID";
    }
    return null;
  } catch (error) {
    if (
      error instanceof PolymarketContractValidationError &&
      error.code === "STALE_CONTRACT_CONFIG"
    ) {
      return "CONTRACT_CONFIG_STALE";
    }
    return "CONTRACT_CONFIG_INVALID";
  }
}

function validateRequirement(
  requirement: PolymarketAllowanceRequirement,
):
  | Readonly<{
      ownerAddress: PolymarketEvmAddress;
      collateralTargetAtomic: bigint;
      outcomeTargetAtomic: bigint;
    }>
  | PolymarketAllowanceBlockedReason {
  if (!isChecksummedAddress(requirement.depositWalletAddress)) return "INVALID_WALLET";
  if (
    typeof requirement.negRisk !== "boolean" ||
    !isUint256(requirement.armedStrategyBudgetAtomic) ||
    !isUint256(requirement.allowanceBufferAtomic) ||
    !isUint256(requirement.maxAuthorizedCollateralAtomic)
  ) {
    return "INVALID_COLLATERAL_REQUIREMENT";
  }

  const collateralTargetAtomic =
    requirement.armedStrategyBudgetAtomic + requirement.allowanceBufferAtomic;
  if (collateralTargetAtomic >= MAX_UINT256) return "UNBOUNDED_ALLOWANCE_FORBIDDEN";
  if (collateralTargetAtomic > requirement.maxAuthorizedCollateralAtomic) {
    return "COLLATERAL_AUTHORIZATION_EXCEEDED";
  }

  if (!isUint256(requirement.requiredOutcomeTokenAtomic)) {
    return "INVALID_OUTCOME_BINDING";
  }
  if (requirement.requiredOutcomeTokenAtomic > 0n) {
    if (
      typeof requirement.conditionId !== "string" ||
      !CONDITION_ID.test(requirement.conditionId) ||
      !isPositiveTokenId(requirement.outcomeTokenId)
    ) {
      return "INVALID_OUTCOME_BINDING";
    }
  } else if (requirement.conditionId !== null || requirement.outcomeTokenId !== null) {
    return "INVALID_OUTCOME_BINDING";
  }

  if (!isRecord(requirement.gasFunding)) {
    return "INVALID_GAS_REQUIREMENT";
  }
  if (requirement.gasFunding.kind === "self-funded") {
    if (!isUint256(requirement.gasFunding.requiredNativeGasWei)) {
      return "INVALID_GAS_REQUIREMENT";
    }
  } else if (requirement.gasFunding.kind !== "relayer-sponsored") {
    return "INVALID_GAS_REQUIREMENT";
  }

  return Object.freeze({
    ownerAddress: requirement.depositWalletAddress,
    collateralTargetAtomic,
    outcomeTargetAtomic: requirement.requiredOutcomeTokenAtomic,
  });
}

function parseFinalizedBlock(
  value: unknown,
  nowMs: number,
):
  | Readonly<{
      blockNumber: bigint;
      blockHash: `0x${string}`;
      observedAtMs: number;
    }>
  | PolymarketAllowanceBlockedReason {
  if (!isRecord(value)) return "ALLOWANCE_READ_FAILED";
  if (value.chainId !== POLYMARKET_CHAIN_ID) return "WRONG_CHAIN";
  if (
    typeof value.blockNumber !== "bigint" ||
    value.blockNumber <= 0n ||
    typeof value.blockHash !== "string" ||
    !BLOCK_HASH.test(value.blockHash) ||
    typeof value.observedAtMs !== "number" ||
    !Number.isSafeInteger(value.observedAtMs)
  ) {
    return "ALLOWANCE_READ_FAILED";
  }
  if (
    value.observedAtMs > nowMs ||
    nowMs - value.observedAtMs > POLYMARKET_ALLOWANCE_EVIDENCE_MAX_AGE_MS
  ) {
    return "STALE_ALLOWANCE_EVIDENCE";
  }
  return Object.freeze({
    blockNumber: value.blockNumber,
    blockHash: value.blockHash as `0x${string}`,
    observedAtMs: value.observedAtMs,
  });
}

function isBlockedReason(
  value: unknown,
): value is PolymarketAllowanceBlockedReason {
  return typeof value === "string";
}

function isAllowedExchange(
  value: unknown,
): value is PolymarketEvmAddress {
  return (
    value === POLYMARKET_STANDARD_EXCHANGE_ADDRESS ||
    value === POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS
  );
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  allowedKeys: readonly string[],
): boolean {
  const keys = Object.keys(value);
  return (
    keys.length === allowedKeys.length &&
    keys.every((key) => allowedKeys.includes(key))
  );
}

/**
 * Rejects generic SDK setup and executable transaction shapes at the boundary.
 * The accepted values are preparation descriptors only; another crash-safe layer drives them.
 */
export function validatePolymarketApprovalPlan(
  actions: readonly PolymarketApprovalAction[],
  contracts: PolymarketContracts,
  expectedOwnerAddress: string,
  expectedCollateralTargetAtomic: bigint,
): void {
  if (!Array.isArray(actions) || actions.length > 2) {
    throw new Error("Polymarket approval plan must contain at most two preparation calls");
  }
  if (!isChecksummedAddress(expectedOwnerAddress)) {
    throw new Error("Polymarket approval plan owner is invalid");
  }
  if (
    !isUint256(expectedCollateralTargetAtomic) ||
    expectedCollateralTargetAtomic === MAX_UINT256
  ) {
    throw new Error("Polymarket approval policy target is invalid");
  }
  if (
    contracts.chainId !== POLYMARKET_CHAIN_ID ||
    contracts.collateralAddress !== POLYMARKET_PUSD_ADDRESS ||
    contracts.conditionalTokensAddress !== POLYMARKET_CTF_ADDRESS ||
    contracts.standardExchangeAddress !== POLYMARKET_STANDARD_EXCHANGE_ADDRESS ||
    contracts.negRiskExchangeAddress !== POLYMARKET_NEG_RISK_EXCHANGE_ADDRESS
  ) {
    throw new Error("Polymarket approval plan contract bindings are invalid");
  }

  const seenKinds = new Set<string>();
  let selectedExchange: string | null = null;
  for (const action of actions as readonly unknown[]) {
    if (!isRecord(action)) throw new Error("Polymarket approval action is malformed");
    if (
      action.kind === FORBIDDEN_BROAD_SETUP_METHOD ||
      action.sdkMethod === FORBIDDEN_BROAD_SETUP_METHOD
    ) {
      throw new Error(
        `${FORBIDDEN_BROAD_SETUP_METHOD} is forbidden because it creates broad approvals`,
      );
    }
    if ("to" in action || "data" in action || "value" in action) {
      throw new Error("Executable or arbitrary transaction fields are forbidden");
    }
    if (action.chainId !== POLYMARKET_CHAIN_ID) {
      throw new Error("Polymarket approval action has the wrong chain");
    }
    if (action.ownerAddress !== expectedOwnerAddress) {
      throw new Error("Polymarket approval action has the wrong owner");
    }
    if (typeof action.kind !== "string" || seenKinds.has(action.kind)) {
      throw new Error("Polymarket approval plan contains duplicate or malformed actions");
    }
    seenKinds.add(action.kind);

    if (action.kind === "prepareErc20Approval") {
      if (!hasExactKeys(action, [
        "kind",
        "sdkMethod",
        "chainId",
        "ownerAddress",
        "tokenAddress",
        "spenderAddress",
        "amountAtomic",
      ])) {
        throw new Error("pUSD approval action has an unexpected shape");
      }
      if (
        action.sdkMethod !== "prepareErc20Approval" ||
        action.tokenAddress !== POLYMARKET_PUSD_ADDRESS ||
        !isAllowedExchange(action.spenderAddress)
      ) {
        throw new Error("pUSD approval must target an allowlisted exchange");
      }
      if (!isUint256(action.amountAtomic)) {
        throw new Error("pUSD approval amount must be a uint256 bigint");
      }
      if (action.amountAtomic === MAX_UINT256) {
        throw new Error("MAX_UINT256 pUSD approvals are forbidden");
      }
      if (action.amountAtomic !== expectedCollateralTargetAtomic) {
        throw new Error("pUSD approval must equal the exact policy target");
      }
      selectedExchange ??= action.spenderAddress;
      if (selectedExchange !== action.spenderAddress) {
        throw new Error("Polymarket approval actions must use one selected exchange");
      }
      continue;
    }

    if (action.kind === "prepareErc1155ApprovalForAll") {
      if (!hasExactKeys(action, [
        "kind",
        "sdkMethod",
        "chainId",
        "ownerAddress",
        "tokenAddress",
        "operatorAddress",
        "approved",
        "conditionId",
        "outcomeTokenId",
        "authorizedOutcomeTokenAtomic",
      ])) {
        throw new Error("CTF approval action has an unexpected shape");
      }
      if (
        action.sdkMethod !== "prepareErc1155ApprovalForAll" ||
        action.tokenAddress !== POLYMARKET_CTF_ADDRESS ||
        !isAllowedExchange(action.operatorAddress) ||
        typeof action.approved !== "boolean" ||
        !isUint256(action.authorizedOutcomeTokenAtomic)
      ) {
        throw new Error("CTF approval must target an allowlisted exchange");
      }
      // ERC-1155 setApprovalForAll cannot be bounded to one condition or token.
      // The MVP therefore accepts revocation descriptors only.
      if (
        action.approved !== false ||
        action.authorizedOutcomeTokenAtomic !== 0n ||
        action.conditionId !== null ||
        action.outcomeTokenId !== null
      ) {
        throw new Error("New operator-wide CTF approvals are forbidden");
      }
      selectedExchange ??= action.operatorAddress;
      if (selectedExchange !== action.operatorAddress) {
        throw new Error("Polymarket approval actions must use one selected exchange");
      }
      continue;
    }

    throw new Error("Only fixed Polymarket approval preparation methods are allowed");
  }
}

/**
 * Reads one finalized snapshot and returns either readiness or the smallest correction plan.
 * Any ambiguous read, stale evidence, or authorization drift returns a closed result.
 */
export async function assessPolymarketAllowanceReadiness(
  input: AssessPolymarketAllowanceReadinessInput,
): Promise<PolymarketAllowanceReadiness> {
  const contractError = revalidateContracts(input.contracts, input.nowMs);
  if (contractError !== null) return blocked(contractError);

  const requirement = validateRequirement(input.requirement);
  if (isBlockedReason(requirement)) return blocked(requirement);
  if (requirement.outcomeTargetAtomic > 0n) {
    return blocked("OPERATOR_WIDE_CTF_APPROVAL_FORBIDDEN");
  }
  const exchangeAddress = selectPolymarketExchange(
    input.contracts,
    input.requirement.negRisk,
  );

  let rawBlock: unknown;
  try {
    rawBlock = await input.reader.getFinalizedBlock(POLYMARKET_CHAIN_ID);
  } catch {
    return blocked("ALLOWANCE_READ_FAILED");
  }
  const block = parseFinalizedBlock(rawBlock, input.nowMs);
  if (isBlockedReason(block)) return blocked(block);

  const fixedReadContext = Object.freeze({
    chainId: POLYMARKET_CHAIN_ID,
    blockNumber: block.blockNumber,
    blockHash: block.blockHash,
    ownerAddress: requirement.ownerAddress,
  });

  if (input.requirement.gasFunding.kind === "self-funded") {
    let nativeBalance: unknown;
    try {
      nativeBalance = await input.reader.readNativeBalance(fixedReadContext);
    } catch {
      return blocked("ALLOWANCE_READ_FAILED");
    }
    if (!isUint256(nativeBalance)) return blocked("ALLOWANCE_READ_FAILED");
    if (nativeBalance < input.requirement.gasFunding.requiredNativeGasWei) {
      return blocked("INSUFFICIENT_NATIVE_GAS");
    }
  }

  let collateralAllowance: unknown;
  try {
    collateralAllowance = await input.reader.readCollateralAllowance({
      ...fixedReadContext,
      tokenAddress: POLYMARKET_PUSD_ADDRESS,
      spenderAddress: exchangeAddress,
    });
  } catch {
    return blocked("ALLOWANCE_READ_FAILED");
  }
  if (!isUint256(collateralAllowance)) return blocked("ALLOWANCE_READ_FAILED");

  let outcomeApprovedForAll: unknown;
  try {
    outcomeApprovedForAll = await input.reader.readOutcomeApprovalForAll({
      ...fixedReadContext,
      tokenAddress: POLYMARKET_CTF_ADDRESS,
      operatorAddress: exchangeAddress,
    });
  } catch {
    return blocked("ALLOWANCE_READ_FAILED");
  }
  if (typeof outcomeApprovedForAll !== "boolean") {
    return blocked("ALLOWANCE_READ_FAILED");
  }

  const actions: PolymarketApprovalAction[] = [];
  if (collateralAllowance !== requirement.collateralTargetAtomic) {
    actions.push(Object.freeze({
      kind: "prepareErc20Approval",
      sdkMethod: "prepareErc20Approval",
      chainId: POLYMARKET_CHAIN_ID,
      ownerAddress: requirement.ownerAddress,
      tokenAddress: POLYMARKET_PUSD_ADDRESS,
      spenderAddress: exchangeAddress,
      amountAtomic: requirement.collateralTargetAtomic,
    }));
  }

  const shouldApproveOutcome = false;
  if (outcomeApprovedForAll !== shouldApproveOutcome) {
    actions.push(Object.freeze({
      kind: "prepareErc1155ApprovalForAll",
      sdkMethod: "prepareErc1155ApprovalForAll",
      chainId: POLYMARKET_CHAIN_ID,
      ownerAddress: requirement.ownerAddress,
      tokenAddress: POLYMARKET_CTF_ADDRESS,
      operatorAddress: exchangeAddress,
      approved: shouldApproveOutcome,
      conditionId: shouldApproveOutcome ? input.requirement.conditionId : null,
      outcomeTokenId: shouldApproveOutcome ? input.requirement.outcomeTokenId : null,
      authorizedOutcomeTokenAtomic: requirement.outcomeTargetAtomic,
    }));
  }

  validatePolymarketApprovalPlan(
    actions,
    input.contracts,
    requirement.ownerAddress,
    requirement.collateralTargetAtomic,
  );
  const evidence = {
    chainId: POLYMARKET_CHAIN_ID,
    ownerAddress: requirement.ownerAddress,
    exchangeAddress,
    collateralTokenAddress: POLYMARKET_PUSD_ADDRESS,
    outcomeTokenContractAddress: POLYMARKET_CTF_ADDRESS,
    negRisk: input.requirement.negRisk,
    contractReviewedAtMs: input.contracts.reviewedAtMs,
    conditionId: input.requirement.conditionId,
    outcomeTokenId: input.requirement.outcomeTokenId,
    blockNumber: block.blockNumber,
    blockHash: block.blockHash,
    observedAtMs: block.observedAtMs,
    collateralTargetAtomic: requirement.collateralTargetAtomic,
    collateralAllowanceAtomic: collateralAllowance,
    outcomeApprovedForAll,
  } as const;
  if (actions.length === 0) {
    return Object.freeze({ status: "ready", ...evidence });
  }
  return Object.freeze({
    status: "approval_required",
    ...evidence,
    actions: Object.freeze(actions),
  });
}
