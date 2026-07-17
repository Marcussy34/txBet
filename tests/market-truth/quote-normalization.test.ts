import { describe, expect, it } from "vitest";

import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import { compareShares } from "@/core/live-money";
import {
  normalizePolymarketBook,
  normalizeVenueBook,
  type PolymarketBookNormalizationInput,
  type QuoteNormalizationResult,
  type VenueBookInput,
} from "@/market-truth/quote-normalization";
import {
  settlementFingerprint,
  settlementProvenanceHash,
} from "@/market-truth/settlement-spec";
import type {
  ContractRevisionRef,
  LinkableContract,
} from "@/market-truth/contract-links";

import { HASH_B, worldCupSettlementSpec } from "./fixtures";

const NOW = 1_784_238_770_635;
const CATALOG_CONTRACT_ID = "12345";
const CATALOG_REVISION_ID = `${CATALOG_CONTRACT_ID}:2026-07-16T12:00:00Z`;
const CONDITION_ID = `0x${"ab".repeat(32)}`;
const TOKEN_ID =
  "105267568073659068217311993901927962476298440625043565106676088842803600775810";

function reviewedMarketIdentity(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  const projection = {
    schemaVersion: "polymarket-reviewed-market-identity-v1",
    catalogSchemaVersion: "polymarket-gamma-market-v1",
    catalogContractId: CATALOG_CONTRACT_ID,
    catalogRevisionId: CATALOG_REVISION_ID,
    conditionId: CONDITION_ID,
    outcomeLabel: "YES",
    tokenId: TOKEN_ID,
    tickSize: "0.001",
    negRisk: false,
    quantityScale: 6,
    reviewedAtEpochMs: NOW - 1_000,
    ...overrides,
  } as const;
  return Object.freeze({
    ...projection,
    evidenceHash: sha256Canonical(projection as unknown as JsonValue),
  });
}

function linkableContract(venueId = "polymarket"): LinkableContract {
  const identity = reviewedMarketIdentity();
  const baseSpec = worldCupSettlementSpec();
  const spec = worldCupSettlementSpec({
    evidence: {
      ...baseSpec.evidence,
      venueRevision: identity.catalogRevisionId,
      nativeIdentity: {
        ...baseSpec.evidence.nativeIdentity,
        marketId: identity.catalogContractId,
        outcomeId: identity.tokenId,
      },
    },
  });
  const reference = {
    venueId,
    contractId:
      venueId === "polymarket" ? identity.catalogContractId : `${venueId}-contract-1`,
    settlementSpecVersion: spec.specVersion,
    settlementFingerprint: settlementFingerprint(spec),
    venueRevision: spec.evidence.venueRevision,
    rawRuleTextHash: spec.evidence.rawRuleTextHash,
    settlementProvenanceHash: settlementProvenanceHash(spec),
    canonicalEntityMappingRevision: spec.evidence.canonicalEntityMappingRevision,
    tradingClosesAt: NOW + 60_000,
    closeTimeRevision: "close-v1",
    closeTimeEvidenceHash: HASH_B,
    payoutAssetRevision: `${venueId}-asset-v1`,
    marketIdentityHash: venueId === "polymarket" ? identity.evidenceHash : undefined,
  } as ContractRevisionRef;

  return {
    reference,
    title: "This display title is never settlement evidence",
    outcome: "YES",
    outcomeUniverse: ["YES", "NO"],
    status: "open",
    settlementSpec: spec,
    unitSize: { numerator: "1", denominator: "1" },
    payoutAsset: {
      network: `${venueId}-network`,
      assetId: `${venueId}-usd`,
      symbol: "USDx",
      decimals: 6,
      assetRevision: `${venueId}-asset-v1`,
    },
  };
}

function bookInput(overrides: Partial<VenueBookInput> = {}): VenueBookInput {
  return {
    contract: linkableContract(),
    sourceMarketId: CONDITION_ID,
    sourceOutcomeId: TOKEN_ID,
    sourceUpdatedAt: NOW - 250,
    receivedAt: NOW,
    bookRevision: "9".repeat(40),
    tickSizeUsd: "0.001",
    minimumOrderShares: "5",
    quantityScale: 6,
    bids: [
      { priceUsd: "0.49", quantityShares: "10" },
      { priceUsd: "0.48", quantityShares: "20" },
    ],
    asks: [
      { priceUsd: "0.497", quantityShares: "1285.1" },
      { priceUsd: "0.5", quantityShares: "25" },
    ],
    ...overrides,
  };
}

