import { describe, expect, it } from "vitest";

import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import { reduceShares } from "@/core/live-money";
import {
  proveComplement,
  type ContractRevisionRef,
  type LinkableContract,
  type VerifiedContractLink,
} from "@/market-truth/contract-links";
import {
  normalizeVenueBook,
  type NormalizedVenueBook,
  type VenueBookInput,
} from "@/market-truth/quote-normalization";
import {
  settlementFingerprint,
  settlementProvenanceHash,
  type SettlementSpecV1,
} from "@/market-truth/settlement-spec";
import {
  scanWorldCupCandidate,
  type WorldCupScanInput,
  type WorldCupScanResult,
} from "@/market-truth/world-cup-scanner";

import { HASH_A, HASH_B, HASH_C, worldCupSettlementSpec } from "./fixtures";

const NOW = 1_799_500_000_000;

function contract(input: {
  venueId: string;
  contractId: string;
  outcome: "YES" | "NO";
  spec?: SettlementSpecV1;
  reference?: Partial<ContractRevisionRef>;
  title?: string;
}): LinkableContract {
  const spec = input.spec ?? worldCupSettlementSpec();
  const payoutAssetRevision = `${input.venueId}-asset-v1`;
  const reference: ContractRevisionRef = {
    venueId: input.venueId,
    contractId: input.contractId,
    settlementSpecVersion: spec.specVersion,
    settlementFingerprint: settlementFingerprint(spec),
    venueRevision: spec.evidence.venueRevision,
    rawRuleTextHash: spec.evidence.rawRuleTextHash,
    settlementProvenanceHash: settlementProvenanceHash(spec),
    canonicalEntityMappingRevision: spec.evidence.canonicalEntityMappingRevision,
    tradingClosesAt: NOW + 60_000,
    closeTimeRevision: "close-v1",
    closeTimeEvidenceHash: HASH_B,
    payoutAssetRevision,
    ...input.reference,
  };
  return {
    reference,
    title: input.title ?? `${input.contractId} display title`,
    outcome: input.outcome,
    outcomeUniverse: ["YES", "NO"],
    status: "open",
    settlementSpec: spec,
    unitSize: reduceShares("1", "1"),
    payoutAsset: {
      network: `${input.venueId}-network`,
      assetId: `${input.venueId}-usd`,
      symbol: "USDx",
      decimals: 6,
      assetRevision: payoutAssetRevision,
    },
  };
}

function pair(): {
  left: LinkableContract;
  right: LinkableContract;
  link: VerifiedContractLink;
} {
  const leftSpec = worldCupSettlementSpec();
  const rightSpec = worldCupSettlementSpec({
    evidence: {
      ...leftSpec.evidence,
      rawRuleTextHash: HASH_C,
      venueRevision: "venue-b-revision-1",
      sourceUrl: "https://venue-b.example/rules/world-cup/market-2",
      nativeIdentity: {
        ...leftSpec.evidence.nativeIdentity,
        marketId: "venue-b-market-2",
        outcomeId: "venue-b-outcome-no",
      },
    },
  });
  const left = contract({ venueId: "venue-a", contractId: "yes-1", outcome: "YES", spec: leftSpec });
  const right = contract({ venueId: "venue-b", contractId: "no-1", outcome: "NO", spec: rightSpec });
  const link = proveComplement(left, right);
  if (link.status !== "VERIFIED") throw new Error("Expected verified test link");
  return { left, right, link };
}

function polymarketPair(): {
  left: LinkableContract;
  right: LinkableContract;
  link: VerifiedContractLink;
} {
  const current = pair();
  const left = {
    ...current.left,
    reference: {
      ...current.left.reference,
      venueId: "polymarket",
      contractId: "12345",
      marketIdentityHash: HASH_C,
    },
  } as LinkableContract;
  const link = proveComplement(left, current.right);
  if (link.status !== "VERIFIED") throw new Error("Expected verified Polymarket test link");
  return { left, right: current.right, link };
}

