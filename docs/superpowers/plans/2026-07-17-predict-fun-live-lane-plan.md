# Predict.fun Live Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Predict.fun with complete World Cup cataloging, user-bound challenge authentication, encrypted expiring sessions, a policy-limited BNB-chain order adapter, and independent rollout gates.

**Architecture:** Public data comes from Predict.fun's official API. The user's embedded EVM wallet signs an exact official auth challenge and venue order. txBet stores the resulting user bearer encrypted with expiry and relays one bound order through the shared execution kernel.

**Tech Stack:** Official [Predict API docs](https://dev.predict.fun/), [order/cancel guide](https://dev.predict.fun/how-to-create-or-cancel-orders-679306m0), viem, Privy, BNB RPC, Supabase, Zod, Vitest, Playwright.

## Global Constraints

- Re-fetch the official docs and linked auth/order references before implementation; record access date and API version.
- Do not treat the reference repo's process-only token cache as durable auth. Encrypt tokens, bind owner/AAD, and honor official expiry.
- Require an official all-or-nothing entry order. Otherwise finish shadow support and disable submission.
- Predict.fun has a distinct policy/grant scope/spend ceiling and cannot expand Opinion or Polymarket authority.
- Do not commit or push.

---

## Task 1: Capture Official API, Auth, Chain, and Environment Contracts

**Files:**

- Modify: `.env.example`
- Modify: `src/server/config/env.ts`
- Modify: `tests/server/env.test.ts`
- Create: `docs/references/predict-fun-api-baseline.md`

- [ ] Record official base URLs, BNB chain, collateral/decimals, exchange/domain, challenge fields, SIWE/signature format, bearer expiry, order types/body, fees, status/fills/cancel, pagination, eligibility, and redemption.
- [ ] Use the existing viem stack for the documented HTTP/EIP-712 path; do not add the official Python SDK to the TypeScript runtime.
- [ ] Add blank server-only names: `PREDICT_FUN_API_BASE_URL`, `PREDICT_FUN_API_KEY`, `PREDICT_FUN_BSC_RPC_URL`, `PREDICT_FUN_USDT_ADDRESS`, `PREDICT_FUN_EXCHANGE_ALLOWLIST`, and `PRIVY_PREDICT_FUN_POLICY_ID`. Require the shared BSC native/USD bound/expiry and a current Predict.fun collateral `AssetValuePolicy`; missing or expired values keep the lane unready.
- [ ] Extend typed market/execution loaders with least privilege. Test fixed hosts, chain/address lists, key isolation, and invalid/blank values.
- [ ] Run env tests, typecheck, audit, and diff check; all must pass.

## Task 2: Implement Complete Catalog and Exact Book Normalization

**Files:**

- Create: `src/venues/predict-fun/public/schemas.ts`
- Create: `src/venues/predict-fun/public/client.ts`
- Create: `src/venues/predict-fun/public/catalog.ts`
- Create: `src/venues/predict-fun/public/book.ts`
- Create: `src/workers/market-data/predict-fun-feed.ts`
- Create: `tests/execution/predict-fun/schemas.test.ts`
- Create: `tests/execution/predict-fun/public-client.test.ts`
- Create: `tests/execution/predict-fun/catalog.test.ts`
- Create: `tests/execution/predict-fun/book.test.ts`
- Create: `tests/execution/predict-fun/network-cost.test.ts`
- Create: `tests/workers/predict-fun-feed.test.ts`
- Create: `tests/fixtures/predict-fun/markets-page-1.json`
- Create: `tests/fixtures/predict-fun/markets-page-2.json`
- Create: `tests/fixtures/predict-fun/orderbook.json`

- [ ] Write failing schema/rule/revision/status tests from sanitized official fixtures.
- [ ] Write failing cursor tests for later-page World Cup markets, resume, duplicates, rate limits, partial scans, and complete-scan tombstones.
- [ ] Implement fixed-host page walking and raw catalog persistence. Only complete settlement specs become live contracts.
- [ ] Normalize exact collateral-scale depth, current fee schedule, BSC EVM gas/setup estimate, and current collateral value policy; reject floats, stale/unsupported data, missing/expired evidence, or depeg bounds. Run the network-cost suite against fixed RPC fixtures.
- [ ] Register the market-only feed and verify it cannot import credentials, signer, or execution repositories.
- [ ] Run all focused feed/catalog/book tests, lint, and typecheck.

## Task 3: Implement Challenge Auth, Account Binding, Policy, and Onboarding

**Files:**

- Create: `supabase/migrations/202607170009_predictfun_accounts.sql`
- Create: `supabase/tests/database/017_predictfun_accounts_test.sql`
- Create: `src/execution/venues/predict-fun/auth.ts`
- Create: `src/execution/venues/predict-fun/account.ts`
- Create: `src/execution/venues/predict-fun/eligibility.ts`
- Modify: `src/server/grants/privy-policy.ts`
- Modify: `src/server/grants/service.ts`
- Modify: `src/server/onboarding/service.ts`
- Modify: `src/workers/execution/onboarding-loop.ts`
- Modify: `src/workers/execution/eligibility-refresh-loop.ts`
- Create: `src/app/api/venues/predict-fun/onboard/route.ts`
- Modify: `src/contracts/api.ts`
- Modify: `src/server/api/queries.ts`
- Modify: `src/server/strategies/service.ts`
- Create: `tests/execution/predict-fun/auth.test.ts`
- Create: `tests/execution/predict-fun/account.test.ts`
- Create: `tests/execution/predict-fun/eligibility.test.ts`
- Create: `tests/grants/predict-fun-policy.test.ts`
- Create: `tests/workers/predict-fun-onboarding.test.ts`
- Modify: `tests/workers/eligibility-refresh-loop.test.ts`
- Create: `e2e/predict-fun-onboarding.spec.ts`
- Create: `tests/api/predict-fun-onboarding.test.ts`
- Create: `tests/fixtures/predict-fun/challenge.json`
- Create: `tests/fixtures/predict-fun/token-response.json`

- [ ] Write failing challenge tests for domain, URI, chain, address, nonce, issued/expiry time, replay, wrong signer, malformed token, token expiry, tampered ciphertext, and refresh races.
- [ ] Fetch a fresh challenge, construct exactly the official signed message, sign through the Predict.fun policy, recover the user address, and exchange once for the user's bearer.
- [ ] Encrypt the bearer with profile/account/token-expiry AAD. Refresh through a durable `predictfun_auth_refreshes` lease/state: atomically claim `PENDING -> REFRESHING` with owner, database-time expiry, account/token version, and challenge nonce; commit; perform challenge/sign/exchange network calls outside every transaction; then CAS-persist the encrypted token and mark `READY`. A crash leaves a reclaimable lease, and a stale worker cannot overwrite a newer token. Test concurrent refresh, crash before/after exchange, lease reclaim, late response, nonce replay, and CAS loss. Never place the bearer in process-global cache, browser storage, logs, or API responses.
- [ ] Implement the shared `VenueEligibilityInspector` with the current official
  Predict.fun signal. Keep venue-wide `onboard` evidence distinct from exact canonical
  contract/Predict.fun-market-binding/action evidence. Test profile/wallet/account/
  environment isolation, denied/unknown/outage, expiry, binding/action drift, and refusal
  to reuse onboarding or another market's evidence.
- [ ] Register Predict.fun in `eligibility-refresh-loop.ts`; test every active strategy and
  recovery scope. Tests follow only the exact `venue_eligibility_current` pointer, never
  select/sort/fallback evidence rows, and reject a delayed old eligible response after a
  newer denied/unknown result.
- [ ] Add an explicit Predict.fun venue grant/policy and fixed onboarding job through auth/account/allowance/eligibility/readiness. Existing grants require user-confirmed renewal.
- [ ] Add the authenticated fixed Predict.fun onboarding route and safe readiness query. It accepts only expected wallet/grant versions, enqueues idempotently, and strategy activation requires current certification, account readiness, and the explicitly renewed grant. Add API and activation/refusal tests.
- [ ] Run DB/auth/account/eligibility/refresh-loop/policy/onboarding/E2E tests; all must pass.
- [ ] Run `pnpm vitest run tests/execution/predict-fun/eligibility.test.ts tests/workers/eligibility-refresh-loop.test.ts`; both pass with Predict.fun registered.

## Task 4: Build, Sign, and Re-Derive the Order Artifact

**Files:**

- Create: `src/execution/venues/predict-fun/order.ts`
- Create: `src/execution/venues/predict-fun/signing.ts`
- Create: `tests/execution/predict-fun/order.test.ts`
- Create: `tests/execution/predict-fun/signing.test.ts`
- Create: `tests/fixtures/predict-fun/order-build.json`

- [ ] Write failing known-answer tests for typed domain, exchange, maker/signer, token/outcome, side, price-per-share, quantity, strategy, fee, nonce/salt/expiry, order type, and max spend.
- [ ] Build only the current official all-or-nothing form; return `VENUE_NO_ATOMIC_ENTRY` when unsupported.
- [ ] Sign the exact EIP-712 digest through Privy, recover the signer, re-derive every field, and persist encrypted signed artifact/locator.
- [ ] Run order/signing/hash tests and typecheck; all must pass.

## Task 5: Submit Once and Reconcile Complete Account State

**Files:**

- Create: `src/execution/venues/predict-fun/adapter.ts`
- Create: `src/execution/venues/predict-fun/status.ts`
- Create: `src/execution/venues/predict-fun/cancellation.ts`
- Create: `src/execution/venues/predict-fun/positions.ts`
- Create: `src/execution/venues/predict-fun/redemption.ts`
- Create: `tests/execution/predict-fun/adapter.test.ts`
- Create: `tests/execution/predict-fun/status.test.ts`
- Create: `tests/execution/predict-fun/cancellation.test.ts`
- Create: `tests/execution/predict-fun/positions.test.ts`
- Create: `tests/execution/predict-fun/redemption.test.ts`
- Create: `tests/fixtures/predict-fun/order-response.json`
- Create: `tests/fixtures/predict-fun/order-match.json`
- Create: `tests/fixtures/predict-fun/redemption.json`

- [ ] Write failing tests for exact bearer/body, expiry during submit, reject, timeout/late fill, partial, match tape, immutable cancellation artifact/full claim/fenced submit/cumulative cost, cancel race, balances, compensation, and resolved position.
- [ ] Invoke `liveAdapterContract`; submit the signed body once, validate the complete
  immutable order claim, and reconcile its deterministic IDs plus official order
  matches/account balances with one-field binding-drift refusal.
- [ ] If Predict.fun can report a working order, implement the full
  `LiveCancellationAdapter`; otherwise certify terminal-on-submit with official evidence
  and tests. A cancel response never outranks a late fill.
- [ ] Compensation uses a new bounded artifact. Automatic redemption requires a named official reference/fixture; otherwise expose manual redemption only.
- [ ] Run all Predict.fun, shared execution, and DB tests; all must pass.

## Task 6: Register Product Surface and Run Certification

**Files:**

- Modify: `src/workers/market-data.ts`
- Modify: `src/workers/execution.ts`
- Modify: `src/components/dashboard/venue-onboarding-card.tsx`
- Modify: `src/components/dashboard/funding-card.tsx`
- Modify: `src/components/dashboard/strategy-settings-form.tsx`
- Modify: `src/components/dashboard/automation-grant-card.tsx`
- Modify: `src/server/notifications/types.ts`
- Create: `docs/predict-fun-live-lane.md`
- Create: `scripts/smoke-predict-fun.ts`
- Create: `e2e/predict-fun-readiness.spec.ts`
- Create: `e2e/predict-fun-strategy-grant.spec.ts`

- [ ] Register the feed plus order/required-cancellation/redemption adapters only under current config, policy, account, exact-entry/cancellation capability, and official-baseline certification.
- [ ] Add funding, readiness, explicit replacement-grant consent/renewal/confirmation, strategy selection, links, and redacted notifications. E2E covers onboarding -> renewed grant -> activation and every missing/expired refusal.
- [ ] Add read-only `predict-fun:smoke`; it never signs/submits.
- [ ] Run full verify, DB/worker/E2E, smoke, audit, and diff checks.
- [ ] Complete shadow soak, independent review, kill-switch drill, and a genuine canary under remaining global $10 capacity.
- [ ] Review status; do not commit or push.
