import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import {
  ceilRatioProductMicros,
  createExactShares,
  venueQuantity,
  type AtomicAmount,
  type ExactShares,
  type VenueQuantity,
} from "@/core/live-money";
import type { Micros } from "@/core/money";
import {
  verifyContractLink,
  type LinkableContract,
  type VerifiedContractLink,
} from "@/market-truth/contract-links";
import {
  POLYMARKET_QUANTITY_SCALE,
  type NormalizedBookLevel,
  type NormalizedVenueBook,
} from "@/market-truth/quote-normalization";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;
const WORLD_CUP_COMPETITION_ID = "fifa-world-cup";
const MINIMUM_GROSS_RETURN_BPS = 100;
const MINIMUM_GROSS_PROFIT_MICROS = 100_000;

export interface WorldCupScanSettings {
  readonly maxQuoteAgeMs: number;
  readonly maxFutureSkewMs: number;
  readonly closeBufferMs: number;
  readonly maximumShares: ExactShares;
  readonly minGrossReturnBps: number;
  readonly minGrossProfitMicros: Micros;
}

export interface WorldCupScanInput {
  readonly competition: {
    readonly id: string;
    readonly edition: string;
  };
  readonly link: VerifiedContractLink;
  readonly leftContract: LinkableContract;
  readonly rightContract: LinkableContract;
  readonly leftQuote: NormalizedVenueBook;
  readonly rightQuote: NormalizedVenueBook;
  readonly now: number;
  readonly settings: WorldCupScanSettings;
}

export type WorldCupScanReasonCode =
  | "INVALID_SETTINGS"
  | "NOT_WORLD_CUP"
  | "LINK_NOT_CURRENT"
  | "QUOTE_BINDING_MISMATCH"
  | "QUOTE_STALE"
  | "QUOTE_FROM_FUTURE"
  | "CLOSE_BUFFER_REACHED"
  | "MAXIMUM_SHARES_NOT_REPRESENTABLE"
  | "INSUFFICIENT_LIQUIDITY"
  | "GROSS_THRESHOLDS_NOT_MET"
  | "UNSAFE_ARITHMETIC"
  | "SCAN_FAILED";

export interface WorldCupScanReason {
  readonly code: WorldCupScanReasonCode;
  readonly side: "left" | "right" | null;
  readonly message: string;
}

export type ShadowNonExecutableReason =
  | "ASSET_VALUE_POLICY_NOT_BOUND"
  | "VENUE_FEES_NOT_INCLUDED"
  | "NETWORK_COST_NOT_INCLUDED"
  | "LIVE_EXECUTION_NOT_AUTHORIZED";

export interface WorldCupScanCandidateLeg {
  readonly venueId: string;
  readonly contractId: string;
  readonly sourceOutcomeId: string;
  readonly bookRevision: string;
  readonly quoteEvidenceHash: string;
  readonly marketIdentityHash: string | null;
  readonly quantity: VenueQuantity;
  readonly bookCostMicros: Micros;
}

export interface WorldCupScanCandidate {
  readonly schemaVersion: "world-cup-scan-candidate-v1";
  readonly executionStatus: "SHADOW_ONLY";
  readonly costScope: "BOOK_PRICE_ONLY";
  readonly detectedAt: number;
  readonly expiresAt: number;
  readonly competition: {
    readonly id: string;
    readonly edition: string;
  };
  readonly linkFingerprint: string;
  readonly exactShares: ExactShares;
  readonly left: WorldCupScanCandidateLeg;
  readonly right: WorldCupScanCandidateLeg;
  readonly totalBookCostMicros: Micros;
  readonly nominalPayoutMicros: Micros;
  readonly grossProfitMicros: Micros;
  readonly grossReturnBps: number;
  readonly nonExecutableReasons: readonly ShadowNonExecutableReason[];
  readonly candidateHash: string;
}

export type WorldCupScanResult =
  | { readonly status: "CANDIDATE"; readonly candidate: WorldCupScanCandidate }
  | {
      readonly status: "NO_CANDIDATE";
      readonly reasons: readonly WorldCupScanReason[];
    };

