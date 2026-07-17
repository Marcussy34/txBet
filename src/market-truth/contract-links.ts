import { canonicalJson, sha256Canonical, type JsonValue } from "@/core/canonical-json";
import {
  compareShares,
  mulDivFloorMicros,
  type ExactShares,
} from "@/core/live-money";
import type { Micros } from "@/core/money";

import {
  parseSettlementSpec,
  settlementFingerprint,
  settlementProvenanceHash,
  settlementSemanticProjection,
  type AssetValuePolicy,
  type PayoutAsset,
  type SettlementSemanticProjectionV1,
  type SettlementSpecV1,
} from "./settlement-spec";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;

export interface ContractRevisionRef {
  readonly venueId: string;
  readonly contractId: string;
  readonly settlementSpecVersion: number;
  readonly settlementFingerprint: string;
  readonly venueRevision: string;
  readonly rawRuleTextHash: string;
  readonly settlementProvenanceHash: string;
  readonly canonicalEntityMappingRevision: string;
  readonly tradingClosesAt: number;
  readonly closeTimeRevision: string;
  readonly closeTimeEvidenceHash: string;
  readonly payoutAssetRevision: string;
  /** Optional venue-specific market identity evidence pinned during contract review. */
  readonly marketIdentityHash?: string;
}

export interface LinkableContract {
  readonly reference: ContractRevisionRef;
  readonly title: string;
  readonly outcome: "YES" | "NO";
  readonly outcomeUniverse: readonly string[];
  readonly status: "open" | "suspended" | "closed" | "resolved";
  readonly settlementSpec: SettlementSpecV1;
  readonly unitSize: ExactShares;
  readonly payoutAsset: PayoutAsset;
}

export type ContractLinkReasonCode =
  | "INVALID_CONTRACT_REFERENCE"
  | "INVALID_SETTLEMENT_SPEC"
  | "SAME_VENUE"
  | "SAME_POLARITY"
  | "NON_BINARY_OUTCOMES"
  | "SETTLEMENT_MISMATCH"
  | "PAYOUT_MISMATCH"
  | "UNIT_SIZE_MISMATCH"
  | "UNKNOWN_TRANSFORM"
  | "TRANSFORM_NOT_APPLICABLE"
  | "STALE_REFERENCE"
  | "CONTRACT_NOT_OPEN"
  | "TRADING_CLOSED"
  | "PAYOUT_POLICY_MISSING"
  | "PAYOUT_POLICY_INVALID"
  | "PAYOUT_POLICY_EXPIRED"
  | "PAYOUT_POLICY_ASSET_MISMATCH";

export interface ContractLinkReason {
  readonly code: ContractLinkReasonCode;
  readonly side: "left" | "right" | null;
  readonly field: keyof ContractRevisionRef | string | null;
  readonly message: string;
}

export type ContractLinkVerification =
  | {
      readonly status: "VERIFIED";
      readonly fingerprint: string;
      readonly left: ContractRevisionRef;
      readonly right: ContractRevisionRef;
      readonly method: "exact" | "reviewed-transform";
      readonly transformRuleId: string | null;
    }
  | { readonly status: "UNVERIFIED"; readonly reasons: readonly ContractLinkReason[] };

export type VerifiedContractLink = Extract<ContractLinkVerification, { readonly status: "VERIFIED" }>;

export interface ComplementProofOptions {
  readonly method?: "exact" | "reviewed-transform";
  readonly transformRuleId?: string | null;
}

export type PayoutBasisVerification =
  | {
      readonly status: "VERIFIED";
      readonly conservativePayoutMicrosPerShare: Micros;
      readonly leftPayoutMicrosPerShare: Micros;
      readonly rightPayoutMicrosPerShare: Micros;
      readonly evidenceHash: string;
    }
  | { readonly status: "UNVERIFIED"; readonly reasons: readonly ContractLinkReason[] };

export const REVIEWED_TRANSFORM_RULE_IDS = Object.freeze([
  "world-cup-integer-gte-gt-v1",
] as const);