function quote(
  source: LinkableContract,
  input: {
    price?: string;
    quantity?: string;
    quantityScale?: number;
    minimumOrder?: string;
    sourceUpdatedAt?: number;
    receivedAt?: number;
    asks?: VenueBookInput["asks"];
    bookRevision?: string;
    tickSize?: string;
    marketIdentityHash?: string | null;
  } = {},
): NormalizedVenueBook {
  const result = normalizeVenueBook({
    contract: source,
    sourceMarketId: `${source.reference.contractId}-market`,
    sourceOutcomeId: `${source.reference.contractId}-outcome`,
    sourceUpdatedAt: input.sourceUpdatedAt ?? NOW - 100,
    receivedAt: input.receivedAt ?? NOW - 50,
    bookRevision: input.bookRevision ?? `${source.reference.venueId}-book-v1`,
    tickSizeUsd: input.tickSize ?? "0.01",
    minimumOrderShares: input.minimumOrder ?? "1",
    quantityScale: input.quantityScale ?? 6,
    bids: [],
    asks:
      input.asks ??
      [{ priceUsd: input.price ?? "0.4", quantityShares: input.quantity ?? "10" }],
    marketIdentityHash: input.marketIdentityHash,
  } as VenueBookInput);
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
  return result.quote;
}

function scanInput(overrides: Partial<WorldCupScanInput> = {}): WorldCupScanInput {
  const current = pair();
  return {
    competition: { id: "fifa-world-cup", edition: "2026" },
    link: current.link,
    leftContract: current.left,
    rightContract: current.right,
    leftQuote: quote(current.left, { price: "0.4" }),
    rightQuote: quote(current.right, { price: "0.5" }),
    now: NOW,
    settings: {
      maxQuoteAgeMs: 5_000,
      maxFutureSkewMs: 1_000,
      closeBufferMs: 5_000,
      maximumShares: reduceShares("2", "1"),
      minGrossReturnBps: 0,
      minGrossProfitMicros: 0,
    },
    ...overrides,
  };
}

function codes(result: WorldCupScanResult): readonly string[] {
  return result.status === "NO_CANDIDATE"
    ? result.reasons.map((reason) => reason.code)
    : [];
}

function rehashQuote(quote: NormalizedVenueBook): NormalizedVenueBook {
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
  return {
    ...quote,
    evidenceHash: sha256Canonical(evidence),
  };
}

