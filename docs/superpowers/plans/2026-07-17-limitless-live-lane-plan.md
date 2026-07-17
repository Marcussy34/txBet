# Limitless Live Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Limitless on Base with complete market ingestion, partner-authenticated FOK orders, real cancellation, user-scoped policy, and independent rollout evidence.

**Architecture:** Public catalog/book data is read from fixed official endpoints. The user's embedded EVM wallet owns the venue account and signs a fully bounded order. txBet applies official partner HMAC only to the exact request and relays once through the shared kernel.

**Tech Stack:** [Limitless Programmatic API](https://docs.limitless.exchange/developers/programmatic-api), [API reference](https://docs.limitless.exchange/api-reference/introduction), official SDK, viem, Privy, Base RPC, Supabase, Vitest.

## Global Constraints

- Re-fetch current official docs/changelog before implementation. Record exact SDK/API version and any fee/domain migration.
- Keep partner tokens, identity token, wallet bearer, and HMAC secret encrypted/server-only.
- Bind `onBehalfOf` to verified wallet ownership; never accept it from a public body.
- Use current FOK support and real cancel. Timeout still reconciles and never triggers blind resubmission.
- Limitless has a separate policy/grant/consent/canary scope.
- Do not commit or push.

---

## Task 1: Lock Official Dependency, Environment, and HMAC Contract

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `src/server/config/env.ts`
- Modify: `tests/server/env.test.ts`
- Create: `docs/references/limitless-api-baseline.md`

- [ ] Record official Base chain/collateral, SDK package/version, API hosts, partner auth, HMAC canonical string, market/book/order/cancel/status, FOK, fees, pagination, eligibility, and redemption.
- [ ] Install and lock the current official package; at the verified reference baseline it is:

```bash
pnpm add @limitless-exchange/sdk
```

- [ ] Add blank server values: `LIMITLESS_API_BASE_URL`, `LIMITLESS_BASE_RPC_URL`, `LIMITLESS_USDC_ADDRESS`, `LIMITLESS_EXCHANGE_ALLOWLIST`, `LIMITLESS_PARTNER_TOKEN_ID`, `LIMITLESS_PARTNER_TOKEN_SECRET`, `LIMITLESS_PARTNER_PRIVY_IDENTITY_TOKEN`, and `PRIVY_LIMITLESS_POLICY_ID`. Require the shared Base native/USD bound/expiry and a current USDC `AssetValuePolicy`; missing or expired values keep the lane unready.
- [ ] Extend least-privilege loaders/tests for fixed host, Base chain, address lists, complete partner credential tuple, and web/market secret isolation.
- [ ] Run frozen install, env tests, typecheck, audit, and diff check.

## Task 2: Catalog Every Market and Normalize the YES/NO Books

**Files:**

- Create: `src/venues/limitless/public/schemas.ts`
- Create: `src/venues/limitless/public/client.ts`
- Create: `src/venues/limitless/public/catalog.ts`
- Create: `src/venues/limitless/public/book.ts`
- Create: `src/workers/market-data/limitless-feed.ts`
- Create: `tests/execution/limitless/schemas.test.ts`
- Create: `tests/execution/limitless/public-client.test.ts`
- Create: `tests/execution/limitless/catalog.test.ts`
- Create: `tests/execution/limitless/book.test.ts`
- Create: `tests/execution/limitless/network-cost.test.ts`
- Create: `tests/workers/limitless-feed.test.ts`
- Create: `tests/fixtures/limitless/markets-page-1.json`
- Create: `tests/fixtures/limitless/markets-page-2.json`
- Create: `tests/fixtures/limitless/orderbook.json`

- [ ] Write failing official-shape schema, rule, revision, status, decimal, and collateral tests.
- [ ] Prove pagination completeness, checkpoint restart, duplicate handling, rate-limit recovery, partial scan, and complete-scan tombstone with a World Cup market on page two.
- [ ] Implement the fixed-host catalog walker and settlement normalization.
- [ ] If the API still returns only the YES book, derive the NO book by the exact reviewed binary complement transform and invalidate it on market/rule revision. Reject non-binary/push-capable markets.
- [ ] Add exact USDC6, fee schedule, Base EVM gas/setup estimate, and current USDC value policy; reject missing/expired evidence or depeg bounds, run the network-cost suite against fixed RPC fixtures, then register the read-only feed.
- [ ] Run all catalog/book/feed tests, lint, and typecheck.

## Task 3: Bind Partner Identity, Wallet Account, Policy, and Onboarding

**Files:**

- Create: `supabase/migrations/202607170010_limitless_accounts.sql`
- Create: `supabase/tests/database/018_limitless_accounts_test.sql`
- Create: `src/execution/venues/limitless/partner-auth.ts`
- Create: `src/execution/venues/limitless/account.ts`
- Create: `src/execution/venues/limitless/eligibility.ts`
- Modify: `src/server/grants/privy-policy.ts`
- Modify: `src/server/grants/service.ts`
- Modify: `src/server/onboarding/service.ts`
- Modify: `src/workers/execution/onboarding-loop.ts`
- Modify: `src/workers/execution/eligibility-refresh-loop.ts`
- Create: `src/app/api/venues/limitless/onboard/route.ts`
- Modify: `src/contracts/api.ts`
- Modify: `src/server/api/queries.ts`
- Modify: `src/server/strategies/service.ts`
- Create: `tests/execution/limitless/partner-auth.test.ts`
- Create: `tests/execution/limitless/account.test.ts`
- Create: `tests/execution/limitless/eligibility.test.ts`
- Create: `tests/grants/limitless-policy.test.ts`
- Create: `tests/workers/limitless-onboarding.test.ts`
- Modify: `tests/workers/eligibility-refresh-loop.test.ts`
- Create: `e2e/limitless-onboarding.spec.ts`
- Create: `tests/api/limitless-onboarding.test.ts`

- [ ] Write SQL/RLS tests for encrypted credential versions, owner uniqueness, execution-only ciphertext, and immutable binding.
- [ ] Write a known-answer HMAC test for `${iso}\n${METHOD}\n${pathQuery}\n${body}`, including query/body byte exactness, timestamp window, wrong owner, and redirect.
- [ ] Verify wallet/account/exchange/collateral/eligibility and encrypt all user/partner session material with scoped AAD.
- [ ] Implement the shared `VenueEligibilityInspector` from the current official
  Limitless signal. Produce venue-wide `onboard` evidence separately from exact canonical
  contract/Limitless-market-binding/action evidence. Test profile/wallet/account/
  environment isolation, denied/unknown/outage, expiry, binding/action drift, and refusal
  to reuse onboarding or another market's evidence.
- [ ] Register Limitless in `eligibility-refresh-loop.ts`; test every active strategy and
  recovery scope. Tests follow only the exact `venue_eligibility_current` pointer, never
  select/sort/fallback evidence rows, and reject a delayed old eligible response after a
  newer denied/unknown result.
- [ ] Add a Limitless-specific Base policy and explicit renewed user grant; fixed onboarding reaches verified allowance/readiness and recovers idempotently.
- [ ] Add the authenticated fixed Limitless onboarding route and safe readiness query. It accepts only expected wallet/grant versions, enqueues idempotently, and strategy activation requires current certification, account readiness, and explicit replacement grant. Add API and activation/refusal tests.
- [ ] Run DB/auth/account/eligibility/refresh-loop/policy/onboarding/E2E suites.
- [ ] Run `pnpm vitest run tests/execution/limitless/eligibility.test.ts tests/workers/eligibility-refresh-loop.test.ts`; both pass with Limitless registered.

## Task 4: Build and Sign the FOK Artifact

**Files:**

- Create: `src/execution/venues/limitless/order.ts`
- Create: `src/execution/venues/limitless/signing.ts`
- Create: `tests/execution/limitless/order.test.ts`
- Create: `tests/execution/limitless/signing.test.ts`
- Create: `tests/fixtures/limitless/order-build.json`

- [ ] Write failing known-answer and mutation tests for owner/maker/signer, exchange/domain, token/outcome, side, price, quantity, fee, nonce/salt/expiry, FOK, client ID, and max spend.
- [ ] Build only the current official FOK request; re-derive every field and hash before signing.
- [ ] Sign through Privy, recover the user, persist the encrypted artifact and deterministic locator.
- [ ] Run order/signing/hash tests and typecheck.

## Task 5: Submit Once, Cancel Safely, and Reconcile

**Files:**

- Create: `src/execution/venues/limitless/adapter.ts`
- Create: `src/execution/venues/limitless/status.ts`
- Create: `src/execution/venues/limitless/cancellation.ts`
- Create: `src/execution/venues/limitless/positions.ts`
- Create: `src/execution/venues/limitless/redemption.ts`
- Create: `tests/execution/limitless/adapter.test.ts`
- Create: `tests/execution/limitless/status.test.ts`
- Create: `tests/execution/limitless/cancellation.test.ts`
- Create: `tests/execution/limitless/positions.test.ts`
- Create: `tests/execution/limitless/redemption.test.ts`
- Create: `tests/fixtures/limitless/order-response.json`
- Create: `tests/fixtures/limitless/order-status.json`
- Create: `tests/fixtures/limitless/redemption.json`

- [ ] Write tests for exact HMAC request, ACK/reject/timeout, duplicate client ID, partial/late fill, immutable DELETE cancellation artifact/full claim/fenced submit/final-zero and cumulative cost, cancel/fill race, balances, compensation, and resolution.
- [ ] Invoke `liveAdapterContract`; submit once and use the full
  `LiveCancellationAdapter` only for an authoritative working order. Reconcile its complete
  claim, timeout, cost, and cancel races separately from original state/fills. Original
  order reconciliation also validates the complete immutable order claim and rejects any
  response binding drift.
- [ ] Implement bounded compensation and official-reference-gated redemption; otherwise manual redemption.
- [ ] Run every Limitless/shared execution/DB test.

## Task 6: Product Registration and Independent Rollout

**Files:**

- Modify: `src/workers/market-data.ts`
- Modify: `src/workers/execution.ts`
- Modify: `src/components/dashboard/venue-onboarding-card.tsx`
- Modify: `src/components/dashboard/funding-card.tsx`
- Modify: `src/components/dashboard/strategy-settings-form.tsx`
- Modify: `src/components/dashboard/automation-grant-card.tsx`
- Modify: `src/server/notifications/types.ts`
- Create: `docs/limitless-live-lane.md`
- Create: `scripts/smoke-limitless.ts`
- Create: `e2e/limitless-readiness.spec.ts`
- Create: `e2e/limitless-strategy-grant.spec.ts`

- [ ] Register only the jointly certified feed/order/cancellation/redemption/config/policy/account combination.
- [ ] Add Base funding/readiness, explicit replacement-grant consent/renewal/confirmation, strategy selection, safe links, and notifications. E2E covers onboarding -> renewed grant -> activation and every missing/expired refusal.
- [ ] Add a read-only smoke script with no signing/submission.
- [ ] Run full verify, database, worker, E2E, smoke, audit, and diff checks.
- [ ] Complete venue shadow soak, independent review, kill-switch drill, and genuine canary under remaining global $10 capacity.
- [ ] Do not commit or push.