/** Prove two venue contracts are exact inverse sides of one complete binary settlement. */
export function proveComplement(
  left: LinkableContract,
  right: LinkableContract,
  options: ComplementProofOptions = {},
): ContractLinkVerification {
  const reasons: ContractLinkReason[] = [
    ...validateLinkableContract(left, "left"),
    ...validateLinkableContract(right, "right"),
  ];

  if (left.reference.venueId === right.reference.venueId) {
    reasons.push(reason("SAME_VENUE", null, "venueId", "Complement legs must use different venues"));
  }
  if (left.outcome === right.outcome) {
    reasons.push(reason("SAME_POLARITY", null, "outcome", "Complement legs must have inverse polarity"));
  }
  if (!isExhaustiveBinaryUniverse(left) || !isExhaustiveBinaryUniverse(right)) {
    reasons.push(
      reason(
        "NON_BINARY_OUTCOMES",
        null,
        "outcomeUniverse",
        "Executable links require exactly the exhaustive YES and NO outcomes",
      ),
    );
  }
  if (compareSharesSafely(left.unitSize, right.unitSize) !== 0) {
    reasons.push(
      reason("UNIT_SIZE_MISMATCH", null, "unitSize", "Complement legs must represent equal shares"),
    );
  }
  if (
    left.settlementSpec.payout.valueUnit !== right.settlementSpec.payout.valueUnit ||
    left.settlementSpec.payout.nominalMicrosPerShare !==
      right.settlementSpec.payout.nominalMicrosPerShare
  ) {
    reasons.push(
      reason("PAYOUT_MISMATCH", null, "payout", "Complement legs must have equal nominal USD payout"),
    );
  }

  const method = options.method ?? "exact";
  let fingerprint: string | null = null;
  let transformRuleId: string | null = null;

  if (method === "exact") {
    if (options.transformRuleId != null) {
      reasons.push(
        reason("UNKNOWN_TRANSFORM", null, "transformRuleId", "Exact links cannot specify a transform"),
      );
    }
    if (left.reference.settlementFingerprint !== right.reference.settlementFingerprint) {
      reasons.push(
        reason(
          "SETTLEMENT_MISMATCH",
          null,
          "settlementFingerprint",
          "Exact links require identical settlement semantics",
        ),
      );
    } else {
      fingerprint = left.reference.settlementFingerprint;
    }
  } else {
    transformRuleId = options.transformRuleId ?? null;
    const transformed = applyReviewedTransform(transformRuleId, left.settlementSpec, right.settlementSpec);
    if (!transformed.ok) reasons.push(transformed.reason);
    else fingerprint = transformed.fingerprint;
  }

  if (reasons.length > 0 || fingerprint === null) {
    return Object.freeze({ status: "UNVERIFIED", reasons: Object.freeze(reasons) });
  }

  return Object.freeze({
    status: "VERIFIED",
    fingerprint,
    left: Object.freeze({ ...left.reference }),
    right: Object.freeze({ ...right.reference }),
    method,
    transformRuleId,
  });
}

/** Re-run complement proof while binding every stored revision to current contract state. */
export function verifyContractLink(
  link: VerifiedContractLink,
  currentLeft: LinkableContract,
  currentRight: LinkableContract,
  now: number,
): ContractLinkVerification {
  if (!Number.isSafeInteger(now) || now < 0) {
    return unverified([
      reason("INVALID_CONTRACT_REFERENCE", null, "now", "Verification time must be nonnegative and safe"),
    ]);
  }

  const reasons = [
    ...staleReferenceReasons(link.left, currentLeft.reference, "left"),
    ...staleReferenceReasons(link.right, currentRight.reference, "right"),
  ];
  for (const [side, contract] of [
    ["left", currentLeft],
    ["right", currentRight],
  ] as const) {
    if (contract.status !== "open") {
      reasons.push(
        reason("CONTRACT_NOT_OPEN", side, "status", `The ${side} contract is not open`),
      );
    }
    if (now >= contract.reference.tradingClosesAt) {
      reasons.push(
        reason("TRADING_CLOSED", side, "tradingClosesAt", `The ${side} order-entry window closed`),
      );
    }
  }

  if (reasons.length > 0) return unverified(reasons);

  const reproved = proveComplement(currentLeft, currentRight, {
    method: link.method,
    transformRuleId: link.transformRuleId,
  });
  if (reproved.status === "UNVERIFIED") return reproved;
  if (reproved.fingerprint !== link.fingerprint) {
    return unverified([
      reason(
        "STALE_REFERENCE",
        null,
        "fingerprint",
        "The current complement proof no longer matches the reviewed link",
      ),
    ]);
  }
  return link;
}

