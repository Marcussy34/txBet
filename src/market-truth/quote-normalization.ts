import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import {
  ceilRatioProductMicros,
  parseUsdMicros,
  venueQuantity,
  type AtomicAmount,
  type VenueQuantity,
} from "@/core/live-money";
import type { Micros } from "@/core/money";
import type { LinkableContract } from "@/market-truth/contract-links";

const LOWERCASE_SHA256 = /^[a-f0-9]{64}$/;
const POSITIVE_UINT = /^[1-9][0-9]*$/;
const POLYMARKET_CONDITION_ID = /^0x[a-fA-F0-9]{64}$/;
const POLYMARKET_BOOK_REVISION = /^[a-f0-9]{40}$/;
const POLYMARKET_CATALOG_REVISION =
  /^[1-9][0-9]*:\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_UINT256 = (1n << 256n) - 1n;
const MAX_BOOK_LEVELS_PER_SIDE = 10_000;
export const POLYMARKET_QUANTITY_SCALE = 6 as const;
const POLYMARKET_TICK_SIZES = new Set([
  "0.1",
  "0.01",
  "0.005",
  "0.0025",
  "0.001",
  "0.0001",
]);

export interface VenueBookWireLevel {
  readonly priceUsd: string;
  readonly quantityShares: string;
}

export interface VenueBookInput {
  readonly contract: LinkableContract;
  readonly sourceMarketId: string;
  readonly sourceOutcomeId: string;
  readonly sourceUpdatedAt: number;
  readonly receivedAt: number;
  readonly bookRevision: string;
  readonly tickSizeUsd: string;
  readonly minimumOrderShares: string;
  readonly quantityScale: number;
  readonly bids: readonly VenueBookWireLevel[];
  readonly asks: readonly VenueBookWireLevel[];
  readonly sourceMetadataHash?: string;
  readonly marketIdentityHash?: string | null;
}

export interface NormalizedBookLevel {
  readonly priceMicrosPerShare: Micros;
  readonly quantity: VenueQuantity;
  readonly fullLevelCostMicros: Micros;
}

export interface NormalizedVenueBook {
  readonly schemaVersion: "normalized-venue-book-v1";
  readonly venueId: string;
  readonly contractId: string;
  readonly contractReferenceHash: string;
  readonly settlementFingerprint: string;
  readonly sourceMarketId: string;
  readonly sourceOutcomeId: string;
  readonly sourceUpdatedAt: number;
  readonly receivedAt: number;
  readonly bookRevision: string;
  readonly tickSizeMicros: Micros;
  readonly quantityScale: number;
  readonly minimumOrderQuantity: VenueQuantity;
  readonly bids: readonly NormalizedBookLevel[];
  readonly asks: readonly NormalizedBookLevel[];
  readonly sourceMetadataHash: string;
  readonly marketIdentityHash: string | null;
  readonly evidenceHash: string;
}

export type QuoteNormalizationReasonCode =
  | "INVALID_CONTRACT_REFERENCE"
  | "INVALID_SOURCE_MARKET_ID"
  | "INVALID_SOURCE_OUTCOME_ID"
  | "SOURCE_MARKET_MISMATCH"
  | "SOURCE_OUTCOME_MISMATCH"
  | "SOURCE_TICK_SIZE_MISMATCH"
  | "SOURCE_NEG_RISK_MISMATCH"
  | "REVIEWED_MARKET_IDENTITY_MISMATCH"
  | "INVALID_TIMESTAMP"
  | "INVALID_RECEIVED_AT"
  | "INVALID_BOOK_REVISION"
  | "INVALID_TICK_SIZE"
  | "INVALID_MINIMUM_ORDER_SIZE"
  | "INVALID_QUANTITY_SCALE"
  | "INVALID_PRICE"
  | "OFF_TICK_PRICE"
  | "INVALID_QUANTITY"
  | "DUPLICATE_PRICE"
  | "UNSORTED_LEVELS"
  | "TOO_MANY_LEVELS"
  | "INVALID_SOURCE_METADATA"
  | "NORMALIZATION_FAILED";

