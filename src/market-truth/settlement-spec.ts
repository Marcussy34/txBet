import { z } from "zod";

import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import type { Micros } from "@/core/money";

const NORMALIZED_KEY = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;
const CANONICAL_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/;
const MAX_SAFE_TIMESTAMP = Number.MAX_SAFE_INTEGER;

const normalizedKeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(NORMALIZED_KEY, "Expected a normalized registry key");
const opaqueIdSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.trim() === value, "Identifier must not have outer whitespace");
const safeNonnegativeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_SAFE_TIMESTAMP)
  .refine(Number.isSafeInteger, "Expected a safe integer");
const lowercaseSha256Schema = z
  .string()
  .regex(LOWERCASE_SHA256, "Expected lowercase SHA-256 hex");
const canonicalDecimalSchema = z
  .string()
  .regex(CANONICAL_DECIMAL, "Expected a canonical decimal")
  .refine((value) => value !== "-0", "Negative zero is not canonical");

const rulesSchema = z
  .object({
    drawRuleId: normalizedKeySchema,
    tieRuleId: normalizedKeySchema,
    deadHeatRuleId: normalizedKeySchema,
    sharedWinnerRuleId: normalizedKeySchema,
    postponementRuleId: normalizedKeySchema,
    abandonmentRuleId: normalizedKeySchema,
    cancellationRuleId: normalizedKeySchema,
    rescheduleRuleId: normalizedKeySchema,
    voidRuleId: normalizedKeySchema,
    qualificationRuleId: normalizedKeySchema,
    replacementRuleId: normalizedKeySchema,
    resolutionSourceId: normalizedKeySchema,
    resolutionDeadline: safeNonnegativeIntegerSchema.nullable(),
    disputeRuleId: normalizedKeySchema,
    revisionRuleId: normalizedKeySchema,
  })
  .strict();

const propositionSchema = z
  .object({
    familyId: normalizedKeySchema,
    statistic: normalizedKeySchema,
    comparator: z.enum(["none", "eq", "gt", "gte", "lt", "lte", "between"]),
    threshold: canonicalDecimalSchema.nullable(),
    lowerBound: canonicalDecimalSchema.nullable(),
    upperBound: canonicalDecimalSchema.nullable(),
    unit: normalizedKeySchema.nullable(),
    roundingRuleId: normalizedKeySchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.comparator === "none") {
      if (value.threshold !== null || value.lowerBound !== null || value.upperBound !== null) {
        context.addIssue({
          code: "custom",
          path: ["comparator"],
          message: "The none comparator cannot have thresholds or bounds",
        });
      }
      return;
    }

    if (value.comparator === "between") {
      if (value.threshold !== null || value.lowerBound === null || value.upperBound === null) {
        context.addIssue({
          code: "custom",
          path: ["comparator"],
          message: "The between comparator requires only lower and upper bounds",
        });
        return;
      }
      if (compareCanonicalDecimals(value.lowerBound, value.upperBound) >= 0) {
        context.addIssue({
          code: "custom",
          path: ["upperBound"],
          message: "The upper bound must be greater than the lower bound",
        });
      }
      return;
    }

    if (value.threshold === null || value.lowerBound !== null || value.upperBound !== null) {
      context.addIssue({
        code: "custom",
        path: ["comparator"],
        message: "This comparator requires exactly one threshold",
      });
    }
  });

