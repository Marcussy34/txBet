# World Cup Market Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catalog every discovered World Cup market, prove exact settlement equivalence for executable pairs, normalize venue-native decimal books without floats, and persist deterministic shadow opportunities from live inputs.

**Architecture:** TxLINE supplies fixture/event truth and wakeups; it never supplies executable liquidity. Venue catalogs and books supply contract rules and prices. Raw contracts are always cataloged, but only a complete versioned settlement specification can become a live canonical contract. A reviewed exact-complement link is required before the live optimizer can produce an opportunity.

**Tech Stack:** TypeScript pure modules, Zod, SHA-256 canonical JSON, TxLINE REST/SSE, Supabase Postgres, Vitest, and Railway worker-compatible dependency injection.

## Global Constraints

- Preserve `runPipeline()`, `scanArbitrage()`, demo fixtures, replay P&L, and simulated disclosure behavior.
- Build the live path beside the replay path; do not weaken existing exact comparisons to accept broader contracts.
- Catalog all World Cup market families, including unknown families. Unknown/incomplete semantics stay `UNVERIFIED` and cannot execute.
- Titles, embeddings, fuzzy text, and language-model output may nominate a pair but never prove it.
- TxLINE odds are reference observations only and never become `VenueQuote` or live executable depth.
- No JavaScript float can authorize a price, quantity, fee, payout, or order.
- A raw-rule hash, venue revision, settlement-spec version, or book revision change invalidates dependent artifacts.
- Do not commit or push.

---

## Task 1: Add Exact Live Money, Quantity, and Canonical JSON Primitives

**Files:**

- Create: `src/core/live-money.ts`
- Create: `src/core/canonical-json.ts`
- Create: `tests/core/live-money.test.ts`
- Create: `tests/core/canonical-json.test.ts`

- [ ] Write failing tests for exact USD parsing, token atomic parsing, reduced rational shares, exact cross-scale conversion, cross-scale equality, non-divisible conversion refusal, checked bigint basis-point multiplication, safe-integer conversion, excess precision, exponent notation, negative/zero policy, unsafe integer overflow, canonical key ordering, array ordering, and hash sensitivity.

```ts
expect(parseUsdMicros("0.100001")).toBe(100_001);
expect(() => parseUsdMicros("1e-3")).toThrow();
expect(parseAtomicAmount("00012")).toBe("12");
expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
```

- [ ] Run and confirm the modules are missing:

```bash
pnpm vitest run tests/core/live-money.test.ts tests/core/canonical-json.test.ts
```

- [ ] Implement:

```ts
export type AtomicAmount = `${bigint}`;

export interface ExactShares {
  numerator: AtomicAmount;
  denominator: AtomicAmount;
}

export interface ExactRatio {
  numerator: AtomicAmount;
  denominator: AtomicAmount;
}

export interface VenueQuantity {
  atomic: AtomicAmount;
  scale: number;
  exactShares: ExactShares;
  conversionEvidenceHash: string;
}

export function parseUsdMicros(value: string): Micros;
export function formatUsdMicros(value: Micros): string;
export function parseAtomicAmount(value: string, options?: { allowZero?: boolean }): AtomicAmount;
export function addAtomic(left: AtomicAmount, right: AtomicAmount): AtomicAmount;
export function compareAtomic(left: AtomicAmount, right: AtomicAmount): -1 | 0 | 1;
export function reduceShares(numerator: string, denominator: string): ExactShares;
export function venueQuantity(atomic: string, scale: number): VenueQuantity;
export function compareShares(left: ExactShares, right: ExactShares): -1 | 0 | 1;
export function ceilRatioProductMicros(ratio: ExactRatio, shares: ExactShares): Micros;
export function mulDivFloorMicros(value: Micros, numerator: number, denominator: number): Micros;
export function canonicalJson(value: JsonValue): string;
export function sha256Canonical(value: JsonValue): string;
```

Decimal parsing must use string splitting and integer arithmetic. `ExactShares` is always a
positive reduced rational. Venue quantities prove `atomic / 10^scale == exactShares`; two
venues are equal only when their rationals compare equal by bigint cross-multiplication.
`mulDivFloorMicros` performs the full multiply/divide with bigint and converts back only
after a safe-range proof; live authorization code never uses floating arithmetic or
`Math.floor`. Canonical JSON must reject `undefined`, `NaN`, infinities, `bigint`,
functions, symbols, and duplicate semantic representations; bigints enter it only as
canonical decimal strings.