/** Bind current collateral valuation evidence and compute the worst winning-leg USD payout. */
export function checkContractLinkPayoutBasis(input: {
  readonly link: VerifiedContractLink;
  readonly left: LinkableContract;
  readonly right: LinkableContract;
  readonly leftPolicy: AssetValuePolicy | null;
  readonly rightPolicy: AssetValuePolicy | null;
  readonly now: number;
}): PayoutBasisVerification {
  const currentLink = verifyContractLink(input.link, input.left, input.right, input.now);
  if (currentLink.status === "UNVERIFIED") return currentLink;

  const reasons = [
    ...validateAssetPolicy(input.left, input.leftPolicy, input.now, "left"),
    ...validateAssetPolicy(input.right, input.rightPolicy, input.now, "right"),
  ];
  if (reasons.length > 0 || input.leftPolicy === null || input.rightPolicy === null) {
    return Object.freeze({ status: "UNVERIFIED", reasons: Object.freeze(reasons) });
  }

  const nominalPayout = input.left.settlementSpec.payout.nominalMicrosPerShare;
  const leftPayoutMicrosPerShare = mulDivFloorMicros(
    nominalPayout,
    input.leftPolicy.usdLowerBoundMicrosPerToken,
    1_000_000,
  );
  const rightPayoutMicrosPerShare = mulDivFloorMicros(
    nominalPayout,
    input.rightPolicy.usdLowerBoundMicrosPerToken,
    1_000_000,
  );
  const conservativePayoutMicrosPerShare = Math.min(
    leftPayoutMicrosPerShare,
    rightPayoutMicrosPerShare,
  );
  const evidenceHash = sha256Canonical({
    schemaVersion: "contract-link-payout-basis-v1",
    linkFingerprint: input.link.fingerprint,
    leftReference: input.link.left,
    rightReference: input.link.right,
    leftPolicy: input.leftPolicy,
    rightPolicy: input.rightPolicy,
    leftPayoutMicrosPerShare,
    rightPayoutMicrosPerShare,
    conservativePayoutMicrosPerShare,
  } as unknown as JsonValue);

  return Object.freeze({
    status: "VERIFIED",
    conservativePayoutMicrosPerShare,
    leftPayoutMicrosPerShare,
    rightPayoutMicrosPerShare,
    evidenceHash,
  });
}

