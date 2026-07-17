# Opinion Live Lane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Opinion as the first follow-on World Cup venue with its own BSC account binding, policy, catalog/book feed, prepared order artifact, reconciliation, and canary.

**Architecture:** Opinion uses the shared live adapter and execution kernel. The user's embedded EVM wallet controls the officially required maker account. txBet signs only a bound CTF order through the Opinion-specific Privy policy and relays it once with txBet-owned builder credentials.

**Tech Stack:** Official Opinion CLOB SDK/API, viem, Privy, BSC RPC, Supabase, Zod, Vitest, Playwright, Railway.

## Global Constraints

- Start from the official [Opinion Open API overview](https://docs.opinion.trade/developer-guide/opinion-open-api/overview) and current linked auth/order/orderbook pages. Record access date and SDK version.
- Verify chain, collateral, decimals, exchange, domain, fee, signature type, and order semantics from current official evidence; reference-repo constants are not authority.
- Require official all-or-nothing entry semantics. If unavailable, finish catalog/shadow support but keep submission disabled.
- Opinion gets its own user grant scope, Privy policy ID/version, spend ceiling, credential state, kill switch, and canary cap under the global $10 ceiling.
- Do not commit or push.

---

## Task 1: Freeze Official Contracts, Dependency, and Environment Baseline

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `src/server/config/env.ts`
- Modify: `tests/server/env.test.ts`
- Create: `docs/references/opinion-api-baseline.md`

- [ ] Re-fetch the official overview and its current API pages. Record exact base URL, chain ID, collateral/decimals, SDK package/version, builder auth, EIP-712 domain/types, maker/signer model, order types, fee/status/cancel/redemption, pagination, and eligibility.
- [ ] Install and lock the current official SDK named by those docs; at the verified reference baseline the package is `@opinion-labs/opinion-clob-sdk`:

```bash
pnpm add @opinion-labs/opinion-clob-sdk
```

- [ ] Add blank server-only values: `OPINION_API_BASE_URL`, `OPINION_API_KEY`, `OPINION_BUILDER_API_KEY`, `OPINION_BSC_RPC_URL`, `OPINION_USDT_ADDRESS`, `OPINION_EXCHANGE_ALLOWLIST`, and `PRIVY_OPINION_POLICY_ID`. Require the shared BSC native/USD bound/expiry and a current Opinion USDT `AssetValuePolicy`; missing or expired values keep the lane unready.
- [ ] Extend only execution config with private/builder/RPC/policy values; market config receives the public catalog/book host and public API key only if officially required. Test fixed HTTPS hosts, BSC chain, checksummed addresses, and web-loader isolation.
- [ ] Run `pnpm install --frozen-lockfile`, focused env tests, `pnpm typecheck`, and `pnpm audit --prod`; all must pass without a critical/high production advisory.
- [ ] Review the focused diff; do not commit.

## Task 2: Complete Catalog, Settlement, Book, and Fee Ingestion

**Files:**

- Create: `src/venues/opinion/public/schemas.ts`
- Create: `src/venues/opinion/public/client.ts`
- Create: `src/venues/opinion/public/catalog.ts`
- Create: `src/venues/opinion/public/book.ts`
- Create: `src/workers/market-data/opinion-feed.ts`
- Create: `tests/execution/opinion/schemas.test.ts`
- Create: `tests/execution/opinion/public-client.test.ts`
- Create: `tests/execution/opinion/catalog.test.ts`
- Create: `tests/execution/opinion/book.test.ts`
- Create: `tests/execution/opinion/network-cost.test.ts`
- Create: `tests/workers/opinion-feed.test.ts`
- Create: `tests/fixtures/opinion/markets-page-1.json`
- Create: `tests/fixtures/opinion/markets-page-2.json`
- Create: `tests/fixtures/opinion/orderbook.json`

- [ ] Save sanitized official-shape fixtures; write failing schema tests for unknown enums, decimals, missing rules, status, and revisions.
- [ ] Write failing pagination tests where the only World Cup contract is on page two, plus checkpoint resume, rate limit, duplicate page, partial scan, complete-scan tombstone, and eligibility denial.
- [ ] Implement the fixed-host client and complete catalog walker. Normalize all raw World Cup markets; emit `UNVERIFIED` until every settlement field is proven.
- [ ] Normalize executable asks with exact USDT scale, current fee schedule/version, BSC EVM gas/setup estimate, and current USDT value policy. Reject floats, stale books, missing/expired fee/network/asset evidence, depeg bounds, and unsupported collateral. Run the network-cost suite against fixed official-shape RPC fixtures.
- [ ] Register the read-only feed in `src/workers/market-data.ts`; its role cannot access Opinion credentials or execution artifacts.
- [ ] Run the five focused suites above, `pnpm lint`, and `pnpm typecheck`; all must pass.
- [ ] Review checkpoint; do not commit.

## Task 3: Bind Account, Credential, Grant, and Onboarding State

**Files:**

- Create: `supabase/migrations/202607170008_opinion_accounts.sql`
- Create: `supabase/tests/database/016_opinion_accounts_test.sql`
- Create: `src/execution/venues/opinion/account.ts`
- Create: `src/execution/venues/opinion/credentials.ts`
- Create: `src/execution/venues/opinion/eligibility.ts`
- Modify: `src/server/grants/privy-policy.ts`
- Modify: `src/server/grants/service.ts`
- Modify: `src/server/onboarding/service.ts`
- Modify: `src/workers/execution/onboarding-loop.ts`
- Modify: `src/workers/execution/eligibility-refresh-loop.ts`
- Create: `src/app/api/venues/opinion/onboard/route.ts`
- Modify: `src/contracts/api.ts`
- Modify: `src/server/api/queries.ts`
- Modify: `src/server/strategies/service.ts`
- Create: `tests/execution/opinion/account.test.ts`
- Create: `tests/execution/opinion/credentials.test.ts`
- Create: `tests/execution/opinion/eligibility.test.ts`
- Create: `tests/grants/opinion-policy.test.ts`
- Create: `tests/workers/opinion-onboarding.test.ts`
- Modify: `tests/workers/eligibility-refresh-loop.test.ts`
- Create: `e2e/opinion-onboarding.spec.ts`
- Create: `tests/api/opinion-onboarding.test.ts`

- [ ] Write failing SQL tests for execution-only ciphertext, immutable account binding, unique owner/maker, RLS, and append-only credential versions.
- [ ] Write failing account tests for wrong EOA/Safe owner, signature type, chain, collateral, exchange, eligibility, and stale policy.
- [ ] Implement the current official maker/account path and independently verify on chain. Encrypt user-specific tokens/credentials with profile/account/version AAD.
- [ ] Implement the shared `VenueEligibilityInspector` with the current official Opinion
  signal. Produce venue-wide `onboard` evidence separately from exact
  contract/Opinion-market-binding/action evidence. Tests cover profile/wallet/account/
  environment isolation, denied/unknown/outage, expiry, binding drift, action mismatch,
  and prove venue-wide or another market's evidence cannot authorize an action.
- [ ] Register Opinion in `eligibility-refresh-loop.ts` and test refresh of every active
  strategy/recovery scope. Tests follow only the exact `venue_eligibility_current`
  pointer, never select/sort/fallback evidence rows, and reject a delayed old eligible
  response after a newer denied/unknown result.
- [ ] Add Opinion as an explicit grant venue with fixed BSC chain, current exchange/method allowlist, spend ceiling, policy version, and <=7-day expiry. Existing grants never gain it automatically.
- [ ] Extend the fixed onboarding job through account discovery/deployment, credential setup, allowance/readiness, verification, and recovery. Vercel only enqueues the job.
- [ ] Add the authenticated fixed Opinion onboarding route and safe readiness query. It accepts only expected wallet/grant versions, enqueues idempotently, and cannot activate a strategy until the current Opinion certification, account readiness, renewed grant scope, and all other selected venue scopes are current. Add API and strategy activation/refusal tests.
- [ ] Run DB, account, credential, eligibility, refresh-loop, policy, worker, and E2E onboarding tests; all must pass.
- [ ] Run `pnpm vitest run tests/execution/opinion/eligibility.test.ts tests/workers/eligibility-refresh-loop.test.ts`; both pass with Opinion registered.
- [ ] Review checkpoint; do not commit.

## Task 4: Build and Validate the Opinion Order Artifact

**Files:**

- Create: `src/execution/venues/opinion/order.ts`
- Create: `src/execution/venues/opinion/signing.ts`
- Create: `tests/execution/opinion/order.test.ts`
- Create: `tests/execution/opinion/signing.test.ts`
- Create: `tests/fixtures/opinion/order-build.json`

- [ ] Add an official-shape known-answer order fixture and write failing tests for maker/signer, token, exchange/domain, side/outcome, quantity, price, fee, salt/nonce/expiry, signature type, max spend, and one-field mutation.
- [ ] Build only the currently documented all-or-nothing order. If that order type is absent, return typed `VENUE_NO_ATOMIC_ENTRY` and keep the lane shadow-only.
- [ ] Independently re-derive the typed-data digest, sign through the Opinion policy, recover the signer, and bind the encrypted signed artifact plus deterministic locator.
- [ ] Run order/signing/artifact-hash tests and typecheck; all must pass.
- [ ] Review checkpoint; do not commit.

## Task 5: Submit Once, Reconcile, Compensate, and Redeem

**Files:**

- Create: `src/execution/venues/opinion/adapter.ts`
- Create: `src/execution/venues/opinion/status.ts`
- Create: `src/execution/venues/opinion/cancellation.ts`
- Create: `src/execution/venues/opinion/positions.ts`
- Create: `src/execution/venues/opinion/redemption.ts`
- Create: `tests/execution/opinion/adapter.test.ts`
- Create: `tests/execution/opinion/status.test.ts`
- Create: `tests/execution/opinion/cancellation.test.ts`
- Create: `tests/execution/opinion/positions.test.ts`
- Create: `tests/execution/opinion/redemption.test.ts`
- Create: `tests/fixtures/opinion/order-response.json`
- Create: `tests/fixtures/opinion/order-status.json`
- Create: `tests/fixtures/opinion/redemption.json`

- [ ] Write failing tests for builder auth/body, business `errno`, ACK/reject/timeout, late/partial fill, immutable cancellation artifact/full claim/fenced submit/cumulative cost, cancel race, REST disagreement, balances, bounded compensation, and resolved position.
- [ ] Implement `LiveVenueAdapter` and invoke `liveAdapterContract`. Relay the exact signed body once; timeout is unknown. Validate the complete immutable order claim, then reconcile its client/order/trade IDs and authoritative balance deltas; reject one-field binding drift.
- [ ] If Opinion can report a working order, implement the full `LiveCancellationAdapter`;
  otherwise certify terminal-on-submit with official evidence and tests. ACK never proves no fill.
- [ ] Implement compensation through a fresh bounded artifact. Implement redemption only from a named current official reference plus fixture; otherwise expose manual redemption and keep automatic signing disabled.
- [ ] Run every Opinion test, shared orchestrator/reconciler/compensation tests, and DB tests; all must pass.
- [ ] Review checkpoint; do not commit.

## Task 6: Integrate Product, Shadow, and Canary Gates

**Files:**

- Modify: `src/workers/execution.ts`
- Modify: `src/components/dashboard/venue-onboarding-card.tsx`
- Modify: `src/components/dashboard/funding-card.tsx`
- Modify: `src/components/dashboard/strategy-settings-form.tsx`
- Modify: `src/components/dashboard/automation-grant-card.tsx`
- Modify: `src/server/notifications/types.ts`
- Create: `docs/opinion-live-lane.md`
- Create: `scripts/smoke-opinion.ts`
- Create: `e2e/opinion-readiness.spec.ts`
- Create: `e2e/opinion-strategy-grant.spec.ts`

- [ ] Register the order plus required cancellation/redemption adapters only when their shared environment, policy, official baseline, exact-entry/cancellation capability certification, and account readiness are current.
- [ ] Add Opinion funding/readiness, venue links, strategy selection, explicit replacement-grant consent/confirmation, and typed notifications without exposing credentials or raw artifacts. E2E must cover onboarding -> renewed grant -> strategy selection/activation and refusal at every missing/expired prerequisite.
- [ ] Add `opinion:smoke` for public catalog/book and optional read-only account readiness; it never signs/submits.
- [ ] Run `pnpm verify`, DB/worker/E2E suites, smoke, audit, and `git diff --check`.
- [ ] Complete an Opinion-only shadow soak, independent review, kill-switch drill, and genuine-opportunity canary capped by remaining global $10 exposure.
- [ ] Review `git status --short`; do not commit or push.