- [ ] Run focused tests and existing money tests:

```bash
pnpm vitest run tests/core/live-money.test.ts tests/core/canonical-json.test.ts tests/optimizer.test.ts tests/executor.test.ts
```

Expected: all pass and existing replay results are unchanged.

- [ ] Review checkpoint; do not commit.

## Task 2: Define the Complete Versioned World Cup Settlement Model

**Files:**

- Create: `src/core/settlement-spec.ts`
- Create: `src/core/live-market-types.ts`
- Create: `tests/core/settlement-spec.test.ts`
- Create: `tests/fixtures/settlement/world-cup-specs.ts`
- Modify: `docs/architecture.md`

- [ ] Write failing tests covering every field, especially regulation versus extra time/penalties, group/tournament futures, team/player subjects, thresholds, ranges, rounding, draws, pushes, dead heats, postponement, abandonment, rescheduling, qualification, replacement teams, resolution sources/deadlines, disputes, revision, currency, and payout.

- [ ] Define a catalog result that can retain any raw market but requires a complete specification for execution:

```ts
export interface SettlementRuleSet {
  drawRuleId: string;
  tieRuleId: string;
  deadHeatRuleId: string;
  sharedWinnerRuleId: string;
  postponementRuleId: string;
  abandonmentRuleId: string;
  cancellationRuleId: string;
  rescheduleRuleId: string;
  voidRuleId: string;
  qualificationRuleId: string;
  replacementRuleId: string;
  resolutionSourceId: string;
  resolutionDeadline: number | null;
  disputeRuleId: string;
  revisionRuleId: string;
}

export interface SettlementSpecV1 {
  schemaVersion: "world-cup-settlement-v1";
  specVersion: number;
  competition: { id: string; edition: string };
  stage: { id: string | null; group: string | null; round: string | null };
  fixtureId: string | null;
  subject: {
    kind: "competition" | "group" | "fixture" | "team" | "player" | "manager" | "other";
    id: string;
    name: string;
  };
  proposition: {
    familyId: string;
    statistic: string;
    comparator: "none" | "eq" | "gt" | "gte" | "lt" | "lte" | "between";
    threshold: string | null;
    lowerBound: string | null;
    upperBound: string | null;
    unit: string | null;
    roundingRuleId: string;
  };
  evaluation: {
    period: string;
    startsAt: number | null;
    endsAt: number | null;
    includesStoppageTime: boolean;
    includesExtraTime: boolean;
    includesPenalties: boolean;
  };
  rules: SettlementRuleSet;
  payout: { valueUnit: "USD"; nominalMicrosPerShare: Micros };
  evidence: {
    sourceUrl: string;
    rawRuleTextHash: string;
    venueRevision: string;
    canonicalEntityMappingRevision: string;
    nativeIdentity: {
      competitionId: string;
      stageId: string | null;
      fixtureId: string | null;
      subjectId: string;
      marketId: string;
      outcomeId: string;
      statisticId: string | null;
    };
    retrievedAt: number;
  };
}

export type SettlementNormalizationResult =
  | { status: "VERIFIED"; spec: SettlementSpecV1; fingerprint: string }
  | {
      status: "UNVERIFIED";
      missingFields: readonly string[];
      conflicts: readonly string[];
      rawRuleTextHash: string;
      venueRevision: string;
    };

export interface LiveCanonicalContract {
  contractRevisionId: string;
  venueId: string;
  contractId: string;
  title: string;
  outcome: "YES" | "NO";
  status: "open" | "suspended" | "closed" | "resolved";
  settlementSpec: SettlementSpecV1;
  settlementFingerprint: string;
  venueRevision: string;
  rawRuleTextHash: string;
  tradingClosesAt: number;
  closeTimeRevision: string;
  closeTimeEvidenceHash: string;
  payoutAsset: {
    network: string;
    assetId: string;
    symbol: string;
    decimals: number;
    assetRevision: string;
  };
}

export interface AssetValuePolicy {
  version: string;
  network: string;
  assetId: string;
  assetRevision: string;
  usdLowerBoundMicrosPerToken: Micros;
  usdUpperBoundMicrosPerToken: Micros;
  validUntil: number;
  evidenceHash: string;
}

export type LiveFeeModel =
  | {
      kind: "bps-on-cost";
      bps: number;
      minimumFeeMicros: Micros;
      chargeAsset: "collateral" | "outcome" | "proceeds";
      chargeAssetId: string;
      chargeAssetDecimals: number;
      roundingRule: "ceil-atomic" | "floor-atomic" | "exact";
    }
  | {
      kind: "flat-per-whole-share";
      microsPerShare: Micros;
      chargeAsset: "collateral" | "outcome" | "proceeds";
      chargeAssetId: string;
      chargeAssetDecimals: number;
      roundingRule: "ceil-atomic" | "floor-atomic" | "exact";
    }
  | {
      kind: "exact-ladder";
      chargeAsset: "collateral" | "outcome" | "proceeds";
      chargeAssetId: string;
      chargeAssetDecimals: number;
      roundingRule: "exact";
      cumulative: readonly {
        grossQuantity: VenueQuantity;
        netQuantity: VenueQuantity;
        feeMicros: Micros;
      }[];
    };

export interface LiveFeeAssessment {
  feeScheduleVersion: string;
  chargeAsset: "collateral" | "outcome" | "proceeds";
  chargeAssetId: string;
  chargeAtomic: AtomicAmount;
  chargeAssetDecimals: number;
  roundingRule: "ceil-atomic" | "floor-atomic" | "exact";
  grossOutcomeQuantity: VenueQuantity;
  netOutcomeQuantity: VenueQuantity;
  feeMicros: Micros;
  evidenceHash: string;
}

export interface LiveNetOutcomeBounds {
  schemaVersion: "live-net-outcome-bounds-v1";
  grossOrderQuantity: VenueQuantity;
  minimumNetOutcome: VenueQuantity;
  maximumNetOutcome: VenueQuantity;
  minimumFeeMicros: Micros;
  maximumFeeMicros: Micros;
  feeScheduleVersion: string;
  proofKind: "enumerated-execution-paths" | "official-price-invariant";
  permittedPriceRangeHash: string;
  executionPathSetHash: string;
  evidenceHash: string;
}

export interface LiveVenueQuote {
  profileId: string | null;
  contract: LiveCanonicalContract;
  status: "open" | "suspended" | "closed";
  asks: readonly {
    grossQuantity: VenueQuantity;
    netQuantity: VenueQuantity;
    priceMicrosPerShare: ExactRatio;
    fullLevelCostMicros: Micros;
    fillPolicy: "partial" | "all-or-nothing";
    acquisitionPath: "direct-buy" | "complete-set-sell-complement";
    acquisitionEvidenceHash: string;
    costEvidenceHash: string;
  }[];
  bookRevision: string;
  sourceUpdatedAt: number;
  receivedAt: number;
  feeScheduleVersion: string;
  feeModel: LiveFeeModel;
  assetValuePolicy: AssetValuePolicy;
  networkCostPolicyVersion: string;
  networkCostMicros: Micros;
  setupCostMicros: Micros;
  slippageBufferBps: number;
  validity:
    | { kind: "time"; expiresAt: number }
    | {
        kind: "solana-block-height";
        expiresAt: number;
        contextSlot: number;
        lastValidBlockHeight: number;
      };
}

export interface LiveArbitrageSettings {
  allocatedCapitalMicros: Micros;
  maxExposureMicros: Micros;
  minNetReturnBps: number;
  minNetProfitMicros: Micros;
  safetyBufferBps: number;
  maxQuoteAgeMs: number;
  approvedVenues: ReadonlySet<string>;
}
```