interface CommonBookLevel {
  readonly priceMicrosPerShare: bigint;
  readonly startAtomic: bigint;
  readonly endAtomic: bigint;
  readonly costBeforeNumerator: bigint;
}

interface CommonBookCurve {
  readonly levels: readonly CommonBookLevel[];
  readonly totalAtomic: bigint;
  readonly boundaries: readonly bigint[];
}

interface CandidateNumbers {
  readonly commonAtomic: bigint;
  readonly leftCostMicros: Micros;
  readonly rightCostMicros: Micros;
  readonly totalBookCostMicros: Micros;
  readonly nominalPayoutMicros: Micros;
  readonly grossProfitMicros: Micros;
  readonly grossReturnBps: number;
}

/**
 * Scan one current reviewed World Cup link using immutable book evidence.
 * The result is intentionally shadow-only because fees, asset valuation, and execution are out of scope.
 */
export function scanWorldCupCandidate(input: WorldCupScanInput): WorldCupScanResult {
  try {
    const settingsReason = validateSettings(input);
    if (settingsReason !== null) return noCandidate([settingsReason]);

    if (!hasExpectedCompetition(input)) {
      return noCandidate([
        scanReason(
          "NOT_WORLD_CUP",
          null,
          "Both reviewed contracts must match the requested canonical World Cup edition",
        ),
      ]);
    }

    const currentLink = verifyContractLink(
      input.link,
      input.leftContract,
      input.rightContract,
      input.now,
    );
    if (currentLink.status !== "VERIFIED") {
      const codes = currentLink.reasons.map((item) => item.code).join(",");
      return noCandidate([
        scanReason(
          "LINK_NOT_CURRENT",
          null,
          `The reviewed link is no longer current (${codes})`,
        ),
      ]);
    }

    if (
      closeBufferReached(
        input.now,
        input.settings.closeBufferMs,
        input.leftContract,
      ) ||
      closeBufferReached(
        input.now,
        input.settings.closeBufferMs,
        input.rightContract,
      )
    ) {
      return noCandidate([
        scanReason(
          "CLOSE_BUFFER_REACHED",
          null,
          "At least one venue is inside the configured order-entry close buffer",
        ),
      ]);
    }

    const bindingReasons = [
      ...quoteBindingReasons(input.leftQuote, input.leftContract, "left"),
      ...quoteBindingReasons(input.rightQuote, input.rightContract, "right"),
    ];
    if (bindingReasons.length > 0) return noCandidate(bindingReasons);

    const freshnessReasons = [
      ...quoteFreshnessReasons(
        input.leftQuote,
        input.now,
        input.settings.maxQuoteAgeMs,
        input.settings.maxFutureSkewMs,
        "left",
      ),
      ...quoteFreshnessReasons(
        input.rightQuote,
        input.now,
        input.settings.maxQuoteAgeMs,
        input.settings.maxFutureSkewMs,
        "right",
      ),
    ];
    if (freshnessReasons.length > 0) return noCandidate(freshnessReasons);

    return scanExactDepth(input);
  } catch {
    return noCandidate([
      scanReason(
        "SCAN_FAILED",
        null,
        "The candidate scan could not complete without ambiguity",
      ),
    ]);
  }
}