export const settlementSpecV1Schema = z
  .object({
    schemaVersion: z.literal("world-cup-settlement-v1"),
    specVersion: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    competition: z
      .object({ id: normalizedKeySchema, edition: normalizedKeySchema })
      .strict(),
    stage: z
      .object({
        id: normalizedKeySchema.nullable(),
        group: normalizedKeySchema.nullable(),
        round: normalizedKeySchema.nullable(),
      })
      .strict(),
    fixtureId: normalizedKeySchema.nullable(),
    subject: z
      .object({
        kind: z.enum(["competition", "group", "fixture", "team", "player", "manager", "other"]),
        id: normalizedKeySchema,
        name: z
          .string()
          .min(1)
          .max(500)
          .refine((value) => value.trim() === value, "Name must not have outer whitespace"),
      })
      .strict(),
    proposition: propositionSchema,
    evaluation: z
      .object({
        period: normalizedKeySchema,
        startsAt: safeNonnegativeIntegerSchema.nullable(),
        endsAt: safeNonnegativeIntegerSchema.nullable(),
        includesStoppageTime: z.boolean(),
        includesExtraTime: z.boolean(),
        includesPenalties: z.boolean(),
      })
      .strict(),
    rules: rulesSchema,
    payout: z
      .object({
        valueUnit: z.literal("USD"),
        nominalMicrosPerShare: safeNonnegativeIntegerSchema.positive(),
      })
      .strict(),
    evidence: z
      .object({
        sourceUrl: z
          .string()
          .url()
          .refine((value) => {
            const protocol = new URL(value).protocol;
            return protocol === "https:" || protocol === "http:";
          }, "Evidence URL must use HTTP or HTTPS"),
        rawRuleTextHash: lowercaseSha256Schema,
        venueRevision: opaqueIdSchema,
        canonicalEntityMappingRevision: opaqueIdSchema,
        nativeIdentity: z
          .object({
            competitionId: opaqueIdSchema,
            stageId: opaqueIdSchema.nullable(),
            fixtureId: opaqueIdSchema.nullable(),
            subjectId: opaqueIdSchema,
            marketId: opaqueIdSchema,
            outcomeId: opaqueIdSchema,
            statisticId: opaqueIdSchema.nullable(),
          })
          .strict(),
        retrievedAt: safeNonnegativeIntegerSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const { startsAt, endsAt } = value.evaluation;
    if (startsAt !== null && endsAt !== null && startsAt > endsAt) {
      context.addIssue({
        code: "custom",
        path: ["evaluation", "endsAt"],
        message: "Evaluation end must not precede its start",
      });
    }
  });

export interface SettlementRuleSet {
  readonly drawRuleId: string;
  readonly tieRuleId: string;
  readonly deadHeatRuleId: string;
  readonly sharedWinnerRuleId: string;
  readonly postponementRuleId: string;
  readonly abandonmentRuleId: string;
  readonly cancellationRuleId: string;
  readonly rescheduleRuleId: string;
  readonly voidRuleId: string;
  readonly qualificationRuleId: string;
  readonly replacementRuleId: string;
  readonly resolutionSourceId: string;
  readonly resolutionDeadline: number | null;
  readonly disputeRuleId: string;
  readonly revisionRuleId: string;
}

export interface SettlementSpecV1 {
  readonly schemaVersion: "world-cup-settlement-v1";
  readonly specVersion: number;
  readonly competition: { readonly id: string; readonly edition: string };
  readonly stage: {
    readonly id: string | null;
    readonly group: string | null;
    readonly round: string | null;
  };
  readonly fixtureId: string | null;
  readonly subject: {
    readonly kind: "competition" | "group" | "fixture" | "team" | "player" | "manager" | "other";
    readonly id: string;
    readonly name: string;
  };
  readonly proposition: {
    readonly familyId: string;
    readonly statistic: string;
    readonly comparator: "none" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";
    readonly threshold: string | null;
    readonly lowerBound: string | null;
    readonly upperBound: string | null;
    readonly unit: string | null;
    readonly roundingRuleId: string;
  };
  readonly evaluation: {
    readonly period: string;
    readonly startsAt: number | null;
    readonly endsAt: number | null;
    readonly includesStoppageTime: boolean;
    readonly includesExtraTime: boolean;
    readonly includesPenalties: boolean;
  };
  readonly rules: SettlementRuleSet;
  readonly payout: {
    readonly valueUnit: "USD";
    readonly nominalMicrosPerShare: Micros;
  };
  readonly evidence: {
    readonly sourceUrl: string;
    readonly rawRuleTextHash: string;
    readonly venueRevision: string;
    readonly canonicalEntityMappingRevision: string;
    readonly nativeIdentity: {
      readonly competitionId: string;
      readonly stageId: string | null;
      readonly fixtureId: string | null;
      readonly subjectId: string;
      readonly marketId: string;
      readonly outcomeId: string;
      readonly statisticId: string | null;
    };
    readonly retrievedAt: number;
  };
}

export interface SettlementSemanticProjectionV1 {
  readonly competition: SettlementSpecV1["competition"];
  readonly stage: SettlementSpecV1["stage"];
  readonly fixtureId: string | null;
  readonly subject: Pick<SettlementSpecV1["subject"], "kind" | "id">;
  readonly proposition: SettlementSpecV1["proposition"];
  readonly evaluation: SettlementSpecV1["evaluation"];
  readonly rules: SettlementRuleSet;
  readonly payout: SettlementSpecV1["payout"];
}

export type SettlementNormalizationResult =
  | { readonly status: "VERIFIED"; readonly spec: SettlementSpecV1; readonly fingerprint: string }
  | {
      readonly status: "UNVERIFIED";
      readonly missingFields: readonly string[];
      readonly conflicts: readonly string[];
      readonly rawRuleTextHash: string;
      readonly venueRevision: string;
    };

export interface PayoutAsset {
  readonly network: string;
  readonly assetId: string;
  readonly symbol: string;
  readonly decimals: number;
  readonly assetRevision: string;
}

export interface AssetValuePolicy {
  readonly version: string;
  readonly network: string;
  readonly assetId: string;
  readonly assetRevision: string;
  readonly usdLowerBoundMicrosPerToken: Micros;
  readonly usdUpperBoundMicrosPerToken: Micros;
  readonly validUntil: number;
  readonly evidenceHash: string;
}

export interface LiveCanonicalContract {
  readonly contractRevisionId: string;
  readonly venueId: string;
  readonly contractId: string;
  readonly title: string;
  readonly outcome: "YES" | "NO";
  readonly status: "open" | "suspended" | "closed" | "resolved";
  readonly settlementSpec: SettlementSpecV1;
  readonly settlementFingerprint: string;
  readonly venueRevision: string;
  readonly rawRuleTextHash: string;
  readonly tradingClosesAt: number;
  readonly closeTimeRevision: string;
  readonly closeTimeEvidenceHash: string;
  readonly payoutAsset: PayoutAsset;
}

export function parseSettlementSpec(input: unknown): SettlementSpecV1 {
  const parsed = settlementSpecV1Schema.parse(input) as SettlementSpecV1;
  return deepFreeze(parsed);
}

export function settlementSemanticProjection(input: unknown): SettlementSemanticProjectionV1 {
  const spec = parseSettlementSpec(input);
  return deepFreeze({
    competition: spec.competition,
    stage: spec.stage,
    fixtureId: spec.fixtureId,
    subject: { kind: spec.subject.kind, id: spec.subject.id },
    proposition: spec.proposition,
    evaluation: spec.evaluation,
    rules: spec.rules,
    payout: spec.payout,
  });
}

export function settlementFingerprint(input: unknown): string {
  return sha256Canonical(settlementSemanticProjection(input) as unknown as JsonValue);
}

export function settlementProvenanceHash(input: unknown): string {
  const spec = parseSettlementSpec(input);
  return sha256Canonical({
    schemaVersion: "world-cup-settlement-provenance-v1",
    sourceUrl: spec.evidence.sourceUrl,
    rawRuleTextHash: spec.evidence.rawRuleTextHash,
    venueRevision: spec.evidence.venueRevision,
    canonicalEntityMappingRevision: spec.evidence.canonicalEntityMappingRevision,
    nativeIdentity: spec.evidence.nativeIdentity,
    retrievedAt: spec.evidence.retrievedAt,
  });
}

export function normalizeSettlementSpec(input: unknown): SettlementNormalizationResult {
  const parsed = settlementSpecV1Schema.safeParse(input);
  if (parsed.success) {
    const spec = deepFreeze(parsed.data as SettlementSpecV1);
    return Object.freeze({ status: "VERIFIED", spec, fingerprint: settlementFingerprint(spec) });
  }

  const missingFields = new Set<string>();
  const conflicts = new Set<string>();
  for (const issue of parsed.error.issues) {
    const path = issue.path.map(String).join(".") || "$";
    if (readPath(input, issue.path) === undefined) missingFields.add(path);
    else conflicts.add(path);
  }

  const evidence = readRecord(input)?.evidence;
  const evidenceRecord = readRecord(evidence);
  return Object.freeze({
    status: "UNVERIFIED",
    missingFields: Object.freeze([...missingFields].sort()),
    conflicts: Object.freeze([...conflicts].sort()),
    rawRuleTextHash:
      typeof evidenceRecord?.rawRuleTextHash === "string" ? evidenceRecord.rawRuleTextHash : "",
    venueRevision:
      typeof evidenceRecord?.venueRevision === "string" ? evidenceRecord.venueRevision : "",
  });
}

function compareCanonicalDecimals(left: string, right: string): -1 | 0 | 1 {
  const a = decimalFraction(left);
  const b = decimalFraction(right);
  const scale = Math.max(a.scale, b.scale);
  const leftScaled = a.value * 10n ** BigInt(scale - a.scale);
  const rightScaled = b.value * 10n ** BigInt(scale - b.scale);
  return leftScaled < rightScaled ? -1 : leftScaled > rightScaled ? 1 : 0;
}

function decimalFraction(value: string): { readonly value: bigint; readonly scale: number } {
  const negative = value.startsWith("-");
  const unsigned = negative ? value.slice(1) : value;
  const [whole, fractional = ""] = unsigned.split(".");
  const integer = BigInt(`${whole}${fractional}`);
  return { value: negative ? -integer : integer, scale: fractional.length };
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readPath(input: unknown, path: readonly PropertyKey[]): unknown {
  let current: unknown = input;
  for (const segment of path) {
    const record = readRecord(current);
    if (!record) return undefined;
    current = record[String(segment)];
  }
  return current;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
