# World Cup Product and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the platform and market/execution slices into an automatic user product with a shadow-only direct-Polymarket-BUY view, a guarded pre-split-inventory/exact-share-SELL Polymarket canary candidate, a no-live-surface DFlow status, durable workers, notifications, operator controls, and production-shaped deployment.

**Architecture:** Vercel hosts the authenticated Next.js control plane. A Railway market-data service owns TxLINE and venue feeds. A separate Railway execution service owns opportunity dispatch, submission, reconciliation, compensation, redemption, notifications, and health. Supabase jobs/outbox make every loop recoverable. Execution mode is the stricter of an environment ceiling and an audited database state.

**Tech Stack:** Next.js App Router, React, shadcn/ui, Tailwind, Privy, Supabase Postgres, Resend, `prom-client`, Railway, Vercel, Vitest, Playwright, and tsup.

## Global Constraints

- `/console` stays a disclosed simulation. Live controls and data live under `/dashboard`.
- Automatic execution requires active user strategy, active two-wallet grant, current risk settings, current venue readiness, and the effective execution mode.
- Disabling new execution must never stop reconciliation, compensation, redemption, or revocation.
- Polygon and Solana funding are separate. Do not add bridging, swapping between chains, or automatic rebalancing.
- Email is sent only to the current verified Privy email and contains no secret, signed payload, complete address, or sensitive raw evidence.
- Operator routes require operator role plus recent authentication and always append an audit event.
- No UI/API exposes generic signing, transaction, calldata, host, contract, program, or amount controls.
- Do not commit or push.

---

## Task 1: Add Audit, Outbox, Notification, Lease, and Operator-State Persistence

**Files:**

- Create: `supabase/migrations/202607170007_operations_audit_and_outbox.sql`
- Create: `supabase/tests/database/012_outbox_test.sql`
- Create: `supabase/tests/database/013_notifications_rls_test.sql`
- Create: `supabase/tests/database/014_worker_leases_test.sql`
- Create: `supabase/tests/database/015_operator_state_test.sql`
- Create: `supabase/tests/database/016_operations_migration_order_test.sql`
- Create: `src/server/audit/repository.ts`
- Create: `src/server/outbox/repository.ts`
- Create: `src/server/workers/leases.ts`
- Create: `src/server/crypto/rotation-repository.ts`
- Create: `tests/server/audit-repository.test.ts`
- Create: `tests/server/outbox-repository.test.ts`
- Create: `tests/server/worker-leases.test.ts`
- Create: `tests/server/envelope-rotation-repository.test.ts`

- [ ] Write failing pgTAP tests for append-only audit/outbox payloads, outbox delivery-state claim/reclaim and append-only attempts, notification ownership/RLS, worker claim/reclaim, database-time expiry, envelope-rotation lease/reclaim/reference counts, operator action versioning, entry/recovery mode constraints, and clean migration ordering from foundation `0002` through operations `0007`.

- [ ] Create:

```text
audit_events
outbox_events
outbox_delivery_state
outbox_delivery_attempts
notifications
email_deliveries
worker_leases
venue_onboarding_jobs
envelope_rotation_jobs
```

Audit events, outbox event payloads, delivery attempts, and provider receipts are
append-only. Leasing/retry counters live only in mutable `outbox_delivery_state`, keyed
one-to-one to the immutable event/channel/recipient dedupe key; claim and completion
functions use optimistic versions and database time. A timeout appends an attempt and
returns the projection to pending only after lease expiry, without mutating the event.
Notifications may update only `read_at` through an owner-checked function.
`venue_onboarding_jobs` uses `PENDING -> RUNNING -> WAITING_USER | VERIFYING -> READY`,
with `FAILED` and `RECONCILING` recovery states; every step and external reference is
idempotent. `envelope_rotation_jobs` lease one referenced row/key version at a time and
CAS the ciphertext/version after out-of-transaction decrypt/re-encrypt work. Index all
  pending/lease/profile chronological queries.