`tradingClosesAt` is the venue's authoritative order-entry close, not the fixture end or
settlement deadline. A live contract cannot be constructed without a finite close time,
source revision, and evidence hash. Any close-time change invalidates its links, quotes,
opportunities, and prepared artifacts.

`payoutAsset` is execution provenance, not part of the cross-venue semantic fingerprint.
The optimizer requires a current `AssetValuePolicy` for each collateral: payout is valued
at the conservative USD lower bound and spend/setup costs at the upper bound. Different
stablecoins or networks may link only when the semantic nominal USD payout matches and
both independent asset policies are current. Missing, expired, or revision-mismatched
policy fails closed; a symbol such as `USDC` or `USDT` is never treated as proof of $1.

Every competition, stage, fixture, subject, statistic, unit, and rule ID in the semantic
fields is a txBet canonical registry ID, never a venue-native identifier. The evidence
record retains the venue-native IDs and the reviewed canonical-entity mapping revision.
Every rule ID is a nonempty normalized registry key. A normalizer cannot use free prose
in place of a rule ID.

- [ ] Validate `familyId` as a normalized stable identifier rather than a closed enumeration. This permits all catalog families while requiring a reviewed normalizer before `VERIFIED`.

- [ ] Implement `settlementFingerprint(spec)` over an explicit
  `SettlementSemanticProjectionV1`. Include canonical competition/stage/fixture/subject
  identity, proposition, evaluation, normalized rules, and payout. Exclude the entire
  venue provenance/evidence object, local `specVersion`, schema bookkeeping, and display
  names. Separately compute `settlementProvenanceHash` over venue-native IDs, source URL,
  raw-rule hash, venue revision, mapping revision, and retrieval evidence. Reject an
  invalid, unmapped, or incomplete spec rather than producing either hash.