function scanExactDepth(input: WorldCupScanInput): WorldCupScanResult {
  const commonScale = Math.max(
    input.leftQuote.quantityScale,
    input.rightQuote.quantityScale,
  );
  const scaleFactor = 10n ** BigInt(commonScale);
  const leftStep = 10n ** BigInt(commonScale - input.leftQuote.quantityScale);
  const rightStep = 10n ** BigInt(commonScale - input.rightQuote.quantityScale);
  const sharedStep = leftStep > rightStep ? leftStep : rightStep;

  const maximumAtomic = exactSharesToAtomic(
    input.settings.maximumShares,
    commonScale,
  );
  if (maximumAtomic === null || maximumAtomic % sharedStep !== 0n) {
    return noCandidate([
      scanReason(
        "MAXIMUM_SHARES_NOT_REPRESENTABLE",
        null,
        "Maximum shares must be exactly representable on both venue quantity grids",
      ),
    ]);
  }

  const leftCurve = buildCurve(input.leftQuote, commonScale);
  const rightCurve = buildCurve(input.rightQuote, commonScale);
  const leftMinimum = toCommonAtomic(
    input.leftQuote.minimumOrderQuantity,
    commonScale,
  );
  const rightMinimum = toCommonAtomic(
    input.rightQuote.minimumOrderQuantity,
    commonScale,
  );
  const minimumRaw = leftMinimum > rightMinimum ? leftMinimum : rightMinimum;
  const minimumCandidate = ceilToStep(minimumRaw, sharedStep);
  const available = minBigInt(
    leftCurve.totalAtomic,
    rightCurve.totalAtomic,
    maximumAtomic,
  );
  const maximumCandidate = floorToStep(available, sharedStep);
  if (maximumCandidate < minimumCandidate || maximumCandidate === 0n) {
    return noCandidate([
      scanReason(
        "INSUFFICIENT_LIQUIDITY",
        null,
        "Exact shared depth does not satisfy both venue minimum order sizes",
      ),
    ]);
  }

  const boundarySet = new Set<string>();
  addBoundary(boundarySet, minimumCandidate, minimumCandidate, maximumCandidate, sharedStep);
  addBoundary(boundarySet, maximumCandidate, minimumCandidate, maximumCandidate, sharedStep);
  for (const boundary of [...leftCurve.boundaries, ...rightCurve.boundaries]) {
    addBoundary(boundarySet, boundary, minimumCandidate, maximumCandidate, sharedStep);
  }
  const boundaries = [...boundarySet]
    .map((value) => BigInt(value))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

  const minimumProfit = Math.max(
    input.settings.minGrossProfitMicros,
    MINIMUM_GROSS_PROFIT_MICROS,
  );
  const minimumReturn = Math.max(
    input.settings.minGrossReturnBps,
    MINIMUM_GROSS_RETURN_BPS,
  );
  let best: CandidateNumbers | null = null;
  for (const commonAtomic of boundaries) {
    const leftCost = ceilDivide(
      costNumeratorAt(leftCurve, commonAtomic),
      scaleFactor,
    );
    const rightCost = ceilDivide(
      costNumeratorAt(rightCurve, commonAtomic),
      scaleFactor,
    );
    const totalCost = leftCost + rightCost;
    const nominalPayout =
      (BigInt(
        input.leftContract.settlementSpec.payout.nominalMicrosPerShare,
      ) *
        commonAtomic) /
      scaleFactor;
    if (nominalPayout <= totalCost || totalCost <= 0n) continue;

    const profit = nominalPayout - totalCost;
    const grossReturnBps = safeNumber((profit * 10_000n) / totalCost);
    const candidate: CandidateNumbers = Object.freeze({
      commonAtomic,
      leftCostMicros: safeMicros(leftCost),
      rightCostMicros: safeMicros(rightCost),
      totalBookCostMicros: safeMicros(totalCost),
      nominalPayoutMicros: safeMicros(nominalPayout),
      grossProfitMicros: safeMicros(profit),
      grossReturnBps,
    });
    if (
      candidate.grossProfitMicros < minimumProfit ||
      candidate.grossReturnBps < minimumReturn
    ) {
      continue;
    }
    if (isBetterCandidate(candidate, best)) best = candidate;
  }

  if (best === null) {
    return noCandidate([
      scanReason(
        "GROSS_THRESHOLDS_NOT_MET",
        null,
        "No exact shared-depth prefix meets the hard gross profit and return floors",
      ),
    ]);
  }

  return candidateResult(input, best, commonScale);
}