Migration `0007` must not create, replace, or redefine the foundation-owned
`runtime_control_state` table from migration `0002`. It only grants the operations worker
the minimum heartbeat-function permission, adds operations-owned indexes if needed, and
uses the existing singleton. The heartbeat contains deployment entry/recovery ceilings,
config hash, recovery-path health, observed time, and expiry. It is not operator-writable.
Reservation and marker functions require a fresh row and derive effective modes as the
strictest of deployment ceiling, audited requested state, and recovery health; stale state
fails closed. The migration-order test applies `0002 -> 0007` and proves table identity,
owner, constraints, and existing kernel `0004` foreign/function dependencies are intact.

- [ ] Implement transactional outbox insertion that receives the caller's existing `DbTransaction`:

```ts
export function enqueueOutbox(
  transaction: DbTransaction,
  input: OutboxInput,
): Promise<void>;

export function claimOutboxBatch(
  workerId: string,
  limit: number,
  leaseMs: number,
): Promise<readonly OutboxClaim[]>;
```

Claims mutate only `outbox_delivery_state` using `FOR UPDATE SKIP LOCKED`, database time,
and bounded attempts. A dedupe key is unique per channel/event/recipient. Crash tests cover
claim, lease expiry, provider timeout, late receipt, and dedupe-aware retry.

- [ ] Use the foundation's requested database execution mode separately from the environment ceiling. Effective mode is the lower-ranked value. A mode change appends an audit event with operator, previous/new values, reason, and recent-auth evidence hash.

- [ ] Run:

```bash
pnpm db:reset
pnpm test:db
pnpm vitest run tests/server/audit-repository.test.ts tests/server/outbox-repository.test.ts tests/server/worker-leases.test.ts tests/server/envelope-rotation-repository.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 2: Implement In-App and Email Notifications

**Files:**

- Create: `src/server/notifications/types.ts`
- Create: `src/server/notifications/repository.ts`
- Create: `src/server/notifications/service.ts`
- Create: `src/server/notifications/resend.ts`
- Create: `src/server/notifications/templates.tsx`
- Create: `src/app/api/notifications/route.ts`
- Create: `src/app/api/notifications/[notificationId]/read/route.ts`
- Create: `tests/notifications/service.test.ts`
- Create: `tests/notifications/resend.test.ts`
- Create: `tests/api/notifications.test.ts`

- [ ] Write failing tests for all required kinds, dedupe, retryable/provider-terminal failure, verified-email change, redaction, read ownership, keyset pagination, and partial channel delivery.

- [ ] Support explicit typed kinds:

```text
grant_created
grant_expiring
grant_renewal_due
grant_expired
grant_revoked
strategy_activated
strategy_paused
bundle_submitted
bundle_matched
bundle_no_trade
bundle_refused
bundle_canceled
bundle_reconciled
bundle_unknown
fill_partial
fill_unmatched
compensation_started
compensation_completed
compensation_blocked
kill_switch_activated
kill_switch_reset
wallet_readiness_problem
deposit_problem
balance_problem
approval_problem
gas_problem
eligibility_denied
redemption_available
redemption_completed
```

- [ ] `enqueueNotification` writes the in-app record and channel outbox entries inside the same transaction as the triggering state transition.

- [ ] Render React email templates with safe text values only. Abbreviate public addresses/IDs, link to the authenticated dashboard, and never include venue credentials, policy IDs, raw signed payloads, complete error objects, or detailed personal data.

- [ ] Implement Resend with a fixed API host, idempotency/dedupe key, bounded timeout, safe error codes, and retry schedule. Provider timeout remains pending until dedupe-aware retry.

- [ ] Implement authenticated notification list/read routes with keyset pagination and Zod validation.

- [ ] Run:

```bash
pnpm vitest run tests/notifications tests/api/notifications.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 3: Add User Read APIs and Guarded Mutation APIs

**Files:**