- [ ] Add tests proving semantically identical contracts with different venue URLs,
  native IDs, raw-rule hashes, revisions, retrieval times, spec versions, and display names
  share one semantic fingerprint but have distinct provenance hashes. Also prove that any
  semantic field change changes the semantic fingerprint and that a mapping-revision
  change invalidates a link without changing the prior semantic record.

- [ ] Run:

```bash
pnpm vitest run tests/core/settlement-spec.test.ts tests/settlement.test.ts tests/pipeline.test.ts tests/backtest.test.ts
pnpm typecheck
```

Expected: all pass; replay snapshots remain deterministic.

- [ ] Review checkpoint; do not commit.

## Task 3: Expand TxLINE Fixture, Score, and Reference-Odds Ingestion

**Files:**

- Modify: `src/lib/txline/client.ts`
- Create: `src/lib/txline/schemas.ts`
- Create: `src/lib/txline/normalize-fixture.ts`
- Create: `src/lib/txline/normalize-odds.ts`
- Create: `src/core/world-cup.ts`
- Create: `src/workers/market-data/txline-feed.ts`
- Modify: `scripts/smoke-txline.ts`
- Create: `tests/txline/fixtures.test.ts`
- Create: `tests/txline/odds.test.ts`
- Create: `tests/txline/feed.test.ts`
- Create: `tests/fixtures/txline/fixtures-snapshot.json`
- Create: `tests/fixtures/txline/odds-snapshot.json`
- Create: `tests/fixtures/txline/score-event.json`

- [ ] Re-fetch the official TxLINE quickstart and World Cup pages. Confirm mainnet base URL, service-level requirements, fixture/score/odds route shapes, SSE auth, and reconnect fields before changing the client.

- [ ] Add sanitized official-shape fixtures and failing tests for URL encoding, PascalCase provider fields, invalid dates/IDs, unknown score actions, reference odds labeling, SSE auth headers, reconnect with `Last-Event-ID`, JWT renewal, deduplication, invalid sequence, and cancellation.

- [ ] Add exact client methods:

```ts
export interface WorldCupFixture {
  id: string;
  competitionId: string;
  competitionEdition: string;
  fixtureGroupId: string;
  startsAt: number;
  home: { id: string; name: string };
  away: { id: string; name: string };
  sourceUpdatedAt: number;
}

export function buildFixtureSnapshotUrl(
  baseUrl: string,
  query: { startEpochDay?: number; competitionId?: number },
): string;

export function fetchFixtureSnapshot(
  input: TxLineAuthenticatedRequest,
): Promise<readonly unknown[]>;

export function fetchOddsSnapshot(
  input: TxLineAuthenticatedRequest & { fixtureId: string; asOf?: number },
): Promise<readonly unknown[]>;

export function openOddsStream(input: TxLineStreamInput): EventSource;
```

- [ ] Implement `TxLineFeed` with injected fetch/EventSource/clock/sink. It bootstraps fixtures and scores, validates all payloads with Zod, renews guest JWT after auth failure, reconnects with bounded exponential backoff and `Last-Event-ID`, and deduplicates persisted source IDs.