function candidateResult(
  input: WorldCupScanInput,
  values: CandidateNumbers,
  commonScale: number,
): WorldCupScanResult {
  const exactShares = createExactShares(
    values.commonAtomic.toString(),
    (10n ** BigInt(commonScale)).toString(),
  );
  const leftQuantity = quantityAtVenueScale(
    values.commonAtomic,
    commonScale,
    input.leftQuote.quantityScale,
  );
  const rightQuantity = quantityAtVenueScale(
    values.commonAtomic,
    commonScale,
    input.rightQuote.quantityScale,
  );
  const nonExecutableReasons = Object.freeze([
    "ASSET_VALUE_POLICY_NOT_BOUND",
    "VENUE_FEES_NOT_INCLUDED",
    "NETWORK_COST_NOT_INCLUDED",
    "LIVE_EXECUTION_NOT_AUTHORIZED",
  ] satisfies readonly ShadowNonExecutableReason[]);
  const expiresAt = earliestExpiry(input);
  const left = Object.freeze({
    venueId: input.leftQuote.venueId,
    contractId: input.leftQuote.contractId,
    sourceOutcomeId: input.leftQuote.sourceOutcomeId,
    bookRevision: input.leftQuote.bookRevision,
    quoteEvidenceHash: input.leftQuote.evidenceHash,
    marketIdentityHash: input.leftQuote.marketIdentityHash,
    quantity: leftQuantity,
    bookCostMicros: values.leftCostMicros,
  });
  const right = Object.freeze({
    venueId: input.rightQuote.venueId,
    contractId: input.rightQuote.contractId,
    sourceOutcomeId: input.rightQuote.sourceOutcomeId,
    bookRevision: input.rightQuote.bookRevision,
    quoteEvidenceHash: input.rightQuote.evidenceHash,
    marketIdentityHash: input.rightQuote.marketIdentityHash,
    quantity: rightQuantity,
    bookCostMicros: values.rightCostMicros,
  });
  const projection = {
    schemaVersion: "world-cup-scan-candidate-v1",
    executionStatus: "SHADOW_ONLY",
    costScope: "BOOK_PRICE_ONLY",
    detectedAt: input.now,
    expiresAt,
    competition: input.competition,
    linkFingerprint: input.link.fingerprint,
    exactShares,
    left,
    right,
    totalBookCostMicros: values.totalBookCostMicros,
    nominalPayoutMicros: values.nominalPayoutMicros,
    grossProfitMicros: values.grossProfitMicros,
    grossReturnBps: values.grossReturnBps,
    nonExecutableReasons,
  } as const;
  const candidate = Object.freeze({
    ...projection,
    candidateHash: sha256Canonical(projection as unknown as JsonValue),
  });
  return Object.freeze({ status: "CANDIDATE", candidate });
}

function validateSettings(input: WorldCupScanInput): WorldCupScanReason | null {
  const { settings } = input;
  if (
    !isSafeNonnegativeInteger(input.now) ||
    !isSafePositiveInteger(settings.maxQuoteAgeMs) ||
    settings.maxQuoteAgeMs > 300_000 ||
    !isSafeNonnegativeInteger(settings.maxFutureSkewMs) ||
    settings.maxFutureSkewMs > 60_000 ||
    !isSafeNonnegativeInteger(settings.closeBufferMs) ||
    settings.closeBufferMs > 86_400_000 ||
    !isSafeNonnegativeInteger(settings.minGrossReturnBps) ||
    !isSafeNonnegativeInteger(settings.minGrossProfitMicros)
  ) {
    return scanReason(
      "INVALID_SETTINGS",
      null,
      "Scanner times, thresholds, and bounds must be nonnegative safe integers",
    );
  }
  try {
    createExactShares(
      settings.maximumShares.numerator,
      settings.maximumShares.denominator,
    );
  } catch {
    return scanReason(
      "INVALID_SETTINGS",
      null,
      "Maximum shares must be a positive exact rational",
    );
  }
  return null;
}

function hasExpectedCompetition(input: WorldCupScanInput): boolean {
  const left = input.leftContract.settlementSpec.competition;
  const right = input.rightContract.settlementSpec.competition;
  return (
    input.competition.id === WORLD_CUP_COMPETITION_ID &&
    input.competition.edition.length > 0 &&
    left.id === input.competition.id &&
    left.edition === input.competition.edition &&
    right.id === input.competition.id &&
    right.edition === input.competition.edition
  );
}