- Create: `src/contracts/api.ts`
- Create: `src/app/api/wallets/readiness/route.ts`
- Create: `src/app/api/venues/polymarket/onboard/route.ts`
- Create: `src/app/api/venues/dflow/shadow-readiness/route.ts`
- Create: `src/app/api/opportunities/route.ts`
- Create: `src/app/api/executions/route.ts`
- Create: `src/app/api/executions/[bundleId]/route.ts`
- Create: `src/app/api/positions/route.ts`
- Create: `src/app/api/redemptions/route.ts`
- Create: `src/app/api/kill-switch/route.ts`
- Create: `src/server/api/queries.ts`
- Create: `src/server/onboarding/repository.ts`
- Create: `src/server/onboarding/service.ts`
- Create: `tests/api/wallet-readiness.test.ts`
- Create: `tests/api/venue-onboarding.test.ts`
- Create: `tests/api/opportunities.test.ts`
- Create: `tests/api/executions.test.ts`
- Create: `tests/api/positions.test.ts`
- Create: `tests/api/kill-switch.test.ts`

- [ ] Write failing tests for auth, ownership, invalid IDs/cursors, stale `expectedVersion`, a clean first user completing grant -> onboarding -> readiness, replacement-venue grant -> onboarding, duplicate onboarding, venue not approved, missing grant, kill-switch idempotency, forbidden reset, sensitive-field stripping, and no-store caching.

- [ ] Define versioned Zod response contracts. Convert bigint database values to canonical decimal strings; return formatted display values separately. Never serialize a JavaScript bigint directly.

- [ ] All authenticated responses set `Cache-Control: private, no-store`. Query only the session profile under RLS and select safe columns explicitly.

- [ ] The Polymarket onboarding mutation route accepts only `expectedWalletVersion` and
  `expectedGrantVersion`. It enqueues a fixed venue-specific job transactionally and returns
  `202`; it does not call Privy signing, RPC write, relayer, or Polymarket from Vercel.
  Duplicate requests reuse the same idempotent job. DFlow exposes only an authenticated
  read-only shadow-readiness route; there is no DFlow onboarding mutation while official
  discovery/eligibility is unavailable.

- [ ] An onboarding job is eligible only when the active grant explicitly contains that venue's current policy/version and spend ceiling. The worker persists each deposit-wallet, credential, approval, eligibility, and readiness transition before the next network call. A restart resumes by inspection; it never repeats an ambiguous deployment/approval blindly.

- [ ] User kill-switch activation is immediate, idempotent, and does not require recent auth. Reset requires reconciliation-clear state, active verified grant, no residual/unknown execution, and an explicit confirmation body.

- [ ] The redemption route accepts only a position ID and expected version, never
  transaction data. Server code derives `RedemptionIntentSemantics`; one transaction
  hashes it, derives scope/attempt key, assigns the winning redemption UUID, and returns
  the unique materialized intent when different UUID proposals race. The worker performs
  all preparation and signing with `RedemptionExecutionContext`.

- [ ] Run:

```bash
pnpm vitest run tests/api
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 4: Build the Automatic Market-Data Worker

**Files:**

- Create: `src/workers/shared/loop.ts`
- Create: `src/workers/shared/health-server.ts`
- Create: `src/workers/shared/observability.ts`
- Create: `src/workers/market-data/polymarket-feed.ts`
- Create: `src/workers/market-data/dflow-documentation-gate.ts`
- Create: `src/workers/market-data/catalog-refresh.ts`
- Create: `src/workers/market-data.ts`
- Create: `tests/workers/loop.test.ts`
- Create: `tests/workers/health-server.test.ts`
- Create: `tests/workers/market-data.test.ts`

- [ ] Install metrics support:

```bash
pnpm add prom-client
```

- [ ] Write failing tests for lease acquisition/loss, clean shutdown, TxLINE reconnect, venue refresh, source dedupe, stale-stream readiness, database outage, malformed upstream data, backpressure, and shadow opportunity generation.

- [ ] Compose the TxLINE feed with the Polymarket catalog/book feed and DFlow's read-only
  documentation/endpoint gate. There is no current official DFlow catalog or quote prober.
  The market-data service never receives the DFlow key, fabricates a DFlow book/link/mint,
  or emits `PROFILE_PROBE_REQUIRED`; it persists only
  `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE` and `DFLOW_OUTPUT_NOT_EXACT`.

- [ ] Every venue catalog refresh persists page checkpoints, row/page counts, rate-limit state, and a completion marker. Readiness reports partial scans. Tests prove later-page World Cup contracts are cataloged, restarts resume safely, duplicates do not multiply rows, and only complete scans create tombstones.

- [ ] Use one abortable loop per source with jittered bounded backoff. A lease loss aborts source processing before any subsequent persistence. Do not hold a database transaction while waiting on a stream or HTTP request.

- [ ] Expose:

```text
GET /livez  -> process loop is running
GET /readyz -> DB lease held and required source freshness within bound
GET /metrics -> redacted Prometheus metrics
```

Readiness must fail for stale required World Cup feeds; liveness remains true during recoverable upstream outage.

- [ ] Emit metrics for source freshness, catalog revisions, book age, wakeup lag, opportunity age, invalid payloads, and lease status. Structured logs contain correlation/evidence IDs and safe error codes only.

- [ ] Run:

```bash
pnpm vitest run tests/workers/loop.test.ts tests/workers/health-server.test.ts tests/workers/market-data.test.ts tests/workers/shadow-feed.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 5: Build the Automatic Execution, Reconciliation, and Outbox Worker