export interface QuoteNormalizationReason {
  readonly code: QuoteNormalizationReasonCode;
  readonly field: string;
  readonly levelIndex: number | null;
  readonly message: string;
}

export type QuoteNormalizationResult =
  | { readonly ok: true; readonly quote: NormalizedVenueBook }
  | { readonly ok: false; readonly reasons: readonly QuoteNormalizationReason[] };

export interface PolymarketBookSnapshotInput {
  readonly schemaVersion: "polymarket-clob-market-snapshot-v1";
  readonly tokenId: string;
  readonly conditionId: string;
  readonly observedAtEpochMs: string;
  readonly retrievedAtEpochMs: number;
  readonly sourceRevision: string;
  readonly tickSize: string;
  readonly negRisk: boolean;
  readonly minimumOrderSize: string;
  readonly lastTradePrice: string | null;
  readonly bids: readonly Readonly<{ readonly price: string; readonly size: string }>[];
  readonly asks: readonly Readonly<{ readonly price: string; readonly size: string }>[];
}

export interface PolymarketBookNormalizationInput {
  readonly contract: LinkableContract;
  /** The catalog identity whose hash was pinned into the reviewed contract revision. */
  readonly reviewedMarketIdentity: PolymarketReviewedMarketIdentity;
  /** Deprecated consistency inputs. They are never authoritative. */
  readonly expectedConditionId?: string;
  readonly expectedTokenId?: string;
  readonly quantityScale?: number;
  readonly snapshot: PolymarketBookSnapshotInput;
}

export interface PolymarketReviewedMarketIdentity {
  readonly schemaVersion: "polymarket-reviewed-market-identity-v1";
  readonly catalogSchemaVersion: "polymarket-gamma-market-v1";
  readonly catalogContractId: string;
  readonly catalogRevisionId: string;
  readonly conditionId: string;
  readonly outcomeLabel: string;
  readonly tokenId: string;
  readonly tickSize: string;
  readonly negRisk: boolean;
  readonly quantityScale: typeof POLYMARKET_QUANTITY_SCALE;
  readonly reviewedAtEpochMs: number;
  readonly evidenceHash: string;
}

/**
 * Convert an adapter-validated book into exact, immutable market evidence.
 * Display titles are deliberately absent: only reviewed contract references bind semantics.
 */
