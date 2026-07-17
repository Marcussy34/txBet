import { createHash } from "node:crypto";

import { canonicalJson, type JsonValue } from "@/core/canonical-json";
import type { LiveVenueId } from "@/contracts/venues";

export type OperationKind = "entry" | "cancel" | "compensation" | "redemption";
export type RecoveryOperationKind = Exclude<OperationKind, "entry">;
export type ScopeKey = string;

interface BundleScopeInput {
  readonly profileId: string;
  readonly strategyId: string;
  readonly opportunityId: string;
  readonly bundleHash: string;
}

const SHA256_HEX = /^[a-f0-9]{64}$/;
const FORBIDDEN_SEMANTIC_IDENTITY_FIELDS = new Set([
  "operationId",
  "cancellationId",
  "compensationId",
  "redemptionId",
  "attemptKey",
  "submissionKey",
  "artifactHash",
  "semanticHash",
  "operationScopeKey",
  "recordHash",
]);

function requirePart(value: string, label: string): string {
  if (value.trim().length === 0) throw new Error(`${label} cannot be empty`);
  return value;
}

function hashTuple(tuple: readonly JsonValue[]): ScopeKey {
  return createHash("sha256").update(canonicalJson(tuple)).digest("hex");
}

export function deriveBundleScopeKey(input: BundleScopeInput): ScopeKey {
  return hashTuple([
    "entry-bundle-scope-v1",
    requirePart(input.profileId, "Profile ID"),
    requirePart(input.strategyId, "Strategy ID"),
    requirePart(input.opportunityId, "Opportunity ID"),
    requirePart(input.bundleHash, "Bundle hash"),
  ]);
}

export function deriveLegScopeKey(
  bundleScopeKey: ScopeKey,
  legIndex: 0 | 1,
): ScopeKey {
  if (legIndex !== 0 && legIndex !== 1) {
    throw new Error("Entry leg index must be exactly 0 or 1");
  }
  return hashTuple([
    "entry-leg-scope-v1",
    requirePart(bundleScopeKey, "Bundle scope key"),
    legIndex,
  ]);
}

function assertNonCircularSemantics(value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNonCircularSemantics(item);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_SEMANTIC_IDENTITY_FIELDS.has(key)) {
        throw new Error(`Recovery semantic intent contains forbidden identity field: ${key}`);
      }
      assertNonCircularSemantics(child);
    }
  }
}

export function deriveRecoverySemanticHash(
  kind: RecoveryOperationKind,
  semanticIntent: JsonValue,
): ScopeKey {
  assertNonCircularSemantics(semanticIntent);
  return hashTuple(["recovery-semantic-hash-v1", kind, semanticIntent]);
}

export function deriveRecoveryOperationScopeKey(
  profileId: string,
  kind: RecoveryOperationKind,
  semanticHash: string,
): ScopeKey {
  if (!SHA256_HEX.test(semanticHash)) {
    throw new Error("Recovery semantic hash must be lowercase SHA-256 hex");
  }
  return hashTuple([
    "recovery-operation-scope-v1",
    requirePart(profileId, "Profile ID"),
    kind,
    semanticHash,
  ]);
}

export function deriveCancellationCostBudgetSubjectKey(
  profileId: string,
  originalAttemptKey: string,
  originalOrderRevision: string,
): ScopeKey {
  return hashTuple([
    "cancel-cost-budget-v1",
    requirePart(profileId, "Profile ID"),
    requirePart(originalAttemptKey, "Original attempt key"),
    requirePart(originalOrderRevision, "Original order revision"),
  ]);
}

export function deriveCancellationOperationSubjectKey(
  profileId: string,
  originalAttemptKey: string,
  originalOrderRevision: string,
): ScopeKey {
  return hashTuple([
    "cancel-operation-subject-v1",
    requirePart(profileId, "Profile ID"),
    requirePart(originalAttemptKey, "Original attempt key"),
    requirePart(originalOrderRevision, "Original order revision"),
  ]);
}

export function deriveRedemptionCostBudgetSubjectKey(
  profileId: string,
  venue: LiveVenueId,
  positionRevision: string,
): ScopeKey {
  return hashTuple([
    "redemption-cost-budget-v1",
    requirePart(profileId, "Profile ID"),
    venue,
    requirePart(positionRevision, "Position revision"),
  ]);
}

export function deriveAttemptKey(
  operationKind: OperationKind,
  subjectScopeKey: ScopeKey,
  attemptOrdinal: number,
): ScopeKey {
  if (!Number.isSafeInteger(attemptOrdinal) || attemptOrdinal < 0) {
    throw new Error("Attempt ordinal must be a nonnegative safe integer");
  }
  return hashTuple([
    "operation-attempt-key-v1",
    operationKind,
    requirePart(subjectScopeKey, "Subject scope key"),
    attemptOrdinal,
  ]);
}

export function deriveSubmissionKey(
  attemptKey: ScopeKey,
  artifactHash: string,
): ScopeKey {
  if (!SHA256_HEX.test(attemptKey)) {
    throw new Error("Attempt key must be lowercase SHA-256 hex");
  }
  if (!SHA256_HEX.test(artifactHash)) {
    throw new Error("Artifact hash must be lowercase SHA-256 hex");
  }
  return hashTuple(["operation-submission-key-v1", attemptKey, artifactHash]);
}