**Files:**

- Create: `src/workers/execution/opportunity-dispatcher.ts`
- Create: `src/workers/execution/reconciliation-loop.ts`
- Create: `src/workers/execution/compensation-loop.ts`
- Create: `src/workers/execution/redemption-loop.ts`
- Create: `src/execution/redemption.ts`
- Create: `src/workers/execution/outbox-loop.ts`
- Create: `src/workers/execution/onboarding-loop.ts`
- Create: `src/workers/execution/eligibility-refresh-loop.ts`
- Create: `src/workers/execution/notification-scheduler.ts`
- Create: `src/workers/execution/envelope-rotation-loop.ts`
- Create: `src/workers/execution.ts`
- Create: `tests/workers/opportunity-dispatcher.test.ts`
- Create: `tests/workers/reconciliation-loop.test.ts`
- Create: `tests/workers/compensation-loop.test.ts`
- Create: `tests/workers/redemption-loop.test.ts`
- Create: `tests/execution/redemption.test.ts`
- Create: `tests/workers/outbox-loop.test.ts`
- Create: `tests/workers/onboarding-loop.test.ts`
- Create: `tests/workers/eligibility-refresh-loop.test.ts`
- Create: `tests/workers/notification-scheduler.test.ts`
- Create: `tests/workers/envelope-rotation-loop.test.ts`
- Create: `tests/workers/execution-worker.test.ts`

- [ ] Write failing tests for automatic opt-in dispatch, inactive strategy, expired/revoked grant, grant renewal/expiry scanning, repeated readiness alert dedupe, user+operator unmatched-fill delivery, Polymarket onboarding/deposit-wallet/credential/pUSD allowance/complete-set inventory steps, direct-BUY shadow refusal, DFlow no-live-surface readiness, duplicate onboarding, insufficient funds, disabled/shadow/canary/live entry modes, enabled/frozen recovery-action modes with a pre-existing residual, duplicate opportunities, lease loss, shutdown during network call, reconciliation while disabled, compensation priority, redemption, outbox retry, and health backlog thresholds.

- [ ] For supported public-book pairs, the dispatcher claims current unexpired opportunities
  and finds eligible active user strategies. It rejects every DFlow-containing pair before
  reservation with `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE` and
  `DFLOW_OUTPUT_NOT_EXACT`. There is no profile-probe discovery, probe job, user-specific
  DFlow quote, or DFlow-scoped opportunity under the current baseline.

- [ ] Implement the shared `LiveRedemptionAdapter` service contract. Tests mutate every
  owner/destination/position/quantity/payout-asset/minimum-payout/cost/resolution/expiry
  field, cover one active intent per position revision, durable submit-start, timeout,
  late success, reverted receipt, minimum-payout failure, finality/reorg, and exactly-once
  payout/position accounting. Also prove a reverted on-chain redemption realizes its
  network/setup cost once, an unknown receipt holds the full authorized cost bound, and a
  duplicate final receipt cannot charge twice. Race ordinals against one cumulative
  redemption cost budget and reject any reservation above its immutable ceiling. An
  unknown redemption is reconciled and never resubmitted.

- [ ] Priority order is:

```text
1. compensation
2. reconciliation and revocation verification
3. revocation and venue onboarding/readiness
4. redemption
5. new execution
6. envelope rotation maintenance
7. notifications
```

Envelope rotation never runs ahead of compensation/reconciliation. It uses the active
keyring, a durable lease, out-of-transaction crypto, and a CAS write; it retains every old
decrypt key until the reference-count guard in the rotation runbook reaches zero.

New entry execution pauses when unknown/reconciliation backlog or required health exceeds
configured thresholds. Read-only reconciliation and notifications continue in every entry
mode. Cancellation, compensation, and redemption may sign or submit only when
`RECOVERY_ACTION_MODE=enabled`, the action is linked to a pre-existing persisted
attempt/position, the user's fixed grant remains active, and all action-specific gates
pass. `frozen` blocks every recovery signature/broadcast while reconciliation and urgent
manual-action alerts continue.

- [ ] Register only the reviewed Polymarket pre-split-inventory/exact-share-SELL order and
  cancellation adapters in phase one, and only after their candidate promotion gate passes.
  Direct Polymarket BUY and every DFlow live adapter remain unregistered. Register each
  venue's redemption adapter only when its
  named current official-reference fixture, complete adapter contract tests, current
  certification, and exact redemption eligibility are present; otherwise automatic
  redemption is structurally disabled and the authenticated manual path is shown. DFlow's
  current shadow module has no cancellation, signer, or submission surface.
  Construction validates fixed hosts, policy IDs, RPCs, contract/program allowlists, and
  secrets before readiness can pass.

- [ ] Each registered venue provides a fixed read-only eligibility inspector. The refresh
  loop first allocates a durable exact-tuple/scope generation, fence, and lease, then calls
  the inspector outside the transaction. It persists versioned `VenueEligibilityEvidence` for exact profile/wallet/account/
  venue/environment plus venue-or-market/action scopes before expiry and on account,
  environment, contract, or market-binding drift. It refreshes every active strategy leg
  and recovery action separately. The result may advance the current pointer only through
  a generation/fence/lease CAS; delayed eligible responses after a newer denial/unknown
  remain audit-only. Denied, unknown, stale, scope-mismatched, or
  upstream-unavailable evidence pauses only the dependent scopes/strategies and sends a
  deduplicated alert; it never retries another region/identity or bypasses upstream rules.

- [ ] Start the same `/livez`, `/readyz`, and `/metrics` surface. Readiness includes DB lease, Privy access, RPC health, grant-policy configuration, reconciliation age, unresolved residual exposure, and outbox age.

- [ ] Run:

```bash
pnpm vitest run tests/workers
pnpm vitest run tests/execution
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 6: Complete the Live Dashboard and Funding Experience

**Files:**

- Modify: `src/app/(authenticated)/dashboard/page.tsx`
- Modify: `src/app/(authenticated)/dashboard/settings/page.tsx`
- Create: `src/app/(authenticated)/dashboard/opportunities/page.tsx`
- Create: `src/app/(authenticated)/dashboard/executions/page.tsx`
- Create: `src/app/(authenticated)/dashboard/executions/[bundleId]/page.tsx`
- Create: `src/app/(authenticated)/dashboard/positions/page.tsx`
- Create: `src/components/dashboard/funding-card.tsx`
- Create: `src/components/dashboard/venue-onboarding-card.tsx`
- Create: `src/components/dashboard/opportunities-table.tsx`
- Create: `src/components/dashboard/executions-table.tsx`
- Create: `src/components/dashboard/execution-timeline.tsx`
- Create: `src/components/dashboard/positions-table.tsx`
- Create: `src/components/dashboard/notifications-panel.tsx`
- Create: `src/lib/authenticated-fetch.ts`
- Create: `tests/components/live-dashboard.test.tsx`
- Create: `tests/components/execution-timeline.test.tsx`
- Create: `e2e/funding-and-readiness.spec.ts`
- Create: `e2e/live-dashboard.spec.ts`

- [ ] Write failing component/E2E tests for signed out, loading, two-chain funding, no automatic bridge, venue onboarding jobs/readiness/failure, strategy opt-in, grant expiry, risk limits, opportunity evidence, every bundle state, unknown/unhedged alert, compensation, notifications, kill switch, and mobile keyboard accessibility.

- [ ] Implement `authenticatedFetch` using the Privy SDK's current in-memory access-token method and `Authorization: Bearer`. Never persist the token. Mutation requests attach same-origin metadata and version/idempotency fields required by the API.

- [ ] Show Polygon and Solana addresses separately with copy actions, network labels, required collateral/gas, current balances, approvals/readiness, and venue links. State clearly that users must fund each chain separately.

- [ ] Opportunity detail shows both rule sources, settlement fingerprint/version, book/fee revisions, equal quantity, all costs/buffers, expiry, expected payout/profit, and why a candidate is shadow/non-executable.

- [ ] Execution detail shows the durable timeline, leg locators in abbreviated form, fills, uncertainty, compensation, current position, notifications, and kill-switch state. It never renders raw JSON evidence or signed payloads.

- [ ] Use existing shadcn components, Tailwind utilities, and lucide icons. Preserve existing landing/brand files except for a final separately reviewed `/dashboard` CTA if needed.

- [ ] Run:

```bash
pnpm vitest run tests/components
pnpm exec playwright test --grep "funding|dashboard"
pnpm build
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 7: Add Audited Operator Controls Without a Signing Surface