describe("World Cup verified market-truth scanner", () => {
  it("emits deterministic integer-microdollar shadow evidence for a verified pair", () => {
    const result = scanWorldCupCandidate(scanInput());

    expect(result.status).toBe("CANDIDATE");
    if (result.status !== "CANDIDATE") return;
    expect(result.candidate).toMatchObject({
      schemaVersion: "world-cup-scan-candidate-v1",
      executionStatus: "SHADOW_ONLY",
      costScope: "BOOK_PRICE_ONLY",
      exactShares: { numerator: "2", denominator: "1" },
      left: {
        venueId: "venue-a",
        contractId: "yes-1",
        quantity: { atomic: "2000000", scale: 6 },
        bookCostMicros: 800_000,
      },
      right: {
        venueId: "venue-b",
        contractId: "no-1",
        quantity: { atomic: "2000000", scale: 6 },
        bookCostMicros: 1_000_000,
      },
      totalBookCostMicros: 1_800_000,
      nominalPayoutMicros: 2_000_000,
      grossProfitMicros: 200_000,
      grossReturnBps: 1_111,
      nonExecutableReasons: [
        "ASSET_VALUE_POLICY_NOT_BOUND",
        "VENUE_FEES_NOT_INCLUDED",
        "NETWORK_COST_NOT_INCLUDED",
        "LIVE_EXECUTION_NOT_AUTHORIZED",
      ],
    });
    expect(result.candidate.candidateHash).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(result.candidate)).toBe(true);
    expect(Object.isFrozen(result.candidate.nonExecutableReasons)).toBe(true);
    expect(scanWorldCupCandidate(scanInput())).toEqual(result);
  });

  it("walks multiple levels and chooses the exact profitable shared-depth boundary", () => {
    const current = pair();
    const input = scanInput({
      link: current.link,
      leftContract: current.left,
      rightContract: current.right,
      leftQuote: quote(current.left, {
        asks: [
          { priceUsd: "0.4", quantityShares: "1" },
          { priceUsd: "0.45", quantityShares: "2" },
        ],
      }),
      rightQuote: quote(current.right, { price: "0.5", quantity: "3" }),
      settings: {
        ...scanInput().settings,
        maximumShares: reduceShares("3", "1"),
      },
    });

    const result = scanWorldCupCandidate(input);
    expect(result.status).toBe("CANDIDATE");
    if (result.status !== "CANDIDATE") return;
    expect(result.candidate).toMatchObject({
      exactShares: { numerator: "3", denominator: "1" },
      left: { bookCostMicros: 1_300_000 },
      right: { bookCostMicros: 1_500_000 },
      totalBookCostMicros: 2_800_000,
      nominalPayoutMicros: 3_000_000,
      grossProfitMicros: 200_000,
      grossReturnBps: 714,
    });
  });

  it("matches exact shared depth across different venue quantity scales", () => {
    const current = pair();
    const result = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left, {
          price: "0.4",
          quantity: "2.5",
          quantityScale: 2,
        }),
        rightQuote: quote(current.right, {
          price: "0.5",
          quantity: "2.5",
          quantityScale: 6,
        }),
        settings: {
          ...scanInput().settings,
          maximumShares: reduceShares("5", "2"),
        },
      }),
    );

    expect(result.status).toBe("CANDIDATE");
    if (result.status !== "CANDIDATE") return;
    expect(result.candidate).toMatchObject({
      exactShares: { numerator: "5", denominator: "2" },
      left: { quantity: { atomic: "250", scale: 2 } },
      right: { quantity: { atomic: "2500000", scale: 6 } },
      totalBookCostMicros: 2_250_000,
      nominalPayoutMicros: 2_500_000,
      grossProfitMicros: 250_000,
    });
  });

  it.each([
    [
      "stale source",
      { sourceUpdatedAt: NOW - 5_001 },
      "QUOTE_STALE",
    ],
    [
      "future source",
      { sourceUpdatedAt: NOW + 1_001 },
      "QUOTE_FROM_FUTURE",
    ],
    [
      "stale receipt",
      { receivedAt: NOW - 5_001 },
      "QUOTE_STALE",
    ],
    [
      "future receipt",
      { receivedAt: NOW + 1_001 },
      "QUOTE_FROM_FUTURE",
    ],
  ] as const)("fails closed for a %s", (_label, quoteOverride, code) => {
    const current = pair();
    const result = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left, quoteOverride),
        rightQuote: quote(current.right),
      }),
    );
    expect(codes(result)).toContain(code);
  });

  it("rejects stale link and quote fingerprint bindings before inspecting prices", () => {
    const current = pair();
    const staleContract = {
      ...current.left,
      reference: { ...current.left.reference, venueRevision: "changed" },
    };
    const staleLink = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: staleContract,
        rightContract: current.right,
        leftQuote: quote(current.left),
        rightQuote: quote(current.right),
      }),
    );
    const badFingerprint = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: {
          ...quote(current.left),
          settlementFingerprint: HASH_A,
        },
        rightQuote: quote(current.right),
      }),
    );

    expect(codes(staleLink)).toContain("LINK_NOT_CURRENT");
    expect(codes(badFingerprint)).toContain("QUOTE_BINDING_MISMATCH");
  });

  it("rejects a forged minimum-order quantity even when its evidence hash is recomputed", () => {
    const current = pair();
    const forgedLeft = rehashQuote({
      ...quote(current.left),
      minimumOrderQuantity: {
        atomic: "0",
        scale: 6,
        exactShares: { numerator: "0", denominator: "1" },
        conversionEvidenceHash: HASH_A,
      },
    });
    const result = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: forgedLeft,
        rightQuote: quote(current.right),
      }),
    );

    expect(codes(result)).toContain("QUOTE_BINDING_MISMATCH");
  });

  it("rejects a Polymarket quote whose reviewed market identity differs from its contract", () => {
    const current = polymarketPair();
    const forgedLeft = {
      ...quote(current.left, { marketIdentityHash: HASH_C }),
      marketIdentityHash: HASH_A,
    } as NormalizedVenueBook;
    const result = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: forgedLeft,
        rightQuote: quote(current.right),
      }),
    );

    expect(codes(result)).toContain("QUOTE_BINDING_MISMATCH");
  });

  it("uses canonical competition fields, never a display title, to enforce World Cup scope", () => {
    const wrongEdition = scanWorldCupCandidate(
      scanInput({ competition: { id: "fifa-world-cup", edition: "2030" } }),
    );
    expect(codes(wrongEdition)).toContain("NOT_WORLD_CUP");

    const current = pair();
    const renamedLeft = {
      ...current.left,
      title: "Not a World Cup market according to this misleading title",
    };
    const renamedRight = {
      ...current.right,
      title: "World Cup guaranteed profit!!!",
    };
    const original = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left),
        rightQuote: quote(current.right),
      }),
    );
    const renamed = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: renamedLeft,
        rightContract: renamedRight,
        leftQuote: quote(current.left),
        rightQuote: quote(current.right),
      }),
    );
    expect(renamed).toEqual(original);
  });

  it("enforces close buffer, venue minimums, and exact cross-scale representability", () => {
    const current = pair();
    const closeBuffered = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left),
        rightQuote: quote(current.right),
        settings: { ...scanInput().settings, closeBufferMs: 60_000 },
      }),
    );
    const insufficient = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left, { minimumOrder: "5", quantity: "4" }),
        rightQuote: quote(current.right, { quantity: "4" }),
        settings: {
          ...scanInput().settings,
          maximumShares: reduceShares("4", "1"),
        },
      }),
    );
    const nonRepresentable = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left, { quantityScale: 2 }),
        rightQuote: quote(current.right, { quantityScale: 6 }),
        settings: {
          ...scanInput().settings,
          maximumShares: reduceShares("1", "1000"),
        },
      }),
    );

    expect(codes(closeBuffered)).toContain("CLOSE_BUFFER_REACHED");
    expect(codes(insufficient)).toContain("INSUFFICIENT_LIQUIDITY");
    expect(codes(nonRepresentable)).toContain(
      "MAXIMUM_SHARES_NOT_REPRESENTABLE",
    );
  });

  it("keeps the 100 bps and 100,000 microdollar floors even when settings request zero", () => {
    const current = pair();
    const belowProfitFloor = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left, { price: "0.49", quantity: "1" }),
        rightQuote: quote(current.right, { price: "0.5", quantity: "1" }),
        settings: {
          ...scanInput().settings,
          maximumShares: reduceShares("1", "1"),
        },
      }),
    );
    const belowReturnFloor = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left, {
          price: "0.495",
          quantity: "20",
          tickSize: "0.005",
        }),
        rightQuote: quote(current.right, { price: "0.5", quantity: "20" }),
        settings: {
          ...scanInput().settings,
          maximumShares: reduceShares("20", "1"),
        },
      }),
    );

    expect(codes(belowProfitFloor)).toContain("GROSS_THRESHOLDS_NOT_MET");
    expect(codes(belowReturnFloor)).toContain("GROSS_THRESHOLDS_NOT_MET");
  });

  it("returns typed no-candidate evidence when either side has no asks", () => {
    const current = pair();
    const result = scanWorldCupCandidate(
      scanInput({
        link: current.link,
        leftContract: current.left,
        rightContract: current.right,
        leftQuote: quote(current.left, { asks: [] }),
        rightQuote: quote(current.right),
      }),
    );

    expect(codes(result)).toContain("INSUFFICIENT_LIQUIDITY");
  });
});