function quoteBindingReasons(
  quote: NormalizedVenueBook,
  contract: LinkableContract,
  side: "left" | "right",
): readonly WorldCupScanReason[] {
  const expectedReferenceHash = sha256Canonical(
    contract.reference as unknown as JsonValue,
  );
  if (
    quote.schemaVersion !== "normalized-venue-book-v1" ||
    quote.venueId !== contract.reference.venueId ||
    quote.contractId !== contract.reference.contractId ||
    quote.contractReferenceHash !== expectedReferenceHash ||
    quote.settlementFingerprint !== contract.reference.settlementFingerprint ||
    quote.marketIdentityHash !== (contract.reference.marketIdentityHash ?? null) ||
    (quote.venueId === "polymarket" &&
      (quote.marketIdentityHash === null ||
        !LOWERCASE_SHA256.test(quote.marketIdentityHash) ||
        quote.quantityScale !== POLYMARKET_QUANTITY_SCALE)) ||
    !quoteIntegrityValid(quote)
  ) {
    return Object.freeze([
      scanReason(
        "QUOTE_BINDING_MISMATCH",
        side,
        `The ${side} quote does not bind the current reviewed contract and normalized evidence`,
      ),
    ]);
  }
  return Object.freeze([]);
}

function quoteIntegrityValid(quote: NormalizedVenueBook): boolean {
  try {
    if (
      !LOWERCASE_SHA256.test(quote.contractReferenceHash) ||
      !LOWERCASE_SHA256.test(quote.settlementFingerprint) ||
      !LOWERCASE_SHA256.test(quote.sourceMetadataHash) ||
      (quote.marketIdentityHash !== null &&
        !LOWERCASE_SHA256.test(quote.marketIdentityHash)) ||
      !LOWERCASE_SHA256.test(quote.evidenceHash) ||
      !isSafeNonnegativeInteger(quote.sourceUpdatedAt) ||
      !isSafeNonnegativeInteger(quote.receivedAt) ||
      !isSafePositiveInteger(quote.tickSizeMicros) ||
      quote.tickSizeMicros >= 1_000_000 ||
      !Number.isSafeInteger(quote.quantityScale) ||
      quote.quantityScale < 0 ||
      quote.quantityScale > 30 ||
      !quantityValid(quote.minimumOrderQuantity, quote.quantityScale) ||
      quote.bids.length > 10_000 ||
      quote.asks.length > 10_000 ||
      !levelsValid(quote.bids, quote, "descending") ||
      !levelsValid(quote.asks, quote, "ascending")
    ) {
      return false;
    }
    const evidence = {
      schemaVersion: "normalized-venue-book-evidence-v1",
      venueId: quote.venueId,
      contractId: quote.contractId,
      contractReferenceHash: quote.contractReferenceHash,
      settlementFingerprint: quote.settlementFingerprint,
      sourceMarketId: quote.sourceMarketId,
      sourceOutcomeId: quote.sourceOutcomeId,
      sourceUpdatedAt: quote.sourceUpdatedAt,
      receivedAt: quote.receivedAt,
      bookRevision: quote.bookRevision,
      tickSizeMicros: quote.tickSizeMicros,
      quantityScale: quote.quantityScale,
      minimumOrderQuantity: quote.minimumOrderQuantity,
      bids: quote.bids,
      asks: quote.asks,
      sourceMetadataHash: quote.sourceMetadataHash,
      marketIdentityHash: quote.marketIdentityHash,
    } as unknown as JsonValue;
    return sha256Canonical(evidence) === quote.evidenceHash;
  } catch {
    return false;
  }
}