**Files:**

- Create: `src/app/(authenticated)/dashboard/operator/page.tsx`
- Create: `src/components/dashboard/operator-controls.tsx`
- Create: `src/app/api/operator/mode/route.ts`
- Create: `src/app/api/operator/recovery-mode/route.ts`
- Create: `src/app/api/operator/kill-switches/route.ts`
- Create: `src/app/api/operator/contract-links/[linkId]/review/route.ts`
- Create: `src/app/api/operator/venues/[venueId]/certification/route.ts`
- Create: `src/app/api/operator/reconciliation/[jobId]/route.ts`
- Create: `src/app/api/operator/allowlists/route.ts`
- Create: `src/app/api/operator/allowlists/[entryId]/route.ts`
- Create: `src/server/operator/service.ts`
- Create: `tests/operator/service.test.ts`
- Create: `tests/api/operator.test.ts`
- Create: `e2e/operator-controls.spec.ts`

- [ ] Write failing tests for non-operator, stale authentication, entry-mode environment ceiling, recovery-action environment freeze, illegal mode jump, recovery enable with unhealthy grants/compensation path, unresolved unknown/bounded-residual/unhedged state, venue certification issue/promote/expiry/hash mismatch, canary allowlist create/update/revoke/expiry, link review evidence, kill-switch activation/reset, reconciliation annotation, CSRF/origin failure, and complete audit event.

- [ ] Require recent Privy authentication using a verified token authentication time within the configured short window. Email allowlist alone is insufficient.

- [ ] Mode promotion prerequisites:

```text
disabled -> shadow: migrations/workers healthy
shadow -> canary: adapter suites, shadow soak, kill-switch drill, zero UNKNOWN/BOUNDED_RESIDUAL/UNHEDGED/INVALID
canary -> live: successful genuine canary reconciliation, independent review, operator reason
```

Canary/live promotion additionally requires effective recovery action mode `enabled`, a
fresh healthy `runtime_control_state`, and current recovery certification. Demotion is
always allowed and immediate. The audited recovery-freeze function locks operator/runtime
state, demotes requested entry mode to `shadow` before setting recovery `frozen`, and
appends both audit events in one transaction. An environment freeze makes effective entry
mode no higher than `shadow` through the worker heartbeat and blocks reservation/markers
even before an operator request catches up.

- [ ] Store both requested entry mode and requested recovery-action mode in versioned
  `operator_state`; every change appends an audit record. `EXECUTION_MODE` and
  `RECOVERY_ACTION_MODE` are immutable deployment ceilings. Effective recovery is frozen
  whenever the environment ceiling is `frozen`; when the ceiling is `enabled`, the
  operator route may switch the database request only after recent auth, healthy fixed
  policies/grants, zero unknown recovery actions, a compensation/cancellation drill, a
  reason, and optimistic version check. The emergency transition to `frozen` is always
  allowed. No operator mode route can sign, submit, or supply an intent.

