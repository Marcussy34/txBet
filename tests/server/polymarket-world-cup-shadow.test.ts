import { describe, expect, it, vi } from "vitest";

import { sha256Canonical, type JsonValue } from "@/core/canonical-json";
import { reduceShares } from "@/core/live-money";
import {
  proveComplement,
  type ContractRevisionRef,
  type LinkableContract,
} from "@/market-truth/contract-links";
import {
  normalizeVenueBook,
  type PolymarketReviewedMarketIdentity,
} from "@/market-truth/quote-normalization";
import {
  settlementFingerprint,
  settlementProvenanceHash,
  type SettlementSpecV1,
} from "@/market-truth/settlement-spec";
import {
  createPolymarketWorldCupShadowReader,
  POLYMARKET_WORLD_CUP_SHADOW_CACHE_TTL_MS,
  readPolymarketWorldCupShadowStatus,
  type PolymarketWorldCupShadowDependencies,
} from "@/server/polymarket/world-cup-shadow";
import { POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS } from "@/venues/polymarket/contracts";

import { HASH_B, worldCupSettlementSpec } from "../market-truth/fixtures";

const NOW = 1_784_238_770_635;
const REVIEW_ENV = "POLYMARKET_WORLD_CUP_SHADOW_REVIEW_JSON";
const CATALOG_ID = "540844";
const CATALOG_REVISION = `${CATALOG_ID}:2026-07-17T10:00:00.123456Z`;
const CONDITION_ID = `0x${"ab".repeat(32)}`;
const TOKEN_ID =
  "105267568073659068217311993901927962476298440625043565106676088842803600775810";

function identity(
  overrides: Partial<Omit<PolymarketReviewedMarketIdentity, "evidenceHash">> = {},
): PolymarketReviewedMarketIdentity {
  const projection = {
    schemaVersion: "polymarket-reviewed-market-identity-v1",
    catalogSchemaVersion: "polymarket-gamma-market-v1",
    catalogContractId: CATALOG_ID,
    catalogRevisionId: CATALOG_REVISION,
    conditionId: CONDITION_ID,
    outcomeLabel: "YES",
    tokenId: TOKEN_ID,
    tickSize: "0.01",
    negRisk: false,
    quantityScale: 6,
    reviewedAtEpochMs: NOW - 10_000,
    ...overrides,
  } as const;
  return Object.freeze({
    ...projection,
    evidenceHash: sha256Canonical(projection as unknown as JsonValue),
  });
}

