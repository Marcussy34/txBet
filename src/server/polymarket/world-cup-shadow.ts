import { z } from "zod";

import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import {
  proveComplement,
  verifyContractLink,
  type ComplementProofOptions,
  type LinkableContract,
  type VerifiedContractLink,
} from "@/market-truth/contract-links";
import {
  normalizePolymarketBook,
  type NormalizedVenueBook,
  type PolymarketReviewedMarketIdentity,
} from "@/market-truth/quote-normalization";
import {
  scanWorldCupCandidate,
  type WorldCupScanSettings,
} from "@/market-truth/world-cup-scanner";
import {
  createPolymarketPublicClient,
  type PolymarketClobMarketSnapshot,
} from "@/venues/polymarket/public-client";
import { POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS } from "@/venues/polymarket/contracts";
import {
  polymarketConditionIdV1Schema,
  polymarketTokenIdV1Schema,
} from "@/venues/polymarket/public-schemas";

const REVIEW_ENV = "POLYMARKET_WORLD_CUP_SHADOW_REVIEW_JSON";
const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;
const CATALOG_REVISION =
  /^[1-9][0-9]*:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const NORMALIZED_WORLD_CUP_EDITION = /^[a-z0-9]+(?:[._:-][a-z0-9]+)*$/;
const MAX_PUBLIC_REASON_CODES = 64;
export const POLYMARKET_WORLD_CUP_SHADOW_CACHE_TTL_MS = 1_000;

type EnvSource = Readonly<Record<string, string | undefined>>;

const objectValue = z.custom<Record<string, unknown>>(
  (value) => value !== null && typeof value === "object" && !Array.isArray(value),
  "Expected an object",
);
const safeNonnegativeInteger = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .refine(Number.isSafeInteger, "Expected a safe integer");
const positiveSafeInteger = safeNonnegativeInteger.positive();
const reviewedIdentitySchema = z.strictObject({
  schemaVersion: z.literal("polymarket-reviewed-market-identity-v1"),
  catalogSchemaVersion: z.literal("polymarket-gamma-market-v1"),
  catalogContractId: z.string().regex(/^[1-9][0-9]*$/),
  catalogRevisionId: z.string().regex(CATALOG_REVISION),
  conditionId: polymarketConditionIdV1Schema,
  outcomeLabel: z.enum(["YES", "NO"]),
  tokenId: polymarketTokenIdV1Schema,
  tickSize: z.string().min(1).max(16),
  negRisk: z.boolean(),
  quantityScale: z.literal(6),
  reviewedAtEpochMs: safeNonnegativeInteger,
  evidenceHash: z.string().regex(LOWERCASE_SHA256),
});
const sourceSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("polymarket-public-book"),
    reviewedMarketIdentity: reviewedIdentitySchema,
  }),
  z.strictObject({
    kind: z.literal("reviewed-normalized-book"),
    quote: objectValue,
  }),
]);
const settingsSchema = z.strictObject({
  maxQuoteAgeMs: positiveSafeInteger.max(300_000),
  maxFutureSkewMs: safeNonnegativeInteger.max(60_000),
  closeBufferMs: safeNonnegativeInteger.max(86_400_000),
  maximumShares: z.strictObject({
    numerator: z.string().regex(/^[1-9][0-9]*$/),
    denominator: z.string().regex(/^[1-9][0-9]*$/),
  }),
  minGrossReturnBps: safeNonnegativeInteger,
  minGrossProfitMicros: safeNonnegativeInteger,
});
const reviewSchema = z.strictObject({
  schemaVersion: z.literal("polymarket-world-cup-shadow-review-v1"),
  competition: z.strictObject({
    id: z.literal("fifa-world-cup"),
    edition: z.string().min(1).max(64).regex(NORMALIZED_WORLD_CUP_EDITION),
  }),
  linkReview: z.strictObject({
    method: z.enum(["exact", "reviewed-transform"]),
    transformRuleId: z.string().min(1).max(200).nullable(),
    fingerprint: z.string().regex(LOWERCASE_SHA256),
  }),
  leftContract: objectValue,
  rightContract: objectValue,
  leftSource: sourceSchema,
  rightSource: sourceSchema,
  settings: settingsSchema,
});