function validateLinkableContract(
  contract: LinkableContract,
  side: "left" | "right",
): ContractLinkReason[] {
  const reasons: ContractLinkReason[] = [];
  let spec: SettlementSpecV1;
  try {
    spec = parseSettlementSpec(contract.settlementSpec);
  } catch {
    return [reason("INVALID_SETTLEMENT_SPEC", side, "settlementSpec", `The ${side} settlement spec is invalid`)];
  }

  const expected: Partial<Record<keyof ContractRevisionRef, unknown>> = {
    settlementSpecVersion: spec.specVersion,
    settlementFingerprint: settlementFingerprint(spec),
    venueRevision: spec.evidence.venueRevision,
    rawRuleTextHash: spec.evidence.rawRuleTextHash,
    settlementProvenanceHash: settlementProvenanceHash(spec),
    canonicalEntityMappingRevision: spec.evidence.canonicalEntityMappingRevision,
    payoutAssetRevision: contract.payoutAsset.assetRevision,
  };
  for (const [field, value] of Object.entries(expected) as [keyof ContractRevisionRef, unknown][]) {
    if (contract.reference[field] !== value) {
      reasons.push(
        reason(
          "INVALID_CONTRACT_REFERENCE",
          side,
          field,
          `The ${side} ${field} does not match its source evidence`,
        ),
      );
    }
  }

  for (const field of ["venueId", "contractId", "closeTimeRevision", "payoutAssetRevision"] as const) {
    if (!isNonemptyString(contract.reference[field])) {
      reasons.push(
        reason("INVALID_CONTRACT_REFERENCE", side, field, `The ${side} ${field} is required`),
      );
    }
  }
  if (
    !Number.isSafeInteger(contract.reference.tradingClosesAt) ||
    contract.reference.tradingClosesAt < 0
  ) {
    reasons.push(
      reason(
        "INVALID_CONTRACT_REFERENCE",
        side,
        "tradingClosesAt",
        `The ${side} close time must be a nonnegative safe integer`,
      ),
    );
  }
  for (const field of [
    "settlementFingerprint",
    "rawRuleTextHash",
    "settlementProvenanceHash",
    "closeTimeEvidenceHash",
  ] as const) {
    if (!LOWERCASE_SHA256.test(contract.reference[field])) {
      reasons.push(
        reason(
          "INVALID_CONTRACT_REFERENCE",
          side,
          field,
          `The ${side} ${field} must be lowercase SHA-256 hex`,
        ),
      );
    }
  }
  if (
    !isNonemptyString(contract.payoutAsset.network) ||
    !isNonemptyString(contract.payoutAsset.assetId) ||
    !isNonemptyString(contract.payoutAsset.symbol) ||
    !Number.isSafeInteger(contract.payoutAsset.decimals) ||
    contract.payoutAsset.decimals < 0 ||
    contract.payoutAsset.decimals > 30
  ) {
    reasons.push(
      reason("INVALID_CONTRACT_REFERENCE", side, "payoutAsset", `The ${side} payout asset is invalid`),
    );
  }
  if (compareSharesSafely(contract.unitSize, contract.unitSize) !== 0) {
    reasons.push(
      reason("INVALID_CONTRACT_REFERENCE", side, "unitSize", `The ${side} unit size is invalid`),
    );
  }
  return reasons;
}

function compareSharesSafely(left: ExactShares, right: ExactShares): -1 | 0 | 1 | null {
  try {
    return compareShares(left, right);
  } catch {
    return null;
  }
}

function isExhaustiveBinaryUniverse(contract: LinkableContract): boolean {
  if (contract.outcomeUniverse.length !== 2) return false;
  const outcomes = new Set(contract.outcomeUniverse);
  return outcomes.size === 2 && outcomes.has("YES") && outcomes.has("NO") && outcomes.has(contract.outcome);
}

function applyReviewedTransform(
  transformRuleId: string | null,
  left: SettlementSpecV1,
  right: SettlementSpecV1,
): { readonly ok: true; readonly fingerprint: string } | { readonly ok: false; readonly reason: ContractLinkReason } {
  if (transformRuleId !== "world-cup-integer-gte-gt-v1") {
    return {
      ok: false,
      reason: reason(
        "UNKNOWN_TRANSFORM",
        null,
        "transformRuleId",
        "The transform is not in the closed reviewed registry",
      ),
    };
  }

  const leftProjection = normalizedIntegerThresholdProjection(left);
  const rightProjection = normalizedIntegerThresholdProjection(right);
  if (
    leftProjection === null ||
    rightProjection === null ||
    canonicalJson(leftProjection as unknown as JsonValue) !==
      canonicalJson(rightProjection as unknown as JsonValue)
  ) {
    return {
      ok: false,
      reason: reason(
        "TRANSFORM_NOT_APPLICABLE",
        null,
        "settlementSpec",
        "The reviewed integer threshold transform does not exactly unify these specs",
      ),
    };
  }

  return {
    ok: true,
    fingerprint: sha256Canonical({
      schemaVersion: "reviewed-settlement-transform-v1",
      transformRuleId,
      projection: leftProjection,
    } as unknown as JsonValue),
  };
}

