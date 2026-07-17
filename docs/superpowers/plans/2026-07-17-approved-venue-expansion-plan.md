# Approved Venue Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Certify and roll out Opinion, Predict.fun, Limitless, SX Bet, and Hydromancer in the approved order without weakening the phase-one execution boundary.

**Architecture:** A reusable certification harness enforces the same artifact, policy, submission, reconciliation, compensation, and operational contract for every venue. Each venue then follows its own detailed plan and receives a separate user grant scope and canary under the single global $10 ceiling.

**Tech Stack:** Existing txBet platform, venue-specific official APIs/SDKs, Privy, viem, Supabase, Vitest, Playwright, Railway.

## Global Constraints

- Execute the detailed venue plans strictly in this order:

  1. [Opinion](./2026-07-17-opinion-live-lane-plan.md)
  2. [Predict.fun](./2026-07-17-predict-fun-live-lane-plan.md)
  3. [Limitless](./2026-07-17-limitless-live-lane-plan.md)
  4. [SX Bet](./2026-07-17-sx-bet-live-lane-plan.md)
  5. [Hydromancer](./2026-07-17-hydromancer-live-lane-plan.md)

- Current official documentation wins over Predictefy and every prior baseline.
- Each venue is catalog/shadow-only until its official all-or-nothing entry semantics are proven.
- Each venue has a distinct policy ID/version, explicit user grant renewal/consent, spend ceiling, encrypted credential/account state, kill switch, and certification record.
- Canary exposure is `min(venue cap, remaining global $10 canary exposure)`; an operator cannot raise the global ceiling.
- Rain is excluded.
- Do not commit or push.

---

## Task 1: Create the Reusable Venue Certification Harness

**Files:**

- Create: `src/execution/venues/certification.ts`
- Create: `src/workers/market-data/venue-feed.ts`
- Create: `tests/execution/live-adapter-contract.ts`
- Create: `tests/execution/venue-certification.test.ts`
- Create: `docs/runbooks/venue-certification.md`

- [ ] Write failing shared tests for fixed host, runtime schemas, integer amounts, owner/funder, current rules/books/fees, gross ordered versus bounded net `VenueQuantity`, fee charge asset/atomic rounding, exact canonical net equality, actual balance-delta reconciliation, policy scope, artifact immutability, signature verification, simulation/preflight, fenced submit-once for entry/cancel/compensation/redemption, timeout-as-unknown, complete immutable order reconcile claims and one-field binding mutations, typed final/unknown network and setup costs on every reconciliation result, exactly-once reverted-transaction cost, fill reconciliation, cancel race, balance/position, compensation, redemption gate, redaction, and role isolation.
- [ ] Implement:

```ts
export function liveAdapterContract(
  name: string,
  fixture: LiveAdapterContractFixture,
): void;

export interface VenueMarketFeed {
  readonly venueId: LiveVenueId;
  refreshCatalog(signal: AbortSignal): Promise<readonly CatalogObservation[]>;
  refreshBooks(
    contractIds: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly BookObservation[]>;
  close(): Promise<void>;
}

export interface VenueEligibilityInspector {
  readonly venueId: LiveVenueId;
  inspect(
    input: Readonly<{
      profileId: string;
      walletId: string;
      venueAccountId: string;
      accountRevision: string;
      environmentRevision: string;
      scope: VenueEligibilityEvidence["scope"];
    }>,
    signal: AbortSignal,
  ): Promise<VenueEligibilityEvidence>;
}
```

- [ ] Require each feed fixture to prove cursor exhaustion, checkpoint resume, later-page discovery, dedupe, partial-scan behavior, and complete-scan tombstones.
- [ ] Require each adapter fixture to prove the second broadcast gate and durable per-leg `SUBMIT_STARTED` marker occur before submission.
- [ ] Require each venue whose entry can remain working to register a matching `LiveCancellationAdapter`
  and prove immutable prepare/validate/sign/simulate artifacts, full reconcile claims,
  fenced submit-once, late-fill precedence, typed zero/nonzero/unknown cost, and an atomic
  cumulative cancellation cost ceiling. Off-chain cancellation must still prove final
  zero cost rather than omitting the field. A terminal-on-submit venue may omit the
  adapter only with official evidence and tests proving it can never report working.
- [ ] Require each venue to implement the fixed eligibility inspector from current
  official semantics and prove profile/account isolation, expiry, denial, unknown/upstream
  outage, environment drift, exact contract/market-binding/action scope, refresh, and
  pre-I/O generation/fence CAS refusal of delayed or lease-lost responses, plus
  reservation/sign/broadcast/marker refusal. Venue-wide onboarding evidence must not
  authorize a market action, and one eligible contract must not authorize another. A venue
  without a current official eligibility signal remains shadow-only.