type QuoteSource =
  | Readonly<{
      kind: "polymarket-public-book";
      reviewedMarketIdentity: PolymarketReviewedMarketIdentity;
    }>
  | Readonly<{
      kind: "reviewed-normalized-book";
      quote: NormalizedVenueBook;
    }>;

interface ReviewedShadowPlan {
  readonly competition: { readonly id: "fifa-world-cup"; readonly edition: string };
  readonly link: VerifiedContractLink;
  readonly leftContract: LinkableContract;
  readonly rightContract: LinkableContract;
  readonly leftSource: QuoteSource;
  readonly rightSource: QuoteSource;
  readonly settings: WorldCupScanSettings;
}

export interface PolymarketWorldCupShadowDependencies {
  readonly fetchExecutionMarketSnapshot: (
    tokenId: string,
  ) => Promise<PolymarketClobMarketSnapshot>;
}

export type PolymarketWorldCupShadowStatus =
  | Readonly<{
      status: "unconfigured";
      venue: "polymarket";
      mode: "SHADOW_ONLY";
      executable: false;
      liveData: false;
      reason: "POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED";
    }>
  | Readonly<{
      status: "unavailable";
      venue: "polymarket";
      mode: "SHADOW_ONLY";
      executable: false;
      liveData: false;
      reason:
        | "INVALID_POLYMARKET_WORLD_CUP_REVIEW"
        | "POLYMARKET_PUBLIC_READ_FAILED"
        | "POLYMARKET_PUBLIC_BOOK_REJECTED";
      reasonCodes?: readonly string[];
    }>
  | Readonly<{
      status: "scanned";
      venue: "polymarket";
      mode: "SHADOW_ONLY";
      executable: false;
      liveData: true;
      provenance: "polymarket-public-clob";
      verification: "PINNED_IDENTITY_LIVE_BOOK";
      liveBook: Readonly<{
        side: "left" | "right";
        observedAtMs: number;
        receivedAtMs: number;
        bookRevision: string;
        quoteEvidenceHash: string;
        marketIdentityHash: string;
      }>;
      scan:
        | Readonly<{
            status: "CANDIDATE";
            candidateHash: string;
            exactShares: Readonly<{ numerator: string; denominator: string }>;
            totalBookCostMicros: number;
            nominalPayoutMicros: number;
            grossProfitMicros: number;
            grossReturnBps: number;
            expiresAt: number;
            nonExecutableReasons: readonly string[];
          }>
        | Readonly<{
            status: "NO_CANDIDATE";
            reasonCodes: readonly string[];
          }>;
    }>;

const defaultDependencies: PolymarketWorldCupShadowDependencies = Object.freeze({
  async fetchExecutionMarketSnapshot(tokenId: string) {
    // The public client pins the official Gamma/CLOB hosts and performs no authenticated call.
    return createPolymarketPublicClient().fetchExecutionMarketSnapshot(tokenId);
  },
});

function unconfigured(): PolymarketWorldCupShadowStatus {
  return Object.freeze({
    status: "unconfigured",
    venue: "polymarket",
    mode: "SHADOW_ONLY",
    executable: false,
    liveData: false,
    reason: "POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED",
  });
}

function unavailable(
  reason: Extract<PolymarketWorldCupShadowStatus, { status: "unavailable" }>["reason"],
  reasonCodes?: readonly string[],
): PolymarketWorldCupShadowStatus {
  return Object.freeze({
    status: "unavailable",
    venue: "polymarket",
    mode: "SHADOW_ONLY",
    executable: false,
    liveData: false,
    reason,
    ...(reasonCodes === undefined
      ? {}
      : { reasonCodes: boundedReasonCodes(reasonCodes) }),
  });
}