function normalizedIntegerThresholdProjection(
  spec: SettlementSpecV1,
): SettlementSemanticProjectionV1 | null {
  const parsed = parseSettlementSpec(spec);
  const proposition = parsed.proposition;
  if (
    proposition.unit !== "count" ||
    proposition.roundingRuleId !== "integer-exact" ||
    proposition.threshold === null ||
    !/^-?(?:0|[1-9][0-9]*)$/.test(proposition.threshold) ||
    (proposition.comparator !== "gte" && proposition.comparator !== "gt")
  ) {
    return null;
  }

  const normalizedThreshold =
    proposition.comparator === "gt"
      ? (BigInt(proposition.threshold) + 1n).toString()
      : proposition.threshold;
  const projection = settlementSemanticProjection(parsed);
  return {
    ...projection,
    proposition: {
      ...projection.proposition,
      comparator: "gte",
      threshold: normalizedThreshold,
    },
  };
}

function staleReferenceReasons(
  stored: ContractRevisionRef,
  current: ContractRevisionRef,
  side: "left" | "right",
): ContractLinkReason[] {
  const reasons: ContractLinkReason[] = [];
  for (const field of Object.keys(stored) as (keyof ContractRevisionRef)[]) {
    if (stored[field] !== current[field]) {
      reasons.push(
        reason(
          "STALE_REFERENCE",
          side,
          field,
          `The ${side} ${field} changed after link review`,
        ),
      );
    }
  }
  return reasons;
}

function validateAssetPolicy(
  contract: LinkableContract,
  policy: AssetValuePolicy | null,
  now: number,
  side: "left" | "right",
): ContractLinkReason[] {
  if (policy === null) {
    return [reason("PAYOUT_POLICY_MISSING", side, "assetValuePolicy", `The ${side} policy is missing`)];
  }

  const reasons: ContractLinkReason[] = [];
  if (
    policy.network !== contract.payoutAsset.network ||
    policy.assetId !== contract.payoutAsset.assetId ||
    policy.assetRevision !== contract.payoutAsset.assetRevision
  ) {
    reasons.push(
      reason(
        "PAYOUT_POLICY_ASSET_MISMATCH",
        side,
        "assetValuePolicy",
        `The ${side} policy does not bind the current payout asset revision`,
      ),
    );
  }
  if (policy.validUntil <= now) {
    reasons.push(
      reason("PAYOUT_POLICY_EXPIRED", side, "validUntil", `The ${side} policy is expired`),
    );
  }
  if (
    !isNonemptyString(policy.version) ||
    !Number.isSafeInteger(policy.usdLowerBoundMicrosPerToken) ||
    policy.usdLowerBoundMicrosPerToken < 0 ||
    !Number.isSafeInteger(policy.usdUpperBoundMicrosPerToken) ||
    policy.usdUpperBoundMicrosPerToken < policy.usdLowerBoundMicrosPerToken ||
    !Number.isSafeInteger(policy.validUntil) ||
    !LOWERCASE_SHA256.test(policy.evidenceHash)
  ) {
    reasons.push(
      reason("PAYOUT_POLICY_INVALID", side, "assetValuePolicy", `The ${side} policy is malformed`),
    );
  }
  return reasons;
}

function reason(
  code: ContractLinkReasonCode,
  side: "left" | "right" | null,
  field: keyof ContractRevisionRef | string | null,
  message: string,
): ContractLinkReason {
  return Object.freeze({ code, side, field, message });
}

function unverified(reasons: readonly ContractLinkReason[]): ContractLinkVerification {
  return Object.freeze({ status: "UNVERIFIED", reasons: Object.freeze([...reasons]) });
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.trim() === value;
}