- [ ] Allow only competition IDs from `TXLINE_WORLD_CUP_COMPETITION_IDS`. Never infer competition edition from a title. Emit odds as `reference-odds`; make their type incompatible with `LiveVenueQuote`.

- [ ] Update the smoke script to report fixture, score, and reference-odds counts without logging tokens or raw payloads.

- [ ] Run:

```bash
pnpm vitest run tests/txline tests/txline.test.ts tests/txline-smoke.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 4: Prove Complementarity and Invalidate Stale Contract Links

**Files:**

- Create: `src/core/contract-links.ts`
- Create: `tests/core/contract-links.test.ts`

- [ ] Write one failing mismatch case for every settlement field and explicit cases for same polarity, non-exhaustive multi-outcome sets, push-capable totals, unequal payouts, stale revisions, and reviewed transforms.

```ts
export interface ContractRevisionRef {
  venueId: string;
  contractId: string;
  settlementSpecVersion: number;
  settlementFingerprint: string;
  venueRevision: string;
  rawRuleTextHash: string;
  settlementProvenanceHash: string;
  canonicalEntityMappingRevision: string;
  tradingClosesAt: number;
  closeTimeRevision: string;
  closeTimeEvidenceHash: string;
  payoutAssetRevision: string;
}

export type ContractLinkVerification =
  | {
      status: "VERIFIED";
      fingerprint: string;
      left: ContractRevisionRef;
      right: ContractRevisionRef;
      method: "exact" | "reviewed-transform";
      transformRuleId: string | null;
    }
  | { status: "UNVERIFIED"; reasons: readonly ContractLinkReason[] };
```

- [ ] Implement `proveComplement`, `verifyContractLink`, and `checkContractLinkPayoutBasis`. Exact mode requires identical semantic fingerprints, inverse binary polarity, collectively exhaustive outcomes, compatible nominal USD payouts/unit sizes, and different venues. Currency-basis checking separately requires current per-leg asset revision/value policies and binds their versions/evidence into the opportunity.

- [ ] Reviewed transforms are an explicit closed registry in code. Each transform has an ID, tests, and exact input/output fields. An operator cannot provide executable code or arbitrary JSON transform logic.

- [ ] A rule-text hash, venue revision, spec/provenance hash, canonical-entity mapping revision, status, trading close time/revision/evidence hash, or close transition makes a link non-current immediately. Contract-link and both final-gate tests mutate each field independently.

- [ ] Run:

```bash
pnpm vitest run tests/core/contract-links.test.ts tests/core/settlement-spec.test.ts tests/settlement.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 5: Normalize Venue Books and Scan Only Verified Links

**Files:**

- Create: `src/core/quote-normalization.ts`
- Create: `src/core/verified-optimizer.ts`
- Create: `tests/core/quote-normalization.test.ts`
- Create: `tests/core/verified-optimizer.test.ts`

- [ ] Write failing tests for malformed decimals, negative/zero depth, price outside `[0,1]`, duplicate or unsorted levels, unsupported/mismatched payout asset, missing/expired asset value policy, stablecoin depeg haircut, future/stale timestamps, missing revisions, fractional quantities, differing venue scales representing the same shares, equal atomic integers representing unequal shares, non-divisible conversion, fee charged in collateral/outcome/proceeds, fee atomic rounding, gross-versus-net outcome quantity, exact **net** equal-depth walking, price improvement, multiple makers/levels, fee-rounding discontinuities, a price-dependent outcome fee whose full FOK gross fill has unequal net bounds, direct Polymarket BUY shadow refusal, synthetic complete-set-minus-complement-bid acquisition cost, insufficient/unfinalized/reused inventory, exact-share FOK sell depth, split/merge/recovery costs, an official price-invariant proof, fees, network cost, quote block-height expiry, safety buffer, balances, 1% floor, and $0.10 floor.

```ts
export interface VenueBookInput {
  profileId: string | null;
  contract: LiveCanonicalContract;
  status: "open" | "suspended" | "closed";
  bookRevision: string;
  sourceUpdatedAt: number;
  receivedAt: number;
  feeScheduleVersion: string;
  networkCostMicros: Micros;
  setupCostMicros: Micros;
  slippageBufferBps: number;
  quantityScale: number;
  asks: readonly { priceUsd: string; quantityShares: string }[];
  feeModel: LiveFeeModel;
}

export type QuoteNormalizationResult =
  | { ok: true; quote: LiveVenueQuote }
  | { ok: false; reasons: readonly QuoteNormalizationReason[] };
```