function boundedReasonCodes(reasonCodes: readonly string[]): readonly string[] {
  return Object.freeze(
    [...new Set(reasonCodes)].slice(0, MAX_PUBLIC_REASON_CODES),
  );
}

function identityProjection(identity: PolymarketReviewedMarketIdentity): JsonValue {
  return {
    schemaVersion: identity.schemaVersion,
    catalogSchemaVersion: identity.catalogSchemaVersion,
    catalogContractId: identity.catalogContractId,
    catalogRevisionId: identity.catalogRevisionId,
    conditionId: identity.conditionId,
    outcomeLabel: identity.outcomeLabel,
    tokenId: identity.tokenId,
    tickSize: identity.tickSize,
    negRisk: identity.negRisk,
    quantityScale: identity.quantityScale,
    reviewedAtEpochMs: identity.reviewedAtEpochMs,
  };
}

function identityBindsContract(
  identity: PolymarketReviewedMarketIdentity,
  contract: LinkableContract,
  nowMs: number,
): boolean {
  try {
    return (
      sha256Canonical(identityProjection(identity)) === identity.evidenceHash &&
      identity.reviewedAtEpochMs <= nowMs &&
      nowMs - identity.reviewedAtEpochMs <=
        POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS &&
      identity.catalogRevisionId.startsWith(`${identity.catalogContractId}:`) &&
      contract.reference.venueId === "polymarket" &&
      contract.reference.contractId === identity.catalogContractId &&
      contract.reference.venueRevision === identity.catalogRevisionId &&
      contract.reference.marketIdentityHash === identity.evidenceHash &&
      contract.outcome === identity.outcomeLabel &&
      contract.settlementSpec.evidence.nativeIdentity.marketId ===
        identity.catalogContractId &&
      contract.settlementSpec.evidence.nativeIdentity.outcomeId === identity.tokenId
    );
  } catch {
    return false;
  }
}

function sourceMatchesContract(
  source: QuoteSource,
  contract: LinkableContract,
  nowMs: number,
): boolean {
  if (source.kind === "polymarket-public-book") {
    return identityBindsContract(source.reviewedMarketIdentity, contract, nowMs);
  }
  return contract.reference.venueId !== "polymarket";
}

function parseReviewedPlan(value: string, nowMs: number): ReviewedShadowPlan {
  const decoded = JSON.parse(value) as unknown;
  const parsed = reviewSchema.parse(decoded);
  const leftContract = parsed.leftContract as unknown as LinkableContract;
  const rightContract = parsed.rightContract as unknown as LinkableContract;
  const leftSource = parsed.leftSource as unknown as QuoteSource;
  const rightSource = parsed.rightSource as unknown as QuoteSource;
  const polymarketSourceCount = [leftSource, rightSource].filter(
    (source) => source.kind === "polymarket-public-book",
  ).length;
  if (
    polymarketSourceCount !== 1 ||
    !sourceMatchesContract(leftSource, leftContract, nowMs) ||
    !sourceMatchesContract(rightSource, rightContract, nowMs) ||
    leftContract.settlementSpec.competition.id !== parsed.competition.id ||
    leftContract.settlementSpec.competition.edition !== parsed.competition.edition ||
    rightContract.settlementSpec.competition.id !== parsed.competition.id ||
    rightContract.settlementSpec.competition.edition !== parsed.competition.edition
  ) {
    throw new Error("Reviewed World Cup source binding is invalid");
  }

  const proofOptions: ComplementProofOptions = {
    method: parsed.linkReview.method,
    transformRuleId: parsed.linkReview.transformRuleId,
  };
  const proof = proveComplement(leftContract, rightContract, proofOptions);
  if (
    proof.status !== "VERIFIED" ||
    proof.fingerprint !== parsed.linkReview.fingerprint ||
    verifyContractLink(proof, leftContract, rightContract, nowMs).status !== "VERIFIED"
  ) {
    throw new Error("Reviewed World Cup link is no longer current");
  }

  return Object.freeze({
    competition: Object.freeze({ ...parsed.competition }),
    link: proof,
    leftContract,
    rightContract,
    leftSource,
    rightSource,
    settings: parsed.settings as WorldCupScanSettings,
  });
}