function reasonCodes(result: QuoteNormalizationResult): readonly string[] {
  return result.ok ? [] : result.reasons.map((reason) => reason.code);
}

describe("exact venue-book normalization", () => {
  it("normalizes price and quantity strings with integer microdollars and exact shares", () => {
    const result = normalizeVenueBook(bookInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote).toMatchObject({
      schemaVersion: "normalized-venue-book-v1",
      venueId: "polymarket",
      contractId: CATALOG_CONTRACT_ID,
      sourceMarketId: CONDITION_ID,
      sourceOutcomeId: TOKEN_ID,
      sourceUpdatedAt: NOW - 250,
      receivedAt: NOW,
      bookRevision: "9".repeat(40),
      tickSizeMicros: 1_000,
      settlementFingerprint: settlementFingerprint(
        worldCupSettlementSpec(),
      ),
      minimumOrderQuantity: {
        atomic: "5000000",
        scale: 6,
        exactShares: { numerator: "5", denominator: "1" },
      },
    });
    expect(result.quote.asks[0]).toMatchObject({
      priceMicrosPerShare: 497_000,
      quantity: {
        atomic: "1285100000",
        scale: 6,
        exactShares: { numerator: "12851", denominator: "10" },
      },
      fullLevelCostMicros: 638_694_700,
    });
    expect(result.quote.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result.quote)).toBe(true);
    expect(Object.isFrozen(result.quote.asks)).toBe(true);
    expect(Object.isFrozen(result.quote.asks[0])).toBe(true);
  });

  it("preserves equal shares across different venue atomic scales", () => {
    const scaleTwo = normalizeVenueBook(
      bookInput({
        quantityScale: 2,
        minimumOrderShares: "1",
        bids: [{ priceUsd: "0.49", quantityShares: "1.25" }],
        asks: [{ priceUsd: "0.5", quantityShares: "1.25" }],
      }),
    );
    const scaleSix = normalizeVenueBook(
      bookInput({
        quantityScale: 6,
        minimumOrderShares: "1",
        bids: [{ priceUsd: "0.49", quantityShares: "1.25" }],
        asks: [{ priceUsd: "0.5", quantityShares: "1.25" }],
      }),
    );

    expect(scaleTwo.ok).toBe(true);
    expect(scaleSix.ok).toBe(true);
    if (!scaleTwo.ok || !scaleSix.ok) return;
    expect(scaleTwo.quote.asks[0].quantity.atomic).toBe("125");
    expect(scaleSix.quote.asks[0].quantity.atomic).toBe("1250000");
    expect(
      compareShares(
        scaleTwo.quote.asks[0].quantity.exactShares,
        scaleSix.quote.asks[0].quantity.exactShares,
      ),
    ).toBe(0);
  });

  it.each([
    [
      "exponent price",
      { asks: [{ priceUsd: "4.97e-1", quantityShares: "1" }] },
      "INVALID_PRICE",
    ],
    [
      "zero quantity",
      { asks: [{ priceUsd: "0.497", quantityShares: "0" }] },
      "INVALID_QUANTITY",
    ],
    [
      "negative quantity",
      { asks: [{ priceUsd: "0.497", quantityShares: "-1" }] },
      "INVALID_QUANTITY",
    ],
    [
      "one-dollar price",
      { asks: [{ priceUsd: "1", quantityShares: "1" }] },
      "INVALID_PRICE",
    ],
    [
      "excess quantity precision",
      { asks: [{ priceUsd: "0.497", quantityShares: "1.0000001" }] },
      "INVALID_QUANTITY",
    ],
    [
      "off-tick price",
      { asks: [{ priceUsd: "0.4975", quantityShares: "1" }] },
      "OFF_TICK_PRICE",
    ],
    [
      "invalid tick",
      { tickSizeUsd: "0.0000001" },
      "INVALID_TICK_SIZE",
    ],
    [
      "invalid minimum",
      { minimumOrderShares: "0" },
      "INVALID_MINIMUM_ORDER_SIZE",
    ],
    ["missing revision", { bookRevision: "" }, "INVALID_BOOK_REVISION"],
    ["unsafe timestamp", { sourceUpdatedAt: Number.MAX_VALUE }, "INVALID_TIMESTAMP"],
    ["negative receipt time", { receivedAt: -1 }, "INVALID_RECEIVED_AT"],
    ["invalid scale", { quantityScale: 31 }, "INVALID_QUANTITY_SCALE"],
  ] as const)("rejects %s without rounding or throwing", (_label, override, code) => {
    const result = normalizeVenueBook(
      bookInput(override as Partial<VenueBookInput>),
    );
    expect(result.ok).toBe(false);
    expect(reasonCodes(result)).toContain(code);
  });

  it.each([
    [
      "duplicate asks",
      [
        { priceUsd: "0.497", quantityShares: "1" },
        { priceUsd: "0.497", quantityShares: "2" },
      ],
      undefined,
      "DUPLICATE_PRICE",
    ],
    [
      "unsorted asks",
      [
        { priceUsd: "0.5", quantityShares: "1" },
        { priceUsd: "0.497", quantityShares: "2" },
      ],
      undefined,
      "UNSORTED_LEVELS",
    ],
    [
      "unsorted bids",
      undefined,
      [
        { priceUsd: "0.48", quantityShares: "1" },
        { priceUsd: "0.49", quantityShares: "2" },
      ],
      "UNSORTED_LEVELS",
    ],
  ] as const)("rejects %s", (_label, asks, bids, code) => {
    const result = normalizeVenueBook(
      bookInput({
        ...(asks === undefined ? {} : { asks }),
        ...(bids === undefined ? {} : { bids }),
      }),
    );
    expect(reasonCodes(result)).toContain(code);
  });

  it("binds Polymarket condition and token IDs from the public snapshot", () => {
    const contract = linkableContract();
    const reviewedIdentity = reviewedMarketIdentity();
    const snapshot = {
      schemaVersion: "polymarket-clob-market-snapshot-v1" as const,
      tokenId: TOKEN_ID,
      conditionId: CONDITION_ID,
      observedAtEpochMs: String(NOW - 250),
      retrievedAtEpochMs: NOW,
      sourceRevision: "9".repeat(40),
      tickSize: "0.001",
      negRisk: false,
      minimumOrderSize: "5",
      lastTradePrice: "0.497",
      bids: [{ price: "0.49", size: "10" }],
      asks: [{ price: "0.497", size: "10" }],
    };

    const valid = normalizePolymarketBook({
      contract,
      expectedConditionId: CONDITION_ID,
      expectedTokenId: TOKEN_ID,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedIdentity,
      snapshot,
    } as unknown as PolymarketBookNormalizationInput);
    expect(valid.ok).toBe(true);

    const wrongCondition = normalizePolymarketBook({
      contract,
      expectedConditionId: CONDITION_ID,
      expectedTokenId: TOKEN_ID,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedIdentity,
      snapshot: { ...snapshot, conditionId: `0x${"cd".repeat(32)}` },
    } as unknown as PolymarketBookNormalizationInput);
    const wrongToken = normalizePolymarketBook({
      contract,
      expectedConditionId: CONDITION_ID,
      expectedTokenId: TOKEN_ID,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedIdentity,
      snapshot: { ...snapshot, tokenId: "42" },
    } as unknown as PolymarketBookNormalizationInput);
    expect(reasonCodes(wrongCondition)).toContain("SOURCE_MARKET_MISMATCH");
    expect(reasonCodes(wrongToken)).toContain("SOURCE_OUTCOME_MISMATCH");
  });

  it("reverses the documented Polymarket wire order into venue-neutral best-first levels", () => {
    const snapshot = {
      schemaVersion: "polymarket-clob-market-snapshot-v1" as const,
      tokenId: TOKEN_ID,
      conditionId: CONDITION_ID,
      observedAtEpochMs: String(NOW - 250),
      retrievedAtEpochMs: NOW,
      sourceRevision: "9".repeat(40),
      tickSize: "0.001",
      negRisk: false,
      minimumOrderSize: "5",
      lastTradePrice: "0.497",
      // Pinned bindings and the captured official /book response are worst-first.
      bids: [
        { price: "0.001", size: "1" },
        { price: "0.002", size: "2" },
        { price: "0.496", size: "3" },
      ],
      asks: [
        { price: "0.999", size: "1" },
        { price: "0.998", size: "2" },
        { price: "0.497", size: "3" },
      ],
    };

    const result = normalizePolymarketBook({
      contract: linkableContract(),
      expectedConditionId: CONDITION_ID,
      expectedTokenId: TOKEN_ID,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedMarketIdentity(),
      snapshot,
    } as unknown as PolymarketBookNormalizationInput);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quote.bids.map((level) => level.priceMicrosPerShare)).toEqual([
      496_000,
      2_000,
      1_000,
    ]);
    expect(result.quote.asks.map((level) => level.priceMicrosPerShare)).toEqual([
      497_000,
      998_000,
      999_000,
    ]);
  });

  it.each([
    [
      "descending bids",
      [
        { price: "0.3", size: "1" },
        { price: "0.2", size: "1" },
      ],
      [{ price: "0.7", size: "1" }],
      "UNSORTED_LEVELS",
    ],
    [
      "mixed asks",
      [{ price: "0.3", size: "1" }],
      [
        { price: "0.9", size: "1" },
        { price: "0.7", size: "1" },
        { price: "0.8", size: "1" },
      ],
      "UNSORTED_LEVELS",
    ],
    [
      "duplicate asks",
      [{ price: "0.3", size: "1" }],
      [
        { price: "0.7", size: "1" },
        { price: "0.7", size: "2" },
      ],
      "DUPLICATE_PRICE",
    ],
    [
      "malformed price",
      [{ price: "not-a-price", size: "1" }],
      [{ price: "0.7", size: "1" }],
      "INVALID_PRICE",
    ],
  ] as const)("rejects Polymarket wire order with %s", (_label, bids, asks, code) => {
    const result = normalizePolymarketBook({
      contract: linkableContract(),
      expectedConditionId: CONDITION_ID,
      expectedTokenId: TOKEN_ID,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedMarketIdentity(),
      snapshot: {
        schemaVersion: "polymarket-clob-market-snapshot-v1",
        tokenId: TOKEN_ID,
        conditionId: CONDITION_ID,
        observedAtEpochMs: String(NOW - 250),
        retrievedAtEpochMs: NOW,
        sourceRevision: "9".repeat(40),
        tickSize: "0.001",
        negRisk: false,
        minimumOrderSize: "5",
        lastTradePrice: null,
        bids,
        asks,
      },
    } as unknown as PolymarketBookNormalizationInput);

    expect(reasonCodes(result)).toContain(code);
  });

  it("does not trust caller-supplied self-consistent condition and token IDs", () => {
    const attackerConditionId = `0x${"cd".repeat(32)}`;
    const attackerTokenId = "42";
    const result = normalizePolymarketBook({
      contract: linkableContract(),
      expectedConditionId: attackerConditionId,
      expectedTokenId: attackerTokenId,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedMarketIdentity(),
      snapshot: {
        schemaVersion: "polymarket-clob-market-snapshot-v1",
        tokenId: attackerTokenId,
        conditionId: attackerConditionId,
        observedAtEpochMs: String(NOW - 250),
        retrievedAtEpochMs: NOW,
        sourceRevision: "9".repeat(40),
        tickSize: "0.001",
        negRisk: false,
        minimumOrderSize: "5",
        lastTradePrice: null,
        bids: [{ price: "0.4", size: "10" }],
        asks: [{ price: "0.5", size: "10" }],
      },
    } as unknown as PolymarketBookNormalizationInput);

    expect(reasonCodes(result)).toEqual(
      expect.arrayContaining(["SOURCE_MARKET_MISMATCH", "SOURCE_OUTCOME_MISMATCH"]),
    );
  });

  it.each([
    ["tick size", { tickSize: "0.01" }, {}, "SOURCE_TICK_SIZE_MISMATCH"],
    ["negative-risk flag", { negRisk: true }, {}, "SOURCE_NEG_RISK_MISMATCH"],
    ["quantity scale", {}, { quantityScale: 2 }, "INVALID_QUANTITY_SCALE"],
  ] as const)(
    "binds Polymarket %s to the reviewed identity",
    (_label, snapshotOverride, inputOverride, code) => {
      const result = normalizePolymarketBook({
        contract: linkableContract(),
        expectedConditionId: CONDITION_ID,
        expectedTokenId: TOKEN_ID,
        quantityScale: 6,
        reviewedMarketIdentity: reviewedMarketIdentity(),
        snapshot: {
          schemaVersion: "polymarket-clob-market-snapshot-v1",
          tokenId: TOKEN_ID,
          conditionId: CONDITION_ID,
          observedAtEpochMs: String(NOW - 250),
          retrievedAtEpochMs: NOW,
          sourceRevision: "9".repeat(40),
          tickSize: "0.001",
          negRisk: false,
          minimumOrderSize: "5",
          lastTradePrice: null,
          bids: [{ price: "0.4", size: "10" }],
          asks: [{ price: "0.5", size: "10" }],
          ...snapshotOverride,
        },
        ...inputOverride,
      } as unknown as PolymarketBookNormalizationInput);

      expect(reasonCodes(result)).toContain(code);
    },
  );

  it("requires the reviewed catalog identity hash pinned by the contract revision", () => {
    const reviewedIdentity = reviewedMarketIdentity();
    const contract = linkableContract();
    const forgedContract = {
      ...contract,
      reference: { ...contract.reference, marketIdentityHash: HASH_B },
    } as LinkableContract;
    const result = normalizePolymarketBook({
      contract: forgedContract,
      expectedConditionId: CONDITION_ID,
      expectedTokenId: TOKEN_ID,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedIdentity,
      snapshot: {
        schemaVersion: "polymarket-clob-market-snapshot-v1",
        tokenId: TOKEN_ID,
        conditionId: CONDITION_ID,
        observedAtEpochMs: String(NOW - 250),
        retrievedAtEpochMs: NOW,
        sourceRevision: "9".repeat(40),
        tickSize: "0.001",
        negRisk: false,
        minimumOrderSize: "5",
        lastTradePrice: null,
        bids: [{ price: "0.4", size: "10" }],
        asks: [{ price: "0.5", size: "10" }],
      },
    } as unknown as PolymarketBookNormalizationInput);

    expect(reasonCodes(result)).toContain("REVIEWED_MARKET_IDENTITY_MISMATCH");
  });

  it("fails closed instead of throwing for a structurally malformed Polymarket snapshot", () => {
    const malformed = {
      contract: linkableContract(),
      expectedConditionId: CONDITION_ID,
      expectedTokenId: TOKEN_ID,
      quantityScale: 6,
      reviewedMarketIdentity: reviewedMarketIdentity(),
      snapshot: {
        schemaVersion: "polymarket-clob-market-snapshot-v1",
        tokenId: TOKEN_ID,
        conditionId: CONDITION_ID,
        observedAtEpochMs: String(NOW),
        retrievedAtEpochMs: NOW,
        sourceRevision: "9".repeat(40),
        tickSize: "0.001",
        negRisk: false,
        minimumOrderSize: "5",
        lastTradePrice: null,
        bids: null,
        asks: [],
      },
    } as unknown as PolymarketBookNormalizationInput;

    expect(() => normalizePolymarketBook(malformed)).not.toThrow();
    expect(reasonCodes(normalizePolymarketBook(malformed))).toContain(
      "NORMALIZATION_FAILED",
    );
  });

  it("hashes normalized evidence deterministically and remains independent of display titles", () => {
    const first = normalizeVenueBook(bookInput());
    const renamed = normalizeVenueBook(
      bookInput({
        contract: {
          ...linkableContract(),
          title: "Argentina definitely wins according to this untrusted title",
        },
      }),
    );
    const changedRevision = normalizeVenueBook(
      bookInput({ bookRevision: "8".repeat(40) }),
    );

    expect(first.ok && renamed.ok && changedRevision.ok).toBe(true);
    if (!first.ok || !renamed.ok || !changedRevision.ok) return;
    expect(renamed.quote.evidenceHash).toBe(first.quote.evidenceHash);
    expect(changedRevision.quote.evidenceHash).not.toBe(first.quote.evidenceHash);
  });
});