- [ ] Normalize every level into exact gross and net `VenueQuantity` values using the venue-declared scale and current fee semantics. Reject rather than round excess precision. For each proposed fixed gross FOK order, enumerate or conservatively prove every execution price/maker/multi-level allocation and fee-rounding path the artifact permits, then create immutable `LiveNetOutcomeBounds`. The depth walker may emit an executable canonical reduced `ExactShares` fill only when each leg's minimum and maximum net outcome are both exactly representable and both equal that canonical quantity. A varying or unbounded net outcome emits typed shadow evidence; it is never treated as safe because the average or quoted path matches.

- [ ] The Polymarket venue normalizer never converts a USD-notional BUY into an executable
  `LiveVenueQuote`. Its only candidate acquisition level is synthetic: exact finalized
  complete-set inventory cost minus the conservative proceeds of FOK-selling exactly the
  undesired shares at current bid depth, plus split, sell, fee, gas, reservation, and bounded
  merge/recovery costs. Bind inventory ID/revision/fence, both outcome balances, complement
  token, exact sell shares, `minPrice`, bid-book revision, and cost hashes into the level's
  evidence. The generic optimizer consumes this as acquisition cost but cannot manufacture
  or substitute its inventory proof.

- [ ] Implement a bigint-backed equal-depth walker and deterministic fee calculation.
  Prices are exact rational microdollars per canonical net share. Cost authorization uses
  checked ceiling multiplication, never a rounded integer unit price. Each normalized
  level also binds the venue-reported/conservatively converted `fullLevelCostMicros` and
  an evidence hash. DFlow cannot contribute an executable level under the current official
  baseline because discovery/eligibility is unavailable and `/order` has no finite exact
  output; it emits typed shadow reasons before this walker. A supported public book may
  allow exact partial consumption. Reject any mismatch
  between rational cost and the full-level bound. Convert to safe integer microdollars
  only after proving the result is within `Number.MAX_SAFE_INTEGER`.

- [ ] Add:

```ts
export function scanVerifiedLinks(input: {
  profileId: string | null;
  links: readonly VerifiedContractLink[];
  quotesByContract: ReadonlyMap<ScopedQuoteKey, LiveVenueQuote>;
  settings: LiveArbitrageSettings;
  now: number;
}): LinkedScanResult;
```

`ScopedQuoteKey` is the canonical hash of `(profileId ?? "public", contractRevisionId)`.
The optimizer accepts a public quote (`profileId === null`) for any profile, but a scoped
quote only when it exactly matches `input.profileId`. A null-profile scan rejects every
scoped quote. It never falls back to another profile or indexes a scoped quote by contract
ID alone. If either leg is scoped, the result is scoped to that exact profile.

Require current link and close-time evidence, book revisions, fee asset/rounding/schedule and asset-policy versions,
freshness/validity (including current chain height where present), equal canonical share
net quantity with per-leg gross/net conversion and fee-assessment proof, sufficient balances, complete venue fees, chain/network fees,
one-time approval/setup cost, slippage buffer, safety buffer, net return
`>= max(user, 100 bps)`, and net profit `>= max(user, 100_000 micros)`. The quote or scan
is non-executable when `now + configuredCloseBufferMs >= tradingClosesAt`.

- [ ] Keep `scanArbitrage()` as the replay compatibility path. Add a comment and type separation so production workers call only `scanVerifiedLinks()`.

- [ ] Run:

```bash
pnpm vitest run tests/core/quote-normalization.test.ts tests/core/verified-optimizer.test.ts tests/optimizer.test.ts tests/backtest.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 6: Persist Versioned Market Evidence and Opportunities

**Files:**

- Create: `supabase/migrations/202607170003_markets_and_pricing.sql`
- Create: `supabase/tests/database/004_market_evidence_test.sql`
- Create: `supabase/tests/database/005_market_rls_test.sql`
- Create: `src/server/markets/repository.ts`
- Create: `src/server/markets/asset-value-policy-repository.ts`
- Create: `src/workers/market-data/asset-value-policy-refresh.ts`
- Create: `src/core/opportunity.ts`
- Create: `tests/server/market-repository.test.ts`
- Create: `tests/server/asset-value-policy-repository.test.ts`
- Create: `tests/workers/asset-value-policy-refresh.test.ts`
- Create: `tests/core/opportunity.test.ts`

- [ ] Write failing pgTAP/unit tests for immutable settlement revisions, unique venue revision, link versioning, close-time evidence/invalidation, global and profile-scoped quote dedupe/RLS, cross-profile quote refusal, opportunity hash uniqueness, expiry, indexed World Cup queries, user read-only RLS, and role-specific worker writes.

- [ ] Create these tables with foreign keys and query-aligned composite indexes:

```text
fixtures
venue_contracts
settlement_specs
contract_links
fee_schedule_versions
asset_value_policies
asset_value_policy_current
quote_snapshots
opportunities
market_wakeups
catalog_scans
```

Raw catalog payloads are sanitized JSONB evidence, not trusted typed data. Settlement revisions and quote snapshots are append-only. The current DFlow baseline creates no catalog, executable quote snapshot, contract link, or DFlow-containing opportunity; it persists only typed documentation/endpoint shadow evidence. Database constraints reject DFlow from executable quote and opportunity tables while its no-live-surface gate is closed. Public supported-venue books use a null profile, and the market-data role cannot write scoped rows. Mutable current pointers use optimistic versions. A catalog scan records venue, edition/filter, initial/final cursor hashes, page/row counts, status, checkpoint, started/completed times, and source revision. Only a cursor-exhausted `COMPLETE` scan may tombstone contracts not seen in that scan.

- [ ] Persist `asset_value_policies` append-only by `(network, asset_id,
  asset_revision, policy_version)` with lower/upper microdollar bounds, source kind/reference,
  observed/valid-until times, and evidence hash. `asset_value_policy_current` is an
  optimistic pointer updated only by the market worker after validating the closed
  `ASSET_VALUE_POLICIES_JSON` registry and, where the venue plan mandates it, current
  official oracle/issuer evidence. Market may insert versions/update pointers; execution
  may read; web sees only safe current readiness; no runtime role may update historical
  policy rows. A refresh with a depeg, expired evidence, asset-revision mismatch, or missing
  configured asset pauses affected quotes/contracts instead of keeping the previous policy
  silently current.

- [ ] Add tests for append-only policy versions, optimistic pointer races, source/evidence
  mutation, lower/upper ordering, expiry, depeg haircut, asset revision, role grants/RLS,
  restart idempotency, and final-gate invalidation. Updating policy configuration requires
  a reviewed deployment plus a new version; no browser/operator endpoint accepts arbitrary
  prices.

- [ ] Implement repository upserts keyed by `(venue_id, contract_id, venue_revision)` and `(venue_contract_id, book_revision)`. A repeated source event is idempotent; conflicting content under the same source revision raises an invariant error.

- [ ] Define and hash the complete snapshot:

```ts
export interface OpportunitySnapshot {
  schemaVersion: "opportunity-v1";
  profileId: string | null;
  strategyId: string | null;
  bundleHash: string;
  detectedAt: number;
  expiresAt: number;
  contractLinkId: string;
  contractLinkVersion: number;
  settlementFingerprint: string;
  exactShares: ExactShares;
  yes: OpportunityLegSnapshot;
  no: OpportunityLegSnapshot;
  rawCostMicros: Micros;
  feeMicros: Micros;
  networkCostMicros: Micros;
  setupCostMicros: Micros;
  slippageBufferMicros: Micros;
  safetyBufferMicros: Micros;
  expectedCostMicros: Micros;
  expectedPayoutMicros: Micros;
  expectedNetProfitMicros: Micros;
  expectedNetReturnBps: number;
}
```

Each `OpportunityLegSnapshot` carries the fixed gross `VenueQuantity`, complete
`LiveNetOutcomeBounds`, the boundary `LiveFeeAssessment` evidence, exact rational price,
authorized cumulative cost micros, fill policy/cost evidence, payout asset revision,
asset-value-policy version/evidence hash, quote validity, book/fee/network revisions, and
cost. The hash binds profile/strategy scope, both sorted leg IDs, spec/link/book/fee/close-time
and asset-policy revisions, canonical shares plus both venue conversions and the complete
net-bound proof, all costs,
detection/chain expiry, and conservatively valued payout. A scoped quote produces a
scoped opportunity whose profile and strategy are both non-null. Public-only shadow
opportunities use null scope. Test order invariance, one-field-change sensitivity, and
cross-profile rejection.

- [ ] Run:

```bash
pnpm db:reset
pnpm test:db
pnpm vitest run tests/server/market-repository.test.ts tests/server/asset-value-policy-repository.test.ts tests/workers/asset-value-policy-refresh.test.ts tests/core/opportunity.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 7: Build a Structurally Shadow-Only World Cup Cycle