function liveSource(plan: ReviewedShadowPlan): Readonly<{
  side: "left" | "right";
  contract: LinkableContract;
  identity: PolymarketReviewedMarketIdentity;
}> {
  if (plan.leftSource.kind === "polymarket-public-book") {
    return Object.freeze({
      side: "left",
      contract: plan.leftContract,
      identity: plan.leftSource.reviewedMarketIdentity,
    });
  }
  if (plan.rightSource.kind !== "polymarket-public-book") {
    throw new Error("A reviewed Polymarket source is required");
  }
  return Object.freeze({
    side: "right",
    contract: plan.rightContract,
    identity: plan.rightSource.reviewedMarketIdentity,
  });
}

function readClock(clock: () => number): number {
  const nowMs = clock();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("Polymarket shadow clock must return epoch milliseconds");
  }
  return nowMs;
}

function summarizeScan(
  result: ReturnType<typeof scanWorldCupCandidate>,
): Extract<PolymarketWorldCupShadowStatus, { status: "scanned" }>["scan"] {
  if (result.status === "NO_CANDIDATE") {
    return Object.freeze({
      status: "NO_CANDIDATE",
      reasonCodes: boundedReasonCodes(
        result.reasons.map((reason) => reason.code),
      ),
    });
  }
  const { candidate } = result;
  return Object.freeze({
    status: "CANDIDATE",
    candidateHash: candidate.candidateHash,
    exactShares: Object.freeze({ ...candidate.exactShares }),
    totalBookCostMicros: candidate.totalBookCostMicros,
    nominalPayoutMicros: candidate.nominalPayoutMicros,
    grossProfitMicros: candidate.grossProfitMicros,
    grossReturnBps: candidate.grossReturnBps,
    expiresAt: candidate.expiresAt,
    nonExecutableReasons: Object.freeze([...candidate.nonExecutableReasons]),
  });
}

/**
 * Read one explicitly reviewed World Cup pair. This surface has public-read and
 * deterministic scan capabilities only; it cannot sign, approve, submit, or cancel.
 */