function levelsValid(
  levels: readonly NormalizedBookLevel[],
  quote: NormalizedVenueBook,
  order: "ascending" | "descending",
): boolean {
  let previousPrice: number | null = null;
  for (const level of levels) {
    if (
      !isSafePositiveInteger(level.priceMicrosPerShare) ||
      level.priceMicrosPerShare >= 1_000_000 ||
      level.priceMicrosPerShare % quote.tickSizeMicros !== 0 ||
      !quantityValid(level.quantity, quote.quantityScale)
    ) {
      return false;
    }
    const expectedCost = ceilRatioProductMicros(
      {
        numerator: level.priceMicrosPerShare.toString() as AtomicAmount,
        denominator: "1",
      },
      level.quantity.exactShares,
    );
    if (expectedCost !== level.fullLevelCostMicros) return false;
    if (
      previousPrice !== null &&
      ((order === "ascending" && level.priceMicrosPerShare <= previousPrice) ||
        (order === "descending" && level.priceMicrosPerShare >= previousPrice))
    ) {
      return false;
    }
    previousPrice = level.priceMicrosPerShare;
  }
  return true;
}

function quantityValid(quantity: VenueQuantity, expectedScale: number): boolean {
  try {
    if (quantity.scale !== expectedScale) return false;
    const canonical = venueQuantity(quantity.atomic, quantity.scale);
    return (
      canonical.conversionEvidenceHash === quantity.conversionEvidenceHash &&
      canonical.exactShares.numerator === quantity.exactShares.numerator &&
      canonical.exactShares.denominator === quantity.exactShares.denominator
    );
  } catch {
    return false;
  }
}

function quoteFreshnessReasons(
  quote: NormalizedVenueBook,
  now: number,
  maxAgeMs: number,
  maxFutureSkewMs: number,
  side: "left" | "right",
): readonly WorldCupScanReason[] {
  const nowBig = BigInt(now);
  const futureLimit = nowBig + BigInt(maxFutureSkewMs);
  const oldest = nowBig - BigInt(maxAgeMs);
  const source = BigInt(quote.sourceUpdatedAt);
  const received = BigInt(quote.receivedAt);
  const reasons: WorldCupScanReason[] = [];
  if (
    source > futureLimit ||
    received > futureLimit ||
    source > received + BigInt(maxFutureSkewMs)
  ) {
    reasons.push(
      scanReason(
        "QUOTE_FROM_FUTURE",
        side,
        `The ${side} quote timestamp exceeds the allowed clock skew`,
      ),
    );
  }
  if (source < oldest || received < oldest) {
    reasons.push(
      scanReason(
        "QUOTE_STALE",
        side,
        `The ${side} quote is older than the configured freshness window`,
      ),
    );
  }
  return Object.freeze(reasons);
}

function buildCurve(
  quote: NormalizedVenueBook,
  commonScale: number,
): CommonBookCurve {
  const levels: CommonBookLevel[] = [];
  const boundaries: bigint[] = [];
  let cumulativeAtomic = 0n;
  let cumulativeCostNumerator = 0n;
  for (const level of quote.asks) {
    const quantityAtomic = toCommonAtomic(level.quantity, commonScale);
    const startAtomic = cumulativeAtomic;
    const costBeforeNumerator = cumulativeCostNumerator;
    cumulativeAtomic += quantityAtomic;
    cumulativeCostNumerator +=
      BigInt(level.priceMicrosPerShare) * quantityAtomic;
    levels.push(
      Object.freeze({
        priceMicrosPerShare: BigInt(level.priceMicrosPerShare),
        startAtomic,
        endAtomic: cumulativeAtomic,
        costBeforeNumerator,
      }),
    );
    boundaries.push(cumulativeAtomic);
  }
  return Object.freeze({
    levels: Object.freeze(levels),
    totalAtomic: cumulativeAtomic,
    boundaries: Object.freeze(boundaries),
  });
}

function costNumeratorAt(curve: CommonBookCurve, quantity: bigint): bigint {
  if (quantity <= 0n || quantity > curve.totalAtomic) {
    throw new Error("Quantity is outside normalized book depth");
  }
  let low = 0;
  let high = curve.levels.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (curve.levels[middle].endAtomic >= quantity) high = middle;
    else low = middle + 1;
  }
  const level = curve.levels[low];
  return (
    level.costBeforeNumerator +
    level.priceMicrosPerShare * (quantity - level.startAtomic)
  );
}