- [ ] Contract-link review accepts only a known link/version and an approved transform-rule ID from the closed registry. It cannot edit raw rule data or upload code.

- [ ] Venue certification accepts only a closed `LiveVenueId` and server-derived evidence
  from the deployed adapter/config/build, recorded official baseline, contract-test run,
  and shadow-soak record. The request may provide a reason and expected pointer version,
  never hashes, hosts, policies, contracts, programs, or arbitrary evidence. The service
  writes an immutable certification version and promotes its pointer transactionally with
  an audit event. Expiry or any deployed hash/version drift invalidates readiness,
  strategies, reservations, and both final gates immediately.

- [ ] Reconciliation routes can request a poll, attach a safe operator note, or activate a switch. They cannot resubmit, sign, replace transaction bytes, or force terminal fill state.

- [ ] Allowlist routes manage a profile plus optional venue scope, expiry, maximum canary exposure no greater than the remaining global $10 cap, reason, and optimistic version. Every change requires recent auth and an audit event. Expired/revoked entries fail closed; direct database edits are not part of the runbook.

- [ ] Run:

```bash
pnpm vitest run tests/operator tests/api/operator.test.ts
pnpm exec playwright test --grep "operator"
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 8: Build Worker Artifacts and Deployment Configuration

**Files:**

- Create: `tsup.config.ts`
- Create: `deploy/railway/market-data.toml`
- Create: `deploy/railway/execution.toml`
- Create: `docs/runbooks/deployment.md`
- Create: `docs/runbooks/secret-ownership.md`
- Modify: `README.md`

- [ ] Configure tsup to build `src/workers/market-data.ts` and `src/workers/execution.ts` for Node 24 ESM with source maps and no web bundle. Pin and verify Node `>=24` in local, CI, Railway, and Vercel build environments because the pinned unified Polymarket client requires it.

- [ ] Configure separate Railway services with distinct start commands, health paths, restart policies, and environment scopes. Market-data receives `SUPABASE_MARKET_DATABASE_URL` plus read/public feed secrets only. Execution receives `SUPABASE_EXECUTION_DATABASE_URL`, Privy authorization, encryption, DFlow, RPC, and email secrets.

- [ ] Vercel receives only web/auth/RLS-read configuration. It must not receive `PRIVY_AUTHORIZATION_PRIVATE_KEY`, `DFLOW_API_KEY`, worker database URL, envelope key, venue HMAC secrets, or write RPCs.

- [ ] Document exact secret ownership and rotation. txBet secrets are created in txBet accounts; no Predictefy `.env` file is sourced or imported.

- [ ] Build and inspect artifacts:

```bash
pnpm build:workers
pnpm build
if rg -n "PRIVY_AUTHORIZATION_PRIVATE_KEY|DFLOW_API_KEY|TXBET_ENVELOPE_KEYRING_JSON" .next/static; then exit 1; fi
```

Expected: builds pass and secret names/values are absent from browser static assets. Server worker code may contain environment key names but never values.

- [ ] Run each built worker with an intentionally incomplete environment and confirm it fails closed with a safe missing-config code, not a stack containing environment values.

- [ ] Review checkpoint; do not commit.

## Task 9: Enforce Security Headers and Complete Security Regression Tests

**Files:**

- Modify: `src/proxy.ts`
- Modify: `src/server/security/headers.ts`
- Modify: `next.config.ts`
- Modify: `SECURITY.md`
- Create: `tests/security/no-signing-route.test.ts`
- Create: `tests/security/secret-boundary.test.ts`
- Create: `tests/security/csp.test.ts`

- [ ] Capture the exact official Privy OAuth/embedded-wallet origins used in staging. Update the explicit CSP source lists, run the onboarding E2E, then switch from report-only to enforced CSP before canary.

- [ ] Write regression tests that reject wildcards, `unsafe-eval`, untrusted frames/connect/script origins, missing HSTS/nosniff/frame/referrer/permissions headers, public caching of user data, cookie-only auth, and generic sign/send/relay routes.

- [ ] Scan source and route manifests to prove no route accepts fields named `calldata`, `transaction`, `serializedTransaction`, `privateKey`, `rpcUrl`, `programId`, or `contractAddress` for signing/execution.

- [ ] Run:

```bash
pnpm vitest run tests/security
pnpm exec playwright test --grep "onboarding"
pnpm build
```

Expected: all pass under enforced CSP.

- [ ] Review checkpoint; do not commit.

## Task 10: Run Production-Shaped Shadow, Failure Drills, and Independent Review

**Files:**

- Create: `docs/runbooks/shadow-soak.md`
- Create: `docs/runbooks/kill-switch-drill.md`
- Create: `docs/runbooks/canary.md`
- Create: `e2e/shadow-execution.spec.ts`
- Create: `e2e/one-leg-compensation.spec.ts`
- Create: `e2e/kill-switch.spec.ts`

- [ ] Write E2E tests for shadow `NO_TRADE`, shadow qualifying opportunity, injected matched fills, one-leg fill then bounded compensation/pause, compensation blocked then `UNHEDGED`, grant expiry/revoke, global kill switch, worker restart, lost submission response, and notification delivery.

- [ ] Deploy a txBet-owned staging stack with entry mode `shadow` and recovery-action mode `frozen`. Use real public feeds and development Privy wallets; new-entry signing/submission and every recovery signature/broadcast must be structurally disabled by their respective modes.

- [ ] Soak until the runbook's minimum evidence is collected: feed freshness, market revisions, opportunity hashes, zero duplicate wakeups, zero invalid links, worker restarts, job recovery, and safe notifications. Record counts and timestamps, not credentials/raw customer data.

- [ ] Run every cell of the typed user/global/strategy/data-source/settlement/venue-write/
  wallet-credential/recovery-freeze matrix. Verify entry-only switches do not silently
  strand an authorized cancellation, compromised write scopes cannot be used for any
  recovery mutation, source-dependent compensation/redemption fails closed, and read-only
  reconciliation/outbox continue.

- [ ] Run local full verification:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm test:workers
pnpm test:e2e
pnpm build
pnpm build:workers
pnpm audit --prod
pnpm verify
git diff --check
```