export function normalizeVenueBook(input: VenueBookInput): QuoteNormalizationResult {
  try {
    const reasons: QuoteNormalizationReason[] = [];
    const reference = input.contract?.reference;
    if (
      reference === undefined ||
      !isOpaqueId(reference.venueId) ||
      !isOpaqueId(reference.contractId) ||
      !LOWERCASE_SHA256.test(reference.settlementFingerprint)
    ) {
      reasons.push(
        reason(
          "INVALID_CONTRACT_REFERENCE",
          "contract.reference",
          null,
          "The quote must bind a complete reviewed contract reference",
        ),
      );
    }
    if (!isOpaqueId(input.sourceMarketId)) {
      reasons.push(
        reason(
          "INVALID_SOURCE_MARKET_ID",
          "sourceMarketId",
          null,
          "Source market ID must be a nonempty opaque identifier",
        ),
      );
    }
    if (!isOpaqueId(input.sourceOutcomeId)) {
      reasons.push(
        reason(
          "INVALID_SOURCE_OUTCOME_ID",
          "sourceOutcomeId",
          null,
          "Source outcome ID must be a nonempty opaque identifier",
        ),
      );
    }
    if (!isSafeNonnegativeInteger(input.sourceUpdatedAt)) {
      reasons.push(
        reason(
          "INVALID_TIMESTAMP",
          "sourceUpdatedAt",
          null,
          "Source update time must be nonnegative epoch milliseconds",
        ),
      );
    }
    if (!isSafeNonnegativeInteger(input.receivedAt)) {
      reasons.push(
        reason(
          "INVALID_RECEIVED_AT",
          "receivedAt",
          null,
          "Receipt time must be nonnegative epoch milliseconds",
        ),
      );
    }
    if (!isOpaqueId(input.bookRevision)) {
      reasons.push(
        reason(
          "INVALID_BOOK_REVISION",
          "bookRevision",
          null,
          "Book revision must be nonempty source evidence",
        ),
      );
    }
    if (!isQuantityScale(input.quantityScale)) {
      reasons.push(
        reason(
          "INVALID_QUANTITY_SCALE",
          "quantityScale",
          null,
          "Quantity scale must be an integer from zero through thirty",
        ),
      );
    }

    const sourceMetadataHash =
      input.sourceMetadataHash ??
      sha256Canonical({ schemaVersion: "venue-book-source-metadata-none-v1" });
    if (!LOWERCASE_SHA256.test(sourceMetadataHash)) {
      reasons.push(
        reason(
          "INVALID_SOURCE_METADATA",
          "sourceMetadataHash",
          null,
          "Source metadata hash must be lowercase SHA-256 hex",
        ),
      );
    }

    const pinnedMarketIdentityHash = reference?.marketIdentityHash ?? null;
    const marketIdentityHash = input.marketIdentityHash ?? pinnedMarketIdentityHash;
    if (
      (marketIdentityHash !== null && !LOWERCASE_SHA256.test(marketIdentityHash)) ||
      marketIdentityHash !== pinnedMarketIdentityHash
    ) {
      reasons.push(
        reason(
          "REVIEWED_MARKET_IDENTITY_MISMATCH",
          "marketIdentityHash",
          null,
          "Market identity evidence must be lowercase SHA-256 hex",
        ),
      );
    }

    let tickSizeMicros: Micros | null = null;
    try {
      const parsed = parseUsdMicros(input.tickSizeUsd);
      if (parsed <= 0 || parsed >= 1_000_000) throw new Error("outside range");
      tickSizeMicros = parsed;
    } catch {
      reasons.push(
        reason(
          "INVALID_TICK_SIZE",
          "tickSizeUsd",
          null,
          "Tick size must be an exact price strictly between zero and one",
        ),
      );
    }

    let minimumOrderQuantity: VenueQuantity | null = null;
    if (isQuantityScale(input.quantityScale)) {
      try {
        minimumOrderQuantity = quantityFromDecimal(
          input.minimumOrderShares,
          input.quantityScale,
        );
      } catch {
        reasons.push(
          reason(
            "INVALID_MINIMUM_ORDER_SIZE",
            "minimumOrderShares",
            null,
            "Minimum order size must be positive and exactly representable at the venue scale",
          ),
        );
      }
    }

    if (!Array.isArray(input.bids) || input.bids.length > MAX_BOOK_LEVELS_PER_SIDE) {
      reasons.push(
        reason(
          "TOO_MANY_LEVELS",
          "bids",
          null,
          `A book side may contain at most ${MAX_BOOK_LEVELS_PER_SIDE} levels`,
        ),
      );
    }
    if (!Array.isArray(input.asks) || input.asks.length > MAX_BOOK_LEVELS_PER_SIDE) {
      reasons.push(
        reason(
          "TOO_MANY_LEVELS",
          "asks",
          null,
          `A book side may contain at most ${MAX_BOOK_LEVELS_PER_SIDE} levels`,
        ),
      );
    }

    if (
      reasons.length > 0 ||
      reference === undefined ||
      tickSizeMicros === null ||
      minimumOrderQuantity === null
    ) {
      return invalid(reasons);
    }

    const bids = normalizeLevels(
      input.bids,
      "bids",
      "descending",
      tickSizeMicros,
      input.quantityScale,
    );
    const asks = normalizeLevels(
      input.asks,
      "asks",
      "ascending",
      tickSizeMicros,
      input.quantityScale,
    );
    const levelReasons = [...bids.reasons, ...asks.reasons];
    if (levelReasons.length > 0) return invalid(levelReasons);

    const contractReferenceHash = sha256Canonical(
      reference as unknown as JsonValue,
    );
    const evidence = {
      schemaVersion: "normalized-venue-book-evidence-v1",
      venueId: reference.venueId,
      contractId: reference.contractId,
      contractReferenceHash,
      settlementFingerprint: reference.settlementFingerprint,
      sourceMarketId: input.sourceMarketId,
      sourceOutcomeId: input.sourceOutcomeId,
      sourceUpdatedAt: input.sourceUpdatedAt,
      receivedAt: input.receivedAt,
      bookRevision: input.bookRevision,
      tickSizeMicros,
      quantityScale: input.quantityScale,
      minimumOrderQuantity,
      bids: bids.levels,
      asks: asks.levels,
      sourceMetadataHash,
      marketIdentityHash,
    } as unknown as JsonValue;

    return Object.freeze({
      ok: true,
      quote: Object.freeze({
        schemaVersion: "normalized-venue-book-v1",
        venueId: reference.venueId,
        contractId: reference.contractId,
        contractReferenceHash,
        settlementFingerprint: reference.settlementFingerprint,
        sourceMarketId: input.sourceMarketId,
        sourceOutcomeId: input.sourceOutcomeId,
        sourceUpdatedAt: input.sourceUpdatedAt,
        receivedAt: input.receivedAt,
        bookRevision: input.bookRevision,
        tickSizeMicros,
        quantityScale: input.quantityScale,
        minimumOrderQuantity,
        bids: bids.levels,
        asks: asks.levels,
        sourceMetadataHash,
        marketIdentityHash,
        evidenceHash: sha256Canonical(evidence),
      }),
    });
  } catch {
    return invalid([
      reason(
        "NORMALIZATION_FAILED",
        "book",
        null,
        "The venue book could not be normalized safely",
      ),
    ]);
  }
}