**Files:**

- Create: `src/core/world-cup-pipeline.ts`
- Create: `src/workers/market-data/shadow-feed.ts`
- Create: `tests/core/world-cup-pipeline.test.ts`
- Create: `tests/workers/shadow-feed.test.ts`
- Modify: `eslint.config.mjs`

- [ ] Write failing tests for fixture wakeups, tournament/team futures, direct venue-book wakeups, catalog refreshes, replayed wakeup idempotency, stale link refusal, `NO_TRADE` persistence, opportunity persistence, and dependency-free shadow operation.

```ts
export type MarketWakeup =
  | { kind: "txline-event"; event: TxLineEvent; fixture: WorldCupFixture }
  | { kind: "venue-book"; venueId: string; contractId: string; observedAt: number }
  | { kind: "catalog-refresh"; competitionEdition: string; observedAt: number };

export interface ShadowFeedStore {
  currentLinks(wakeup: MarketWakeup): Promise<readonly VerifiedContractLink[]>;
  currentPublicQuotes(contractIds: readonly string[]): Promise<ReadonlyMap<ScopedQuoteKey, LiveVenueQuote>>;
  persistOpportunity(snapshot: OpportunitySnapshot): Promise<void>;
  persistNoTrade(input: ShadowNoTradeRecord): Promise<void>;
}
```

- [ ] Implement `runShadowCycle` as a pure null-profile orchestration layer over the store and `scanVerifiedLinks`. It must have no wallet, signer, RPC write, live adapter, or execution repository dependency. DFlow has no current authoritative catalog/link, so the cycle persists `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE` and `DFLOW_OUTPUT_NOT_EXACT`, never `PROFILE_PROBE_REQUIRED` and never an opportunity. No later execution-worker profile probe exists while these gates are closed.

- [ ] Add an ESLint `no-restricted-imports` override for `src/workers/market-data/**` that rejects imports from `@/execution`, `@/server/grants`, and worker-only signing/RPC modules.

- [ ] Scope wakeups deterministically:

  - fixture events affect fixture, participant, group, and tournament links in the same edition;
  - book events affect links containing that exact contract revision;
  - catalog refresh affects that exact competition edition.

- [ ] Run:

```bash
pnpm vitest run tests/core/world-cup-pipeline.test.ts tests/workers/shadow-feed.test.ts
pnpm lint
pnpm typecheck
```

Expected: all pass; import restrictions prove shadow code cannot reach signing.

- [ ] Review checkpoint; do not commit.

## Task 8: Verify and Document Market Truth

**Files:**

- Modify: `docs/architecture.md`
- Create: `docs/world-cup-market-model.md`
- Create: `docs/runbooks/contract-link-review.md`

- [ ] Document raw catalog versus verified contract, every settlement field, reviewed transforms, automatic invalidation, TxLINE's non-executable role, and operator link review.

- [ ] Add a review runbook that requires two source URLs, raw-rule hashes, current revisions, complete semantic diff, reviewer identity, and invalidation check. It must forbid title-only approval.

- [ ] Run the plan gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm txline:smoke -- --seconds 5
pnpm build
git diff --check
```

Expected: automated commands pass. The live smoke may report missing txBet credentials in an unconfigured environment, but it must exit safely without logging secrets; run it to success in staging before the product rollout gate.

- [ ] Confirm replay integrity:

```bash
pnpm agent:demo
pnpm vitest run tests/backtest.test.ts tests/executor.test.ts tests/landing-ssr.test.ts
```

Expected: deterministic demo output and simulated disclosure remain unchanged.

- [ ] Review `git status --short`; do not commit or push.