function addBoundary(
  boundaries: Set<string>,
  raw: bigint,
  minimum: bigint,
  maximum: bigint,
  step: bigint,
): void {
  const bounded = raw > maximum ? maximum : raw;
  const candidate = floorToStep(bounded, step);
  if (candidate >= minimum && candidate <= maximum) {
    boundaries.add(candidate.toString());
  }
}

function exactSharesToAtomic(
  shares: ExactShares,
  scale: number,
): bigint | null {
  try {
    const normalized = createExactShares(shares.numerator, shares.denominator);
    const numerator =
      BigInt(normalized.numerator) * 10n ** BigInt(scale);
    const denominator = BigInt(normalized.denominator);
    if (numerator % denominator !== 0n) return null;
    return numerator / denominator;
  } catch {
    return null;
  }
}

function toCommonAtomic(quantity: VenueQuantity, commonScale: number): bigint {
  return (
    BigInt(quantity.atomic) *
    10n ** BigInt(commonScale - quantity.scale)
  );
}

function quantityAtVenueScale(
  commonAtomic: bigint,
  commonScale: number,
  venueScale: number,
): VenueQuantity {
  const divisor = 10n ** BigInt(commonScale - venueScale);
  if (commonAtomic % divisor !== 0n) {
    throw new Error("Shared quantity is not representable at the venue scale");
  }
  return venueQuantity((commonAtomic / divisor).toString(), venueScale);
}

function earliestExpiry(input: WorldCupScanInput): number {
  const values = [
    BigInt(input.leftQuote.sourceUpdatedAt) +
      BigInt(input.settings.maxQuoteAgeMs),
    BigInt(input.leftQuote.receivedAt) + BigInt(input.settings.maxQuoteAgeMs),
    BigInt(input.rightQuote.sourceUpdatedAt) +
      BigInt(input.settings.maxQuoteAgeMs),
    BigInt(input.rightQuote.receivedAt) + BigInt(input.settings.maxQuoteAgeMs),
    BigInt(input.leftContract.reference.tradingClosesAt) -
      BigInt(input.settings.closeBufferMs),
    BigInt(input.rightContract.reference.tradingClosesAt) -
      BigInt(input.settings.closeBufferMs),
  ];
  return safeNumber(values.reduce((left, right) => (left < right ? left : right)));
}

function closeBufferReached(
  now: number,
  bufferMs: number,
  contract: LinkableContract,
): boolean {
  return (
    BigInt(now) + BigInt(bufferMs) >=
    BigInt(contract.reference.tradingClosesAt)
  );
}

function isBetterCandidate(
  candidate: CandidateNumbers,
  current: CandidateNumbers | null,
): boolean {
  if (current === null) return true;
  if (candidate.grossProfitMicros !== current.grossProfitMicros) {
    return candidate.grossProfitMicros > current.grossProfitMicros;
  }
  if (candidate.grossReturnBps !== current.grossReturnBps) {
    return candidate.grossReturnBps > current.grossReturnBps;
  }
  return candidate.commonAtomic < current.commonAtomic;
}

function minBigInt(...values: readonly bigint[]): bigint {
  return values.reduce((left, right) => (left < right ? left : right));
}

function ceilToStep(value: bigint, step: bigint): bigint {
  return ceilDivide(value, step) * step;
}

function floorToStep(value: bigint, step: bigint): bigint {
  return (value / step) * step;
}

function ceilDivide(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) {
    throw new Error("Ceiling division requires nonnegative numerator and positive denominator");
  }
  return (numerator + denominator - 1n) / denominator;
}

function safeMicros(value: bigint): Micros {
  return safeNumber(value);
}

function safeNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Exact scan value exceeds the safe integer range");
  }
  return Number(value);
}

function isSafePositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isSafeNonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function scanReason(
  code: WorldCupScanReasonCode,
  side: "left" | "right" | null,
  message: string,
): WorldCupScanReason {
  return Object.freeze({ code, side, message });
}

function noCandidate(
  reasons: readonly WorldCupScanReason[],
): WorldCupScanResult {
  return Object.freeze({
    status: "NO_CANDIDATE",
    reasons: Object.freeze([...reasons]),
  });
}