- [ ] Require each venue to prove its official fee asset and rounding semantics. The built
  gross order quantity may differ, but the pre-trade minimum and maximum net outcome over
  every permitted price improvement, maker/multi-level allocation, and rounding path must
  both equal the canonical hedge. Tests include price-dependent outcome fees and rounding
  boundaries. Actual net balance deltas must also equal that bound. If official evidence
  cannot prove equal bounds, certification returns `VENUE_NET_QUANTITY_UNPROVEN` and the
  lane remains shadow-only; post-fill compensation is not the proof. Every detailed venue
  plan inherits this contract without exception.
- [ ] Run `pnpm vitest run tests/execution/venue-certification.test.ts` and `pnpm typecheck`; both must pass.
- [ ] Document certification evidence and the exact shadow/canary promotion checklist.
- [ ] Review checkpoint; do not commit.

## Task 2: Execute and Certify Opinion

- [ ] Execute every checkbox in [the Opinion plan](./2026-07-17-opinion-live-lane-plan.md).
- [ ] Record official baseline hash, complete catalog scan ID, adapter suite result, user-consented policy version, shadow window, independent review, drill, and canary result in `docs/runbooks/venue-certification.md`.
- [ ] Confirm no unresolved Opinion `UNKNOWN`, `BOUNDED_RESIDUAL`, `UNHEDGED`, or `INVALID` record before moving on.
- [ ] Review checkpoint; do not commit.

## Task 3: Execute and Certify Predict.fun

- [ ] Execute every checkbox in [the Predict.fun plan](./2026-07-17-predict-fun-live-lane-plan.md).
- [ ] Record its independent official baseline, catalog, policy/consent, adapter, shadow, review, drill, and canary evidence.
- [ ] Confirm Predict.fun scope did not alter Opinion/phase-one policies or credentials.
- [ ] Review checkpoint; do not commit.

## Task 4: Execute and Certify Limitless

- [ ] Execute every checkbox in [the Limitless plan](./2026-07-17-limitless-live-lane-plan.md).
- [ ] Record independent official baseline, catalog, policy/consent, FOK/cancel, shadow, review, drill, and canary evidence.
- [ ] Confirm Limitless partner credentials remain execution-only and cannot authorize another venue.
- [ ] Review checkpoint; do not commit.

## Task 5: Execute and Certify SX Bet

- [ ] Execute every checkbox in [the SX Bet plan](./2026-07-17-sx-bet-live-lane-plan.md).
- [ ] Record independent metadata/domain, catalog, policy/consent, maker-fill/permit, shadow, review, drill, and canary evidence.
- [ ] Confirm no stale-odds widening or maker substitution exists.
- [ ] Review checkpoint; do not commit.

## Task 6: Execute and Certify Hydromancer

- [ ] Execute every checkbox in [the Hydromancer plan](./2026-07-17-hydromancer-live-lane-plan.md).
- [ ] Record independent Hydromancer plus official Hyperliquid HIP-4 baseline, catalog, policy/consent, exact-entry, shadow, review, drill, and canary evidence.
- [ ] Confirm no automatic bridge/rebalance or nonce replacement submission exists.
- [ ] Review checkpoint; do not commit.

## Task 7: Verify Cross-Venue Isolation and Rain Exclusion

**Files:**

- Modify: `docs/live-execution.md`
- Modify: `docs/world-cup-market-model.md`
- Create: `docs/runbooks/multi-venue-rollout.md`
- Create: `e2e/multi-venue-readiness.spec.ts`

- [ ] Write E2E tests for every venue's account, network/currency, policy/grant, funding/readiness, strategy scope, kill switch, contract evidence, and safe external links.
- [ ] Write isolation tests proving a venue cannot read another's encrypted credentials/artifacts, use its policy, spend its budget, consume its venue cap, or reset its kill switch.
- [ ] Verify execution considers only current certified venue pairs with exact settlement links and active user consent.
- [ ] Run:

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

- [ ] Prove Rain is absent:

```bash
rg -ni "rain" src package.json .env.example supabase deploy docs/live-execution.md docs/world-cup-market-model.md
```

Expected: no Rain adapter, key, dependency, route, UI control, migration, or deployment. A documentation sentence stating exclusion is acceptable.

- [ ] Request a final independent read-only multi-venue review and resolve all critical/high findings with regression tests.
- [ ] Review `git status --short`; do not commit or push.