/** Map the fixed public Polymarket snapshot into the venue-neutral exact boundary. */
export function normalizePolymarketBook(
  input: PolymarketBookNormalizationInput,
): QuoteNormalizationResult {
  try {
    return normalizePolymarketBookUnchecked(input);
  } catch {
    return invalid([
      reason(
        "NORMALIZATION_FAILED",
        "snapshot",
        null,
        "The Polymarket snapshot could not be normalized safely",
      ),
    ]);
  }
}

function normalizePolymarketBookUnchecked(
  input: PolymarketBookNormalizationInput,
): QuoteNormalizationResult {
  const reasons: QuoteNormalizationReason[] = [];
  const { snapshot } = input;
  const identity = input.reviewedMarketIdentity;
  if (!polymarketReviewedIdentityValid(input)) {
    return invalid([
      reason(
        "REVIEWED_MARKET_IDENTITY_MISMATCH",
        "reviewedMarketIdentity",
        null,
        "Polymarket catalog identity must match the hash pinned by the reviewed contract revision",
      ),
    ]);
  }

  if (!POLYMARKET_CONDITION_ID.test(snapshot.conditionId)) {
    reasons.push(
      reason(
        "INVALID_SOURCE_MARKET_ID",
        "snapshot.conditionId",
        null,
        "Polymarket condition ID must be exactly 32 bytes",
      ),
    );
  }
  if (!isPolymarketTokenId(snapshot.tokenId)) {
    reasons.push(
      reason(
        "INVALID_SOURCE_OUTCOME_ID",
        "snapshot.tokenId",
        null,
        "Polymarket token ID must be a positive uint256 decimal integer",
      ),
    );
  }
  if (
    snapshot.conditionId !== identity.conditionId ||
    (input.expectedConditionId !== undefined &&
      input.expectedConditionId !== identity.conditionId)
  ) {
    reasons.push(
      reason(
        "SOURCE_MARKET_MISMATCH",
        "snapshot.conditionId",
        null,
        "Polymarket book condition does not match the reviewed market binding",
      ),
    );
  }
  if (
    snapshot.tokenId !== identity.tokenId ||
    (input.expectedTokenId !== undefined &&
      input.expectedTokenId !== identity.tokenId)
  ) {
    reasons.push(
      reason(
        "SOURCE_OUTCOME_MISMATCH",
        "snapshot.tokenId",
        null,
        "Polymarket book token does not match the reviewed outcome binding",
      ),
    );
  }
  if (snapshot.tickSize !== identity.tickSize) {
    reasons.push(
      reason(
        "SOURCE_TICK_SIZE_MISMATCH",
        "snapshot.tickSize",
        null,
        "Polymarket book tick size does not match the reviewed catalog identity",
      ),
    );
  }
  if (snapshot.negRisk !== identity.negRisk) {
    reasons.push(
      reason(
        "SOURCE_NEG_RISK_MISMATCH",
        "snapshot.negRisk",
        null,
        "Polymarket negative-risk mode does not match the reviewed catalog identity",
      ),
    );
  }
  if (
    identity.quantityScale !== POLYMARKET_QUANTITY_SCALE ||
    (input.quantityScale !== undefined &&
      input.quantityScale !== POLYMARKET_QUANTITY_SCALE)
  ) {
    reasons.push(
      reason(
        "INVALID_QUANTITY_SCALE",
        "reviewedMarketIdentity.quantityScale",
        null,
        "Polymarket conditional-token quantities use the fixed six-decimal scale",
      ),
    );
  }
  if (!POLYMARKET_BOOK_REVISION.test(snapshot.sourceRevision)) {
    reasons.push(
      reason(
        "INVALID_BOOK_REVISION",
        "snapshot.sourceRevision",
        null,
        "Polymarket book hash must match the pinned source revision format",
      ),
    );
  }

  let sourceUpdatedAt: number | null = null;
  try {
    if (!POSITIVE_UINT.test(snapshot.observedAtEpochMs)) throw new Error("invalid");
    const parsed = BigInt(snapshot.observedAtEpochMs);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("unsafe");
    sourceUpdatedAt = Number(parsed);
  } catch {
    reasons.push(
      reason(
        "INVALID_TIMESTAMP",
        "snapshot.observedAtEpochMs",
        null,
        "Polymarket snapshot time must be safe epoch milliseconds",
      ),
    );
  }

  if (
    snapshot.schemaVersion !== "polymarket-clob-market-snapshot-v1" ||
    typeof snapshot.negRisk !== "boolean" ||
    !isOptionalPrice(snapshot.lastTradePrice)
  ) {
    reasons.push(
      reason(
        "INVALID_SOURCE_METADATA",
        "snapshot",
        null,
        "Polymarket snapshot metadata does not match its pinned schema",
      ),
    );
  }

  if (!Array.isArray(snapshot.bids) || !Array.isArray(snapshot.asks)) {
    reasons.push(
      reason(
        "NORMALIZATION_FAILED",
        "snapshot",
        null,
        "Polymarket book sides must be arrays",
      ),
    );
  } else if (
    snapshot.bids.length > MAX_BOOK_LEVELS_PER_SIDE ||
    snapshot.asks.length > MAX_BOOK_LEVELS_PER_SIDE
  ) {
    reasons.push(
      reason(
        "TOO_MANY_LEVELS",
        "snapshot",
        null,
        `A Polymarket book side may contain at most ${MAX_BOOK_LEVELS_PER_SIDE} levels`,
      ),
    );
  } else {
    reasons.push(
      ...polymarketWireOrderReasons(snapshot.bids, "bids", "ascending"),
      ...polymarketWireOrderReasons(snapshot.asks, "asks", "descending"),
    );
  }
  if (reasons.length > 0 || sourceUpdatedAt === null) return invalid(reasons);

  const sourceMetadataHash = sha256Canonical({
    schemaVersion: snapshot.schemaVersion,
    negRisk: snapshot.negRisk,
    lastTradePrice: snapshot.lastTradePrice,
    reviewedMarketIdentityHash: identity.evidenceHash,
  });
  return normalizeVenueBook({
    contract: input.contract,
    sourceMarketId: snapshot.conditionId,
    sourceOutcomeId: snapshot.tokenId,
    sourceUpdatedAt,
    receivedAt: snapshot.retrievedAtEpochMs,
    bookRevision: snapshot.sourceRevision,
    tickSizeUsd: snapshot.tickSize,
    minimumOrderShares: snapshot.minimumOrderSize,
    quantityScale: POLYMARKET_QUANTITY_SCALE,
    // The venue wire format is worst-first; normalized books are always best-first.
    bids: [...snapshot.bids].reverse().map((level) => ({
      priceUsd: level.price,
      quantityShares: level.size,
    })),
    asks: [...snapshot.asks].reverse().map((level) => ({
      priceUsd: level.price,
      quantityShares: level.size,
    })),
    sourceMetadataHash,
    marketIdentityHash: identity.evidenceHash,
  });
}

