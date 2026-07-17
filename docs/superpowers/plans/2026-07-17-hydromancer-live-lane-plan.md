# Hydromancer Live Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hydromancer using the current Hyperliquid HIP-4 outcome-market protocol, with exact asset/domain binding, deterministic client IDs, account/funding readiness, and independent certification.

**Architecture:** Hydromancer discovery is cross-checked against official Hyperliquid HIP-4 metadata. The user's embedded EVM wallet controls the Hydromancer account. txBet signs only a fixed outcome-market action through a venue-specific policy and submits it once through the shared execution kernel.

**Tech Stack:** [Hydromancer HIP-4 discovery API](https://hydromancer.xyz/hip-4), official [Hyperliquid HIP-4 docs](https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets), viem, Privy, Supabase, Zod, Vitest.

## Global Constraints

- Hyperliquid's official HIP-4 and exchange API docs are the protocol authority; Hydromancer metadata is venue discovery evidence.
- Verify outcome-market availability, collateral/account model, order types, asset IDs, nonce/cloid rules, builder fee, minimum notional, fills/cancel, settlement, and withdrawals before coding.
- Require official all-or-nothing entry semantics. If unavailable, finish catalog/shadow only.
- Do not automatically bridge or rebalance funds into/out of Hydromancer.
- Hydromancer has a separate policy, grant consent, spend ceiling, kill switch, and global-$10-bounded canary.
- Do not commit or push.

---

## Task 1: Capture Official HIP-4, Exchange, and Environment Baseline

**Files:**

- Modify: `.env.example`
- Modify: `src/server/config/env.ts`
- Modify: `tests/server/env.test.ts`
- Create: `docs/references/hydromancer-api-baseline.md`

- [ ] Re-fetch both links plus official Hyperliquid exchange endpoint/signing docs. Record hosts, chain/domain, account/collateral, outcome metadata, order/action schema, TIF, nonce, cloid, builder fee, minimums, status/fills/cancel, settlement, withdrawal, pagination, and eligibility.
- [ ] Use existing viem/fetch stack unless the official docs name a maintained TypeScript SDK that passes dependency review.
- [ ] Add blank values: `HYDROMANCER_DISCOVERY_API_BASE_URL`, `HYDROMANCER_API_KEY`, `HYDROMANCER_EXCHANGE_API_BASE_URL`, `HYDROMANCER_BUILDER_ADDRESS`, `HYDROMANCER_BUILDER_FEE_TENTHS_BPS`, and `PRIVY_HYDROMANCER_POLICY_ID`. Require the shared Hydromancer native/USD bound/expiry and a current collateral `AssetValuePolicy`; missing or expired values keep the lane unready.
- [ ] Extend typed loaders/tests for fixed hosts, builder checksum/fee cap, complete credential tuple, and web/market secret isolation.
- [ ] Run env tests, typecheck, audit, and diff check.

## Task 2: Ingest Complete HIP-4 Metadata and Books

**Files:**

- Create: `src/venues/hydromancer/public/schemas.ts`
- Create: `src/venues/hydromancer/public/client.ts`
- Create: `src/venues/hydromancer/public/catalog.ts`
- Create: `src/venues/hydromancer/public/book.ts`
- Create: `src/workers/market-data/hydromancer-feed.ts`
- Create: `tests/execution/hydromancer/schemas.test.ts`
- Create: `tests/execution/hydromancer/public-client.test.ts`
- Create: `tests/execution/hydromancer/catalog.test.ts`
- Create: `tests/execution/hydromancer/book.test.ts`
- Create: `tests/execution/hydromancer/network-cost.test.ts`
- Create: `tests/workers/hydromancer-feed.test.ts`
- Create: `tests/fixtures/hydromancer/markets-page-1.json`
- Create: `tests/fixtures/hydromancer/markets-page-2.json`
- Create: `tests/fixtures/hydromancer/meta.json`
- Create: `tests/fixtures/hydromancer/orderbook.json`

- [ ] Write failing cross-source tests for Hydromancer versus official HIP-4 asset/market/domain data, revisions, status, rules, decimals, and expiry.
- [ ] Prove pagination/checkpoint/resume/rate-limit/dedupe/partial/tombstone completeness with a later-page World Cup market.
- [ ] Normalize only complete binary/exhaustive HIP-4 markets into verified contracts; a cross-source mismatch is `UNVERIFIED` and pauses the asset.
- [ ] Normalize exact price/size ticks, fee/builder fee, minimum notional, current collateral value policy, and every current official account/action/network cost. Reject missing/expired evidence or depeg bounds and run the network-cost suite against fixed official API fixtures.
- [ ] Register the read-only feed and its strict DB/import boundary; run all focused tests.

## Task 3: Bind Hydromancer Account, Funding, Policy, and Onboarding

**Files:**

- Create: `supabase/migrations/202607170012_hydromancer_accounts.sql`
- Create: `supabase/tests/database/020_hydromancer_accounts_test.sql`
- Create: `src/execution/venues/hydromancer/account.ts`
- Create: `src/execution/venues/hydromancer/funding.ts`
- Create: `src/execution/venues/hydromancer/eligibility.ts`
- Modify: `src/server/grants/privy-policy.ts`
- Modify: `src/server/grants/service.ts`
- Modify: `src/server/onboarding/service.ts`
- Modify: `src/workers/execution/onboarding-loop.ts`
- Modify: `src/workers/execution/eligibility-refresh-loop.ts`
- Create: `src/app/api/venues/hydromancer/onboard/route.ts`
- Modify: `src/contracts/api.ts`
- Modify: `src/server/api/queries.ts`
- Modify: `src/server/strategies/service.ts`
- Create: `tests/execution/hydromancer/account.test.ts`
- Create: `tests/execution/hydromancer/funding.test.ts`
- Create: `tests/execution/hydromancer/eligibility.test.ts`
- Create: `tests/grants/hydromancer-policy.test.ts`
- Create: `tests/workers/hydromancer-onboarding.test.ts`
- Modify: `tests/workers/eligibility-refresh-loop.test.ts`
- Create: `e2e/hydromancer-onboarding.spec.ts`
- Create: `tests/api/hydromancer-onboarding.test.ts`

- [ ] Write SQL/RLS and wallet/account/subaccount/agent/eligibility tests; execution-only secrets/artifacts remain inaccessible elsewhere.
- [ ] Verify deposits, available collateral, withdrawal controls, and account ownership through official state. Display funding steps but never bridge automatically.
- [ ] Implement the shared `VenueEligibilityInspector` from the current official
  Hydromancer signal. Keep venue-wide `onboard` evidence separate from exact
  canonical contract/HIP-4-market-binding/action evidence. Test profile/wallet/account/
  environment isolation, denied/unknown/outage, expiry, binding/action drift, and refusal
  to reuse onboarding or another market's evidence.
- [ ] Register Hydromancer in `eligibility-refresh-loop.ts`; test every active strategy and
  recovery scope. Tests follow only the exact `venue_eligibility_current` pointer, never
  select/sort/fallback evidence rows, and reject a delayed old eligible response after a
  newer denied/unknown result.
- [ ] Add a fixed Hydromancer action policy, builder fee cap, venue spend ceiling, <=7-day expiry, and renewed user consent.
- [ ] Extend onboarding through account registration/agent if officially required, funding/readiness, policy, and restart-safe verification.
- [ ] Add the authenticated fixed Hydromancer onboarding route and safe readiness query. It accepts only expected wallet/grant versions, enqueues idempotently, and strategy activation requires current certification, account/funding readiness, and explicit replacement grant. Add API and activation/refusal tests.
- [ ] Run DB/account/funding/eligibility/refresh-loop/policy/onboarding/E2E tests.
- [ ] Run `pnpm vitest run tests/execution/hydromancer/eligibility.test.ts tests/workers/eligibility-refresh-loop.test.ts`; both pass with Hydromancer registered.

## Task 4: Build the Exact HIP-4 Order Action

**Files:**

- Create: `src/execution/venues/hydromancer/order.ts`
- Create: `src/execution/venues/hydromancer/signing.ts`
- Create: `tests/execution/hydromancer/order.test.ts`
- Create: `tests/execution/hydromancer/signing.test.ts`
- Create: `tests/fixtures/hydromancer/order-build.json`

- [ ] Write known-answer/mutation tests for asset ID, account, side, price, size, TIF, reduce-only, nonce, deterministic cloid, builder address/fee, expiry, and max spend.
- [ ] Build only an official all-or-nothing action. If HIP-4 exposes no compatible TIF, return `VENUE_NO_ATOMIC_ENTRY` and keep submission disabled.
- [ ] Allocate the nonce under a short database transaction. Derive `cloid` from the pre-artifact `attemptKey`, operation kind, nonce, account revision, and immutable semantic-intent hash (never the random-ID-bearing record hash). Then include that cloid in the final unsigned payload and `artifactHash`. The cloid never depends on the artifact hash it helps create. Reuse neither nonce nor cloid across attempts; add determinism and one-field mutation tests.
- [ ] Sign through Privy, verify the exact official digest/recovered address, and persist encrypted artifact/locator.
- [ ] Run order/signing/hash/state tests.

## Task 5: Submit Once and Reconcile Hydromancer State

**Files:**

- Create: `src/execution/venues/hydromancer/adapter.ts`
- Create: `src/execution/venues/hydromancer/status.ts`
- Create: `src/execution/venues/hydromancer/cancellation.ts`
- Create: `src/execution/venues/hydromancer/positions.ts`
- Create: `src/execution/venues/hydromancer/redemption.ts`
- Create: `tests/execution/hydromancer/adapter.test.ts`
- Create: `tests/execution/hydromancer/status.test.ts`
- Create: `tests/execution/hydromancer/cancellation.test.ts`
- Create: `tests/execution/hydromancer/positions.test.ts`
- Create: `tests/execution/hydromancer/redemption.test.ts`
- Create: `tests/fixtures/hydromancer/order-response.json`
- Create: `tests/fixtures/hydromancer/order-status.json`
- Create: `tests/fixtures/hydromancer/settlement.json`

- [ ] Test ACK/status errors, timeout/late fill, partial, nonce reuse, cloid lookup, immutable cancellation action/full claim/fenced submit/cumulative actual cost, cancel race, balances/margin, compensation, settlement/redemption, and manual-withdrawal readiness with zero worker mutations.
- [ ] Invoke `liveAdapterContract`; submit the exact action once, validate the complete
  immutable order claim, and reconcile cloid/order/fill/account state with one-field
  binding-drift refusal.
- [ ] If the selected official TIF can report working, implement its exact cancel action
  through `LiveCancellationAdapter`; otherwise certify terminal-on-submit. Unknown cancel
  action state retains its cost reservation and is never blindly repeated.
- [ ] A timeout never increments nonce into a replacement submission. Compensation uses a distinct bounded action.
- [ ] Resolution/settlement accounting is read-only, and any supported claim uses only the
  shared `LiveRedemptionAdapter` ledger/artifact/marker/reconcile contract. Generic
  Hydromancer withdrawal is explicitly manual-only: expose the authenticated official
  account control, but create no withdrawal intent, signature, or API action. Tests prove
  the execution worker cannot prepare/sign/submit a withdrawal.
- [ ] Run all Hydromancer/shared execution/DB tests.

## Task 6: Register Product and Complete Venue Certification

**Files:**

- Modify: `src/workers/market-data.ts`
- Modify: `src/workers/execution.ts`
- Modify: `src/components/dashboard/venue-onboarding-card.tsx`
- Modify: `src/components/dashboard/funding-card.tsx`
- Modify: `src/components/dashboard/strategy-settings-form.tsx`
- Modify: `src/components/dashboard/automation-grant-card.tsx`
- Modify: `src/server/notifications/types.ts`
- Create: `docs/hydromancer-live-lane.md`
- Create: `scripts/smoke-hydromancer.ts`
- Create: `e2e/hydromancer-readiness.spec.ts`
- Create: `e2e/hydromancer-strategy-grant.spec.ts`

- [ ] Register order plus required cancellation/redemption adapters only when Hydromancer and official HIP-4 evidence, exact-entry/cancellation capability, policy, and account readiness are current.
- [ ] Add funding/readiness, explicit replacement-grant consent/renewal/confirmation, strategy selection, links, and safe notifications. E2E covers onboarding -> renewed grant -> activation and every missing/expired refusal.
- [ ] Add public/read-only account smoke without signing/submission.
- [ ] Run full verify, DB/worker/E2E, smoke, audit, and diff checks.
- [ ] Complete shadow soak, independent review, kill-switch drill, and genuine canary under remaining global $10 capacity.
- [ ] Do not commit or push.