export async function readPolymarketWorldCupShadowStatus(
  options: Readonly<{
    source?: EnvSource;
    nowMs?: number;
    clock?: () => number;
    dependencies?: PolymarketWorldCupShadowDependencies;
  }> = {},
): Promise<PolymarketWorldCupShadowStatus> {
  const source = options.source ?? process.env;
  const review = source[REVIEW_ENV];
  // Empty deployment placeholders mean no reviewed catalog has been supplied yet.
  if (review === undefined || review.trim().length === 0) return unconfigured();

  if (options.nowMs !== undefined && options.clock !== undefined) {
    return unavailable("INVALID_POLYMARKET_WORLD_CUP_REVIEW");
  }
  const clock =
    options.clock ??
    (options.nowMs === undefined ? Date.now : () => options.nowMs!);

  let reviewNowMs: number;
  try {
    reviewNowMs = readClock(clock);
  } catch {
    return unavailable("INVALID_POLYMARKET_WORLD_CUP_REVIEW");
  }

  let plan: ReviewedShadowPlan;
  try {
    plan = parseReviewedPlan(review, reviewNowMs);
  } catch {
    return unavailable("INVALID_POLYMARKET_WORLD_CUP_REVIEW");
  }

  const publicSource = liveSource(plan);
  let snapshot: PolymarketClobMarketSnapshot;
  try {
    snapshot = await (options.dependencies ?? defaultDependencies)
      .fetchExecutionMarketSnapshot(publicSource.identity.tokenId);
  } catch {
    return unavailable("POLYMARKET_PUBLIC_READ_FAILED");
  }

  let decisionNowMs: number;
  try {
    decisionNowMs = readClock(clock);
    if (
      decisionNowMs < reviewNowMs ||
      !identityBindsContract(
        publicSource.identity,
        publicSource.contract,
        decisionNowMs,
      )
    ) {
      return unavailable("INVALID_POLYMARKET_WORLD_CUP_REVIEW");
    }
  } catch {
    return unavailable("INVALID_POLYMARKET_WORLD_CUP_REVIEW");
  }

  const normalized = normalizePolymarketBook({
    contract: publicSource.contract,
    reviewedMarketIdentity: publicSource.identity,
    snapshot,
  });
  if (!normalized.ok) {
    return unavailable(
      "POLYMARKET_PUBLIC_BOOK_REJECTED",
      normalized.reasons.map((reason) => reason.code),
    );
  }

  const leftQuote =
    plan.leftSource.kind === "polymarket-public-book"
      ? normalized.quote
      : plan.leftSource.quote;
  const rightQuote =
    plan.rightSource.kind === "polymarket-public-book"
      ? normalized.quote
      : plan.rightSource.quote;
  const scan = scanWorldCupCandidate({
    competition: plan.competition,
    link: plan.link,
    leftContract: plan.leftContract,
    rightContract: plan.rightContract,
    leftQuote,
    rightQuote,
    now: decisionNowMs,
    settings: plan.settings,
  });

  return Object.freeze({
    status: "scanned",
    venue: "polymarket",
    mode: "SHADOW_ONLY",
    executable: false,
    liveData: true,
    provenance: "polymarket-public-clob",
    verification: "PINNED_IDENTITY_LIVE_BOOK",
    liveBook: Object.freeze({
      side: publicSource.side,
      observedAtMs: normalized.quote.sourceUpdatedAt,
      receivedAtMs: normalized.quote.receivedAt,
      bookRevision: normalized.quote.bookRevision,
      quoteEvidenceHash: normalized.quote.evidenceHash,
      marketIdentityHash: normalized.quote.marketIdentityHash!,
    }),
    scan: summarizeScan(scan),
  });
}

type ShadowStatusReader = () => Promise<PolymarketWorldCupShadowStatus>;

/** Coalesces identical route reads and retains only a one-second public status. */
export function createPolymarketWorldCupShadowReader(
  options: Readonly<{
    read?: ShadowStatusReader;
    clock?: () => number;
  }> = {},
): ShadowStatusReader {
  const read = options.read ?? readPolymarketWorldCupShadowStatus;
  const clock = options.clock ?? Date.now;
  let entry:
    | {
        readonly promise: Promise<PolymarketWorldCupShadowStatus>;
        settled: boolean;
        validUntilMs: number;
      }
    | undefined;

  return () => {
    const nowMs = readClock(clock);
    if (entry !== undefined && (!entry.settled || nowMs < entry.validUntilMs)) {
      return entry.promise;
    }

    let promise: Promise<PolymarketWorldCupShadowStatus>;
    try {
      promise = read();
    } catch (error) {
      return Promise.reject(error);
    }
    const next = {
      promise,
      settled: false,
      validUntilMs: Math.min(
        Number.MAX_SAFE_INTEGER,
        nowMs + POLYMARKET_WORLD_CUP_SHADOW_CACHE_TTL_MS,
      ),
    };
    entry = next;
    void promise.then(
      (status) => {
        next.settled = true;
        if (status.status === "scanned" && status.scan.status === "CANDIDATE") {
          next.validUntilMs = Math.min(next.validUntilMs, status.scan.expiresAt);
        }
      },
      () => {
        if (entry === next) entry = undefined;
      },
    );
    return promise;
  };
}

export const readCachedPolymarketWorldCupShadowStatus =
  createPolymarketWorldCupShadowReader();