function polymarketReviewedIdentityValid(
  input: PolymarketBookNormalizationInput,
): boolean {
  try {
    const identity = input.reviewedMarketIdentity;
    const reference = input.contract.reference;
    const nativeIdentity = input.contract.settlementSpec.evidence.nativeIdentity;
    if (
      identity.schemaVersion !== "polymarket-reviewed-market-identity-v1" ||
      identity.catalogSchemaVersion !== "polymarket-gamma-market-v1" ||
      !POSITIVE_UINT.test(identity.catalogContractId) ||
      !POLYMARKET_CATALOG_REVISION.test(identity.catalogRevisionId) ||
      !identity.catalogRevisionId.startsWith(`${identity.catalogContractId}:`) ||
      !POLYMARKET_CONDITION_ID.test(identity.conditionId) ||
      !isPolymarketTokenId(identity.tokenId) ||
      !isOpaqueId(identity.outcomeLabel) ||
      !POLYMARKET_TICK_SIZES.has(identity.tickSize) ||
      typeof identity.negRisk !== "boolean" ||
      identity.quantityScale !== POLYMARKET_QUANTITY_SCALE ||
      !isSafeNonnegativeInteger(identity.reviewedAtEpochMs) ||
      !LOWERCASE_SHA256.test(identity.evidenceHash)
    ) {
      return false;
    }

    const projection = {
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
    } as unknown as JsonValue;
    return (
      sha256Canonical(projection) === identity.evidenceHash &&
      reference.venueId === "polymarket" &&
      reference.contractId === identity.catalogContractId &&
      reference.venueRevision === identity.catalogRevisionId &&
      reference.marketIdentityHash === identity.evidenceHash &&
      input.contract.outcome === identity.outcomeLabel &&
      nativeIdentity.marketId === identity.catalogContractId &&
      nativeIdentity.outcomeId === identity.tokenId
    );
  } catch {
    return false;
  }
}

