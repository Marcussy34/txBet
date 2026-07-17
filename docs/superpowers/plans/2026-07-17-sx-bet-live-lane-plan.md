# SX Bet Live Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SX Bet by validating live venue metadata, filling exact maker orders with a scoped EIP-2612 permit, and proving the outcome/SELL transformation before any live submission.

**Architecture:** SX Bet is modeled as taker execution against immutable maker orders, not a generic posted limit order. Every maker order, market/outcome mapping, fill amount, metadata contract, permit, and signature is bound into the shared artifact and submitted once.

**Tech Stack:** [SX Bet API reference](https://docs.sx.bet/api-reference/introduction), [official order-book guide](https://docs.sx.bet/user-guides/trading/order-book), viem, Privy, SX Network RPC, Supabase, Zod, Vitest.

## Global Constraints

- Re-fetch the official docs/repository and record current chain, collateral, API/realtime hosts, metadata/domain/fill hasher/proxy, maker-order/fill/permit schemas, fees, minimum notional, status, settlement, and redemption.
- Live metadata is authoritative and versioned; do not inherit stale addresses from Predictefy.
- Never widen odds, switch maker orders, or recompute the SELL transformation after the bundle hash.
- Require fill semantics that guarantee the authorized maker amount. Otherwise remain shadow-only.
- SX Bet has a distinct grant/policy/consent/canary scope.
- Do not commit or push.

---

## Task 1: Capture Official Metadata, Environment, and Fixture Baseline

**Files:**

- Modify: `.env.example`
- Modify: `src/server/config/env.ts`
- Modify: `tests/server/env.test.ts`
- Create: `docs/references/sx-bet-api-baseline.md`

- [ ] Record exact official endpoints and contracts, including whether chain ID `4162`, collateral, minimum notional, and EIP-2612 remain current.
- [ ] Use existing viem/fetch/websocket dependencies unless the official docs mandate a maintained package.
- [ ] Add blank values: `SXBET_API_BASE_URL`, `SXBET_REALTIME_URL`, `SXBET_API_KEY`, `SXBET_RPC_URL`, `SXBET_COLLATERAL_ADDRESS`, and `PRIVY_SXBET_POLICY_ID`. Require the shared SX Network native/USD bound/expiry and a current collateral `AssetValuePolicy`; missing or expired values keep the lane unready.
- [ ] Extend typed loaders with HTTPS/WSS fixed hosts, chain/address/API-key validation, and web/market secret isolation.
- [ ] Run env tests, typecheck, audit, and diff check.

## Task 2: Implement Complete Catalog, Metadata, and Maker-Book Feed

**Files:**

- Create: `src/venues/sx-bet/public/schemas.ts`
- Create: `src/venues/sx-bet/public/client.ts`
- Create: `src/venues/sx-bet/public/catalog.ts`
- Create: `src/venues/sx-bet/public/metadata.ts`
- Create: `src/venues/sx-bet/public/book.ts`
- Create: `src/workers/market-data/sx-bet-feed.ts`
- Create: `tests/execution/sx-bet/schemas.test.ts`
- Create: `tests/execution/sx-bet/public-client.test.ts`
- Create: `tests/execution/sx-bet/catalog.test.ts`
- Create: `tests/execution/sx-bet/metadata.test.ts`
- Create: `tests/execution/sx-bet/book.test.ts`
- Create: `tests/execution/sx-bet/network-cost.test.ts`
- Create: `tests/workers/sx-bet-feed.test.ts`
- Create: `tests/fixtures/sx-bet/markets-page-1.json`
- Create: `tests/fixtures/sx-bet/markets-page-2.json`
- Create: `tests/fixtures/sx-bet/metadata.json`
- Create: `tests/fixtures/sx-bet/orders.json`

- [ ] Write failing schema/revision/rule/status tests and full-catalog pagination/checkpoint/tombstone tests with a later-page World Cup contract.
- [ ] Validate metadata chain, domain, fill hasher, proxy, token, and source revision. Any change invalidates links/artifacts and pauses the venue.
- [ ] Normalize each resting maker order as bounded executable depth; preserve maker order hash/expiry/remaining amount.
- [ ] Prove YES/NO/SELL price and outcome transforms with table-driven tests for every polarity. Reject draws/pushes/non-exhaustive markets.
- [ ] Include exact fees, minimum notional, SX Network gas/setup estimate, and current collateral value policy, then register the read-only feed. Reject missing/expired evidence or depeg bounds and run the network-cost suite against fixed RPC fixtures.
- [ ] Run all catalog/metadata/book/feed tests, lint, and typecheck.

## Task 3: Bind Account, Permit Policy, and Onboarding

**Files:**

- Create: `supabase/migrations/202607170011_sxbet_accounts.sql`
- Create: `supabase/tests/database/019_sxbet_accounts_test.sql`
- Create: `src/execution/venues/sx-bet/account.ts`
- Create: `src/execution/venues/sx-bet/permit.ts`
- Create: `src/execution/venues/sx-bet/permit-nonce-repository.ts`
- Create: `src/execution/venues/sx-bet/eligibility.ts`
- Modify: `src/server/grants/privy-policy.ts`
- Modify: `src/server/grants/service.ts`
- Modify: `src/server/onboarding/service.ts`
- Modify: `src/workers/execution/onboarding-loop.ts`
- Modify: `src/workers/execution/eligibility-refresh-loop.ts`
- Create: `src/app/api/venues/sx-bet/onboard/route.ts`
- Modify: `src/contracts/api.ts`
- Modify: `src/server/api/queries.ts`
- Modify: `src/server/strategies/service.ts`
- Create: `tests/execution/sx-bet/account.test.ts`
- Create: `tests/execution/sx-bet/permit.test.ts`
- Create: `tests/execution/sx-bet/permit-nonce-repository.test.ts`
- Create: `tests/execution/sx-bet/eligibility.test.ts`
- Create: `tests/grants/sx-bet-policy.test.ts`
- Create: `tests/workers/sx-bet-onboarding.test.ts`
- Modify: `tests/workers/eligibility-refresh-loop.test.ts`
- Create: `e2e/sx-bet-onboarding.spec.ts`
- Create: `tests/api/sx-bet-onboarding.test.ts`

- [ ] Write SQL/RLS and ownership/chain/collateral/eligibility tests. Add `sxbet_permit_nonce_state` and append-only nonce attempts keyed by chain/token/owner, with one unresolved permit action at a time and execution-only access.
- [ ] Write EIP-2612 known-answer tests for token, owner, spender, exact bounded value, nonce, deadline, chain/domain, recovery, and replay. Fetch the on-chain nonce outside a transaction, then use a short fenced DB transaction to compare state, reserve that exact nonce for the operation attempt, and commit before signing. Timeout/unknown blocks reuse or increment until on-chain fill/nonce reconciliation is authoritative. External nonce advance invalidates the prepared action.
- [ ] Add concurrent-bundle, lease/fence, crash before/after reservation, timeout, late inclusion, external-wallet nonce advance, and reconciliation tests. Aggregate permit/fill mutation calls are one for the winning operation; another action queues or refuses rather than sharing a nonce.
- [ ] Implement the shared `VenueEligibilityInspector` from the current official SX Bet
  signal. Keep venue-wide `onboard` evidence separate from exact canonical contract/SX
  market-binding/action evidence. Test profile/wallet/account/environment isolation,
  denied/unknown/outage, expiry, binding/action drift, and refusal to reuse onboarding or
  another market's evidence.
- [ ] Register SX Bet in `eligibility-refresh-loop.ts`; test every active strategy and
  recovery scope. Tests follow only the exact `venue_eligibility_current` pointer, never
  select/sort/fallback evidence rows, and reject a delayed old eligible response after a
  newer denied/unknown result.
- [ ] Add the SX-specific policy/grant scope with only current fill/permit contracts/methods and user spend ceiling. Require renewed consent.
- [ ] Extend onboarding through account verification, collateral/fee balance, permit readiness, eligibility, and restart-safe inspection.
- [ ] Add the authenticated fixed SX Bet onboarding route and safe readiness query. It accepts only expected wallet/grant versions, enqueues idempotently, and strategy activation requires current certification, account/permit readiness, and explicit replacement grant. Add API and activation/refusal tests.
- [ ] Run DB/account/permit/eligibility/refresh-loop/policy/onboarding/E2E tests.
- [ ] Run `pnpm vitest run tests/execution/sx-bet/eligibility.test.ts tests/workers/eligibility-refresh-loop.test.ts`; both pass with SX Bet registered.

## Task 4: Bind the Exact Maker Fill Artifact

**Files:**

- Create: `src/execution/venues/sx-bet/order.ts`
- Create: `src/execution/venues/sx-bet/signing.ts`
- Create: `tests/execution/sx-bet/order.test.ts`
- Create: `tests/execution/sx-bet/signing.test.ts`
- Create: `tests/fixtures/sx-bet/fill-build.json`

- [ ] Write failing mutation tests for maker/order hash, market/outcome, odds, fill amount, taker, domain, fill hasher, proxy, fee, expiry, permit, minimum notional, and max spend.
- [ ] Select only currently active maker depth already bound in the opportunity. If it changed, reject and require a new bundle.
- [ ] Build/re-derive the exact taker fill and short-lived permit; sign through Privy and recover both signatures.
- [ ] Persist encrypted signed artifact plus deterministic fill locator and run hash/type tests.

## Task 5: Submit, Reconcile, Compensate, and Resolve

**Files:**

- Create: `src/execution/venues/sx-bet/adapter.ts`
- Create: `src/execution/venues/sx-bet/status.ts`
- Create: `src/execution/venues/sx-bet/positions.ts`
- Create: `src/execution/venues/sx-bet/redemption.ts`
- Create: `tests/execution/sx-bet/adapter.test.ts`
- Create: `tests/execution/sx-bet/status.test.ts`
- Create: `tests/execution/sx-bet/positions.test.ts`
- Create: `tests/execution/sx-bet/redemption.test.ts`
- Create: `tests/fixtures/sx-bet/fill-response.json`
- Create: `tests/fixtures/sx-bet/order-status.json`
- Create: `tests/fixtures/sx-bet/redemption.json`

- [ ] Test ACK/reject/timeout, maker already filled, partial/late fill, realtime disconnect, REST disagreement, balances, compensation, and resolution.
- [ ] Invoke `liveAdapterContract`; submit the fixed fill once, validate the complete
  immutable order claim, and reconcile maker/fill IDs, realtime events, REST, and balances
  with one-field binding-drift refusal.
- [ ] Prove the taker fill is terminal-on-submit and can never leave a cancelable working
  taker order, so no cancellation adapter is registered. If current official behavior
  permits working state, keep the lane shadow-only until the full shared adapter exists.
- [ ] A partial/changed maker amount becomes residual and pauses; never switch makers automatically.
- [ ] Use bounded compensation and official-reference-gated redemption/manual fallback.
- [ ] Run all SX Bet, shared execution, and DB tests.

## Task 6: Register Product and Certify Rollout

**Files:**

- Modify: `src/workers/market-data.ts`
- Modify: `src/workers/execution.ts`
- Modify: `src/components/dashboard/venue-onboarding-card.tsx`
- Modify: `src/components/dashboard/funding-card.tsx`
- Modify: `src/components/dashboard/strategy-settings-form.tsx`
- Modify: `src/components/dashboard/automation-grant-card.tsx`
- Modify: `src/server/notifications/types.ts`
- Create: `docs/sx-bet-live-lane.md`
- Create: `scripts/smoke-sx-bet.ts`
- Create: `e2e/sx-bet-readiness.spec.ts`
- Create: `e2e/sx-bet-strategy-grant.spec.ts`

- [ ] Register only current metadata/policy/account/exact-fill plus terminal-on-submit/no-cancellation certification.
- [ ] Add SX Network funding/readiness, explicit replacement-grant consent/renewal/confirmation, strategy selection, links, and safe notifications. E2E covers onboarding -> renewed grant -> activation and every missing/expired refusal.
- [ ] Add read-only public/account readiness smoke without signing.
- [ ] Run verify, database, worker, E2E, smoke, audit, and diff checks.
- [ ] Complete shadow soak, independent review, kill-switch drill, and genuine canary under remaining global $10 capacity.
- [ ] Do not commit or push.