Expected: every command exits `0`.

- [ ] Request an independent read-only review of the complete diff, prioritized around auth/RLS, signer policies, secret boundaries, integer accounting, artifact validation, submit-once/idempotency, recovery, and compensation. Resolve every critical/high finding and add a regression test.

- [ ] Review checkpoint; do not commit.

## Task 11: Run the Genuine-Opportunity $10 Canary Gate

**Files:**

- Modify: `docs/runbooks/canary.md`
- Create: `docs/runbooks/canary-evidence-template.md`

- [ ] Confirm all prerequisites:

```text
txBet-specific production credentials and policies
funded embedded Polygon and Solana wallets
active <=7-day user grant
user and operator canary allowlists
effective mode canary
effective recovery action mode enabled and its emergency freeze drill passed
aggregate canary ceiling 10_000_000 micros
zero unresolved UNKNOWN, BOUNDED_RESIDUAL, UNHEDGED, INVALID
bundle uses only an independently promoted live venue; direct Polymarket BUY and DFlow are excluded
Polymarket complete-set inventory is finalized, exact, exclusively reserved, and current if the candidate lane is used
healthy feeds, RPCs, Privy, DB, workers, and outbox
independent review clear of critical/high issues
kill switches tested
```

- [ ] Wait for a genuine current verified World Cup opportunity satisfying equal depth, 1% return, $0.10 profit, all costs, and all risk gates. Do not lower thresholds or create a directional test.

- [ ] When one exists, independently confirm rule sources/revisions, wallet balances, artifacts, and canary exposure. Promote through the audited operator route; do not edit database mode directly.

- [ ] Reconcile both legs through authoritative final states. If residual exposure occurs, execute the bounded compensation protocol and retain the pause.

- [ ] Redeem or explicitly document any resulting position. Save only safe evidence hashes, IDs, timestamps, amounts, and state transitions in the canary evidence document.

- [ ] If no genuine opportunity appears, record that outcome honestly and leave the product at canary-ready shadow. Absence of a trade is not a failed implementation.

- [ ] Run `pnpm verify`, inspect health/unknown queues, and review `git status --short`. Do not commit or push.