function polymarketWireOrderReasons(
  levels: readonly Readonly<{ readonly price: string; readonly size: string }>[],
  field: "bids" | "asks",
  order: "ascending" | "descending",
): readonly QuoteNormalizationReason[] {
  const reasons: QuoteNormalizationReason[] = [];
  const seenPrices = new Set<Micros>();
  let previousPrice: Micros | null = null;
  for (let index = 0; index < levels.length; index += 1) {
    let price: Micros;
    try {
      price = parseUsdMicros(levels[index].price);
      if (price <= 0 || price >= 1_000_000) throw new Error("outside range");
    } catch {
      reasons.push(
        reason(
          "INVALID_PRICE",
          `snapshot.${field}[${index}].price`,
          index,
          "Polymarket wire price must be an exact decimal strictly between zero and one",
        ),
      );
      continue;
    }

    if (seenPrices.has(price)) {
      reasons.push(
        reason(
          "DUPLICATE_PRICE",
          `snapshot.${field}[${index}].price`,
          index,
          "A Polymarket wire side cannot contain duplicate price levels",
        ),
      );
    } else if (
      previousPrice !== null &&
      ((order === "ascending" && price < previousPrice) ||
        (order === "descending" && price > previousPrice))
    ) {
      reasons.push(
        reason(
          "UNSORTED_LEVELS",
          `snapshot.${field}`,
          index,
          `Polymarket wire ${field} must preserve the documented ${order} price order`,
        ),
      );
    }
    seenPrices.add(price);
    previousPrice = price;
  }
  return Object.freeze(reasons);
}