function contract(input: {
  venueId: string;
  contractId: string;
  outcome: "YES" | "NO";
  spec: SettlementSpecV1;
  marketIdentityHash?: string;
}): LinkableContract {
  const payoutAssetRevision = `${input.venueId}-asset-v1`;
  const reference: ContractRevisionRef = {
    venueId: input.venueId,
    contractId: input.contractId,
    settlementSpecVersion: input.spec.specVersion,
    settlementFingerprint: settlementFingerprint(input.spec),
    venueRevision: input.spec.evidence.venueRevision,
    rawRuleTextHash: input.spec.evidence.rawRuleTextHash,
    settlementProvenanceHash: settlementProvenanceHash(input.spec),
    canonicalEntityMappingRevision:
      input.spec.evidence.canonicalEntityMappingRevision,
    tradingClosesAt: NOW + 60_000,
    closeTimeRevision: "close-v1",
    closeTimeEvidenceHash: HASH_B,
    payoutAssetRevision,
    ...(input.marketIdentityHash === undefined
      ? {}
      : { marketIdentityHash: input.marketIdentityHash }),
  };
  return {
    reference,
    title: "Display text is not settlement evidence",
    outcome: input.outcome,
    outcomeUniverse: ["YES", "NO"],
    status: "open",
    settlementSpec: input.spec,
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

function reviewedPlan(reviewedIdentity = identity()) {
  const base = worldCupSettlementSpec();
  const polymarketSpec = worldCupSettlementSpec({
    evidence: {
      ...base.evidence,
      venueRevision: CATALOG_REVISION,
      nativeIdentity: {
        ...base.evidence.nativeIdentity,
        marketId: CATALOG_ID,
        outcomeId: TOKEN_ID,
      },
    },
  });
  const otherSpec = worldCupSettlementSpec({
    evidence: {
      ...base.evidence,
      venueRevision: "reviewed-venue-revision-1",
      nativeIdentity: {
        ...base.evidence.nativeIdentity,
        marketId: "reviewed-market-2",
        outcomeId: "reviewed-outcome-no",
      },
    },
  });
  const leftContract = contract({
    venueId: "polymarket",
    contractId: CATALOG_ID,
    outcome: "YES",
    spec: polymarketSpec,
    marketIdentityHash: reviewedIdentity.evidenceHash,
  });
  const rightContract = contract({
    venueId: "reviewed-venue",
    contractId: "reviewed-contract-2",
    outcome: "NO",
    spec: otherSpec,
  });
  const link = proveComplement(leftContract, rightContract);
  if (link.status !== "VERIFIED") throw new Error("Expected reviewed test link");
  const right = normalizeVenueBook({
    contract: rightContract,
    sourceMarketId: "reviewed-market-2",
    sourceOutcomeId: "reviewed-outcome-no",
    sourceUpdatedAt: NOW - 100,
    receivedAt: NOW - 50,
    bookRevision: "reviewed-book-v1",
    tickSizeUsd: "0.01",
    minimumOrderShares: "1",
    quantityScale: 6,
    bids: [],
    asks: [{ priceUsd: "0.5", quantityShares: "10" }],
  });
  if (!right.ok) throw new Error("Expected reviewed quote");

  return {
    schemaVersion: "polymarket-world-cup-shadow-review-v1",
    competition: { id: "fifa-world-cup", edition: "2026" },
    linkReview: {
      method: link.method,
      transformRuleId: link.transformRuleId,
      fingerprint: link.fingerprint,
    },
    leftContract,
    rightContract,
    leftSource: {
      kind: "polymarket-public-book",
      reviewedMarketIdentity: reviewedIdentity,
    },
    rightSource: {
      kind: "reviewed-normalized-book",
      quote: right.quote,
    },
    settings: {
      maxQuoteAgeMs: 5_000,
      maxFutureSkewMs: 1_000,
      closeBufferMs: 5_000,
      maximumShares: reduceShares("2", "1"),
      minGrossReturnBps: 0,
      minGrossProfitMicros: 0,
    },
  } as const;
}

function dependencies(
  snapshotOverrides: Readonly<Record<string, unknown>> = {},
): PolymarketWorldCupShadowDependencies {
  return {
    fetchExecutionMarketSnapshot: vi.fn().mockResolvedValue({
      schemaVersion: "polymarket-clob-market-snapshot-v1",
      tokenId: TOKEN_ID,
      conditionId: CONDITION_ID,
      observedAtEpochMs: String(NOW - 100),
      retrievedAtEpochMs: NOW - 50,
      sourceRevision: "9".repeat(40),
      tickSize: "0.01",
      negRisk: false,
      minimumOrderSize: "1",
      lastTradePrice: "0.4",
      bids: [{ price: "0.39", size: "10" }],
      asks: [{ price: "0.4", size: "10" }],
      ...snapshotOverrides,
    }),
  };
}

describe("readPolymarketWorldCupShadowStatus", () => {
  it.each([
    {},
    { [REVIEW_ENV]: "" },
    { [REVIEW_ENV]: "   " },
  ])("returns an explicit unconfigured state without inventing an identity or reading the network", async (source) => {
      const deps = dependencies();

      await expect(
        readPolymarketWorldCupShadowStatus({
          source,
          nowMs: NOW,
          dependencies: deps,
        }),
      ).resolves.toEqual({
        status: "unconfigured",
        venue: "polymarket",
        mode: "SHADOW_ONLY",
        executable: false,
        liveData: false,
        reason: "POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED",
      });
      expect(deps.fetchExecutionMarketSnapshot).not.toHaveBeenCalled();
    });

  it("feeds an official public Polymarket book through reviewed normalization and the World Cup scanner", async () => {
    const deps = dependencies();
    const result = await readPolymarketWorldCupShadowStatus({
      source: { [REVIEW_ENV]: JSON.stringify(reviewedPlan()) },
      nowMs: NOW,
      dependencies: deps,
    });

    expect(deps.fetchExecutionMarketSnapshot).toHaveBeenCalledOnce();
    expect(deps.fetchExecutionMarketSnapshot).toHaveBeenCalledWith(TOKEN_ID);
    expect(result).toMatchObject({
      status: "scanned",
      venue: "polymarket",
      mode: "SHADOW_ONLY",
      executable: false,
      liveData: true,
      provenance: "polymarket-public-clob",
      verification: "PINNED_IDENTITY_LIVE_BOOK",
      liveBook: {
        side: "left",
        observedAtMs: NOW - 100,
        receivedAtMs: NOW - 50,
        bookRevision: "9".repeat(40),
      },
      scan: {
        status: "CANDIDATE",
        exactShares: { numerator: "2", denominator: "1" },
        grossProfitMicros: 200_000,
        grossReturnBps: 1_111,
        nonExecutableReasons: [
          "ASSET_VALUE_POLICY_NOT_BOUND",
          "VENUE_FEES_NOT_INCLUDED",
          "NETWORK_COST_NOT_INCLUDED",
          "LIVE_EXECUTION_NOT_AUTHORIZED",
        ],
      },
    });
    expect(JSON.stringify(result)).not.toContain(REVIEW_ENV);
  });

  it("fails closed before a public read for malformed, non-World-Cup, or identity-unbound review data", async () => {
    const malformed = "{not-json";
    const nonWorldCup = reviewedPlan();
    const unbound = reviewedPlan();
    const futureReview = reviewedPlan(
      identity({ reviewedAtEpochMs: NOW + 1 }),
    );
    const staleReview = reviewedPlan(
      identity({
        reviewedAtEpochMs:
          NOW - POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS - 1,
      }),
    );
    const cases = [
      malformed,
      JSON.stringify({
        ...nonWorldCup,
        competition: { id: "international-friendly", edition: "2026" },
      }),
      JSON.stringify({
        ...unbound,
        leftSource: {
          ...unbound.leftSource,
          reviewedMarketIdentity: {
            ...unbound.leftSource.reviewedMarketIdentity,
            evidenceHash: "f".repeat(64),
          },
        },
      }),
      JSON.stringify(futureReview),
      JSON.stringify(staleReview),
    ];

    for (const value of cases) {
      const deps = dependencies();
      await expect(
        readPolymarketWorldCupShadowStatus({
          source: { [REVIEW_ENV]: value },
          nowMs: NOW,
          dependencies: deps,
        }),
      ).resolves.toEqual({
        status: "unavailable",
        venue: "polymarket",
        mode: "SHADOW_ONLY",
        executable: false,
        liveData: false,
        reason: "INVALID_POLYMARKET_WORLD_CUP_REVIEW",
      });
      expect(deps.fetchExecutionMarketSnapshot).not.toHaveBeenCalled();
    }
  });

  it("returns only stable public-read and normalization failures", async () => {
    const secret = "do-not-leak-this-upstream-value";
    const failedDeps = dependencies();
    vi.mocked(failedDeps.fetchExecutionMarketSnapshot).mockRejectedValue(
      new Error(secret),
    );
    const source = { [REVIEW_ENV]: JSON.stringify(reviewedPlan()) };

    const publicFailure = await readPolymarketWorldCupShadowStatus({
      source,
      nowMs: NOW,
      dependencies: failedDeps,
    });
    const normalizationFailure = await readPolymarketWorldCupShadowStatus({
      source,
      nowMs: NOW,
      dependencies: dependencies({ conditionId: `0x${"cd".repeat(32)}` }),
    });
    const repeatedLevelFailures = await readPolymarketWorldCupShadowStatus({
      source,
      nowMs: NOW,
      dependencies: dependencies({
        asks: Array.from({ length: 100 }, () => ({ price: "invalid", size: "1" })),
      }),
    });

    expect(publicFailure).toMatchObject({
      status: "unavailable",
      reason: "POLYMARKET_PUBLIC_READ_FAILED",
    });
    expect(JSON.stringify(publicFailure)).not.toContain(secret);
    expect(normalizationFailure).toEqual({
      status: "unavailable",
      venue: "polymarket",
      mode: "SHADOW_ONLY",
      executable: false,
      liveData: false,
      reason: "POLYMARKET_PUBLIC_BOOK_REJECTED",
      reasonCodes: ["SOURCE_MARKET_MISMATCH"],
    });
    expect(repeatedLevelFailures).toMatchObject({
      status: "unavailable",
      reason: "POLYMARKET_PUBLIC_BOOK_REJECTED",
      reasonCodes: ["INVALID_PRICE"],
    });
  });

  it("reports scanner refusal codes while keeping a valid live book observable", async () => {
    const plan = reviewedPlan();
    const stalePlan = {
      ...plan,
      rightSource: {
        ...plan.rightSource,
        quote: {
          ...plan.rightSource.quote,
          sourceUpdatedAt: NOW - 10_000,
        },
      },
    };

    const result = await readPolymarketWorldCupShadowStatus({
      source: { [REVIEW_ENV]: JSON.stringify(stalePlan) },
      nowMs: NOW,
      dependencies: dependencies(),
    });

    expect(result).toMatchObject({
      status: "scanned",
      liveData: true,
      scan: { status: "NO_CANDIDATE" },
    });
    if (result.status !== "scanned" || result.scan.status !== "NO_CANDIDATE") {
      return;
    }
    // Integrity mismatch is expected because the review quote was modified after hashing.
    expect(result.scan.reasonCodes).toEqual(["QUOTE_BINDING_MISMATCH"]);
  });

  it("samples the decision clock after public I/O and rejects a quote that expired in flight", async () => {
    let clockCall = 0;
    const result = await readPolymarketWorldCupShadowStatus({
      source: { [REVIEW_ENV]: JSON.stringify(reviewedPlan()) },
      clock: () => {
        clockCall += 1;
        return clockCall === 1 ? NOW : NOW + 6_000;
      },
      dependencies: dependencies(),
    });

    expect(clockCall).toBe(2);
    expect(result).toMatchObject({
      status: "scanned",
      scan: { status: "NO_CANDIDATE" },
    });
    if (result.status !== "scanned" || result.scan.status !== "NO_CANDIDATE") {
      return;
    }
    expect(result.scan.reasonCodes).toContain("QUOTE_STALE");
  });

  it("rejects a reviewed link whose trading window closes during public I/O", async () => {
    let clockCall = 0;
    const result = await readPolymarketWorldCupShadowStatus({
      source: { [REVIEW_ENV]: JSON.stringify(reviewedPlan()) },
      clock: () => {
        clockCall += 1;
        return clockCall === 1 ? NOW : NOW + 60_000;
      },
      dependencies: dependencies(),
    });

    expect(result).toMatchObject({
      status: "scanned",
      scan: { status: "NO_CANDIDATE", reasonCodes: ["LINK_NOT_CURRENT"] },
    });
  });

  it("fails closed if the decision clock moves backwards during public I/O", async () => {
    let clockCall = 0;
    const result = await readPolymarketWorldCupShadowStatus({
      source: { [REVIEW_ENV]: JSON.stringify(reviewedPlan()) },
      clock: () => {
        clockCall += 1;
        return clockCall === 1 ? NOW : NOW - 1;
      },
      dependencies: dependencies(),
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "INVALID_POLYMARKET_WORLD_CUP_REVIEW",
    });
  });

  it("rechecks review age after public I/O", async () => {
    const reviewTime = NOW - POLYMARKET_CONTRACT_CONFIG_MAX_AGE_MS;
    let clockCall = 0;
    const deps = dependencies();
    const result = await readPolymarketWorldCupShadowStatus({
      source: {
        [REVIEW_ENV]: JSON.stringify(
          reviewedPlan(identity({ reviewedAtEpochMs: reviewTime })),
        ),
      },
      clock: () => {
        clockCall += 1;
        return clockCall === 1 ? NOW : NOW + 1;
      },
      dependencies: deps,
    });

    expect(result).toMatchObject({
      status: "unavailable",
      reason: "INVALID_POLYMARKET_WORLD_CUP_REVIEW",
    });
    expect(deps.fetchExecutionMarketSnapshot).toHaveBeenCalledOnce();
  });
});

describe("createPolymarketWorldCupShadowReader", () => {
  it("coalesces an in-flight read and reuses it only for the short bounded TTL", async () => {
    let now = NOW;
    let resolveRead!: (value: Awaited<ReturnType<typeof readPolymarketWorldCupShadowStatus>>) => void;
    const read = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<typeof readPolymarketWorldCupShadowStatus>>>(
          (resolve) => {
            resolveRead = resolve;
          },
        ),
    );
    const reader = createPolymarketWorldCupShadowReader({
      read,
      clock: () => now,
    });

    const first = reader();
    const concurrent = reader();
    expect(read).toHaveBeenCalledOnce();
    resolveRead({
      status: "unconfigured",
      venue: "polymarket",
      mode: "SHADOW_ONLY",
      executable: false,
      liveData: false,
      reason: "POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED",
    });
    await expect(first).resolves.toEqual(await concurrent);

    now += POLYMARKET_WORLD_CUP_SHADOW_CACHE_TTL_MS - 1;
    await reader();
    expect(read).toHaveBeenCalledOnce();

    now += 1;
    void reader();
    expect(read).toHaveBeenCalledTimes(2);
  });
});