function normalizeLevels(
  wireLevels: readonly VenueBookWireLevel[],
  field: "bids" | "asks",
  order: "ascending" | "descending",
  tickSizeMicros: Micros,
  quantityScale: number,
): {
  readonly levels: readonly NormalizedBookLevel[];
  readonly reasons: readonly QuoteNormalizationReason[];
} {
  const levels: NormalizedBookLevel[] = [];
  const reasons: QuoteNormalizationReason[] = [];
  let previousPrice: Micros | null = null;

  for (let index = 0; index < wireLevels.length; index += 1) {
    const wire = wireLevels[index];
    let price: Micros | null = null;
    let quantity: VenueQuantity | null = null;
    try {
      const parsed = parseUsdMicros(wire.priceUsd);
      if (parsed <= 0 || parsed >= 1_000_000) throw new Error("outside range");
      price = parsed;
    } catch {
      reasons.push(
        reason(
          "INVALID_PRICE",
          `${field}[${index}].priceUsd`,
          index,
          "Book price must be an exact decimal strictly between zero and one",
        ),
      );
    }
    try {
      quantity = quantityFromDecimal(wire.quantityShares, quantityScale);
    } catch {
      reasons.push(
        reason(
          "INVALID_QUANTITY",
          `${field}[${index}].quantityShares`,
          index,
          "Book quantity must be positive and exactly representable at the venue scale",
        ),
      );
    }

    if (price !== null) {
      if (price % tickSizeMicros !== 0) {
        reasons.push(
          reason(
            "OFF_TICK_PRICE",
            `${field}[${index}].priceUsd`,
            index,
            "Book price is not an exact multiple of the current tick size",
          ),
        );
      }
      if (previousPrice !== null) {
        if (price === previousPrice) {
          reasons.push(
            reason(
              "DUPLICATE_PRICE",
              `${field}[${index}].priceUsd`,
              index,
              "A normalized book cannot contain duplicate price levels",
            ),
          );
        } else if (
          (order === "ascending" && price < previousPrice) ||
          (order === "descending" && price > previousPrice)
        ) {
          reasons.push(
            reason(
              "UNSORTED_LEVELS",
              field,
              index,
              `${field} must preserve the venue's documented ${order} price order`,
            ),
          );
        }
      }
      previousPrice = price;
    }

    if (price !== null && quantity !== null) {
      const fullLevelCostMicros = ceilRatioProductMicros(
        {
          numerator: price.toString() as AtomicAmount,
          denominator: "1",
        },
        quantity.exactShares,
      );
      levels.push(
        Object.freeze({
          priceMicrosPerShare: price,
          quantity,
          fullLevelCostMicros,
        }),
      );
    }
  }

  return Object.freeze({
    levels: Object.freeze(levels),
    reasons: Object.freeze(reasons),
  });
}

function quantityFromDecimal(value: string, scale: number): VenueQuantity {
  if (!isQuantityScale(scale)) throw new Error("invalid scale");
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (match === null) throw new Error("invalid decimal");
  const fraction = match[2] ?? "";
  if (fraction.length > scale) throw new Error("excess precision");
  const atomic =
    BigInt(match[1]) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, "0") || "0");
  if (atomic <= 0n) throw new Error("quantity must be positive");
  return venueQuantity(atomic.toString(), scale);
}

function isOptionalPrice(value: string | null): boolean {
  if (value === null) return true;
  try {
    const price = parseUsdMicros(value);
    return price >= 0 && price <= 1_000_000;
  } catch {
    return false;
  }
}

function isPolymarketTokenId(value: string): boolean {
  return POSITIVE_UINT.test(value) && BigInt(value) <= MAX_UINT256;
}

function isQuantityScale(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= 30;
}

function isSafeNonnegativeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function isOpaqueId(value: string): boolean {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 8_192 &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function reason(
  code: QuoteNormalizationReasonCode,
  field: string,
  levelIndex: number | null,
  message: string,
): QuoteNormalizationReason {
  return Object.freeze({ code, field, levelIndex, message });
}

function invalid(
  reasons: readonly QuoteNormalizationReason[],
): QuoteNormalizationResult {
  return Object.freeze({ ok: false, reasons: Object.freeze([...reasons]) });
}
