# World Cup Execution Kernel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the venue-neutral durable execution kernel that reserves risk, prepares both legs, signs and submits once, reconciles uncertainty, compensates bounded residual exposure, and pauses safely.

**Architecture:** Pure state-machine and hashing modules sit above append-only Postgres repositories. Venue adapters create typed prepared artifacts but cannot alter bundle state directly. The orchestrator persists both artifacts, runs one final gate, persists `SUBMITTING`, signs/simulates both legs, and dispatches both submissions concurrently. Every uncertain response enters durable reconciliation; submission is never blindly retried.

**Tech Stack:** TypeScript, Zod, canonical SHA-256 hashes, Supabase Postgres, `pg`, Vitest, fake-clock/fake-adapter contract tests, and Railway-compatible workers.

## Global Constraints

- Do not modify or repurpose `src/adapters/venue.ts` or `src/core/executor.ts`; they remain replay/demo-only.
- No adapter method may receive arbitrary user calldata, transaction bytes, destination, program, host, or spend.
- Network calls occur only outside database transactions.
- Both immutable prepared artifacts must exist before the final gate.
- Persist `SUBMITTING` before the first Privy, venue submit, or chain broadcast call that follows the final gate.
- Submission functions run at most once per attempt. A thrown timeout is `UNKNOWN`, not `REJECTED`.
- Reconciliation may poll safely; it may not rebuild or resubmit a possibly broadcast artifact.
- Any residual exposure pauses the user before compensation begins.
- Do not commit or push.

---

## Task 1: Lock Live Adapter, Artifact, Observation, and State Types

**Files:**

- Create: `src/execution/types.ts`
- Create: `src/execution/state-machine.ts`
- Create: `src/execution/artifact-hash.ts`
- Create: `tests/execution/state-machine.test.ts`
- Create: `tests/execution/artifact-hash.test.ts`

- [ ] Write failing table-driven tests for every legal and illegal bundle/leg/attempt transition, terminal-state immutability, canonical hash order, hash mutation sensitivity, malformed payload rejection, and version mismatch.

- [ ] Add acquisition-path invariants: `direct-buy` requires `orderSide=BUY` and
  `orderOutcome=desiredOutcome`; `complete-set-sell-complement` requires `orderSide=SELL`,
  the opposite outcome, and a current exact inventory lot/version/fence/evidence binding.
  Reconciliation reports retained desired shares, not the disposed complement, and every
  intent/artifact/hash mutation of these fields fails.

```ts
export type BundleState =
  | "DETECTED"
  | "RESERVED"
  | "PREPARING"
  | "PREPARED"
  | "SUBMITTING"
  | "RECONCILING"
  | "MATCHED"
  | "NO_TRADE"
  | "COMPENSATING"
  | "COMPENSATED"
  | "BOUNDED_RESIDUAL"
  | "UNHEDGED"
  | "INVALID";

export type AttemptState =
  | "PREPARING"
  | "PREPARED"
  | "SIGNING"
  | "SIGNED"
  | "SIMULATED"
  | "BROADCAST_READY"
  | "SUBMITTING"
  | "ACKED"
  | "UNKNOWN"
  | "UNFILLED"
  | "PARTIAL"
  | "FILLED"
  | "REJECTED";
```

- [ ] Define the master plan's `LiveVenueAdapter` and these artifact types:

```ts
export interface PreparedArtifact {
  schemaVersion: "prepared-artifact-v1";
  venue: LiveVenueId;
  artifactHash: string;
  payload: JsonValue;
  nativeSpendAtomic: AtomicAmount;
  expiresAt: number | null;
  locatorSeed: JsonValue;
}

export interface SignedArtifact extends PreparedArtifact {
  signedPayload: JsonValue;
  signerAddress: string;
  signedArtifactHash: string;
  locator: VenueLocator;
}

export type SubmitObservation =
  | { kind: "acked"; locator: VenueLocator; evidence: JsonValue }
  | { kind: "rejected"; code: string; retryable: false; evidence: JsonValue }
  | { kind: "unknown"; locator: VenueLocator | null; reason: string; evidence: JsonValue };

export interface ReconciledOrderBinding {
  contractVersionId: string;
  settlementSpecVersionId: string;
  desiredOutcome: "YES" | "NO";
  acquisitionPath: "direct-buy" | "complete-set-sell-complement";
  orderSide: "BUY" | "SELL";
  orderOutcome: "YES" | "NO";
  inventoryReservationRevision: string | null;
  signerAddress: string;
  venueAccountRevision: string;
  orderIntentHash: string;
  artifactHash: string;
  signedArtifactHash: string;
  submissionKey: string;
  bindingEvidenceHash: string;
}

export type ReconcileObservation =
  | {
      kind: "working";
      locator: VenueLocator;
      orderBinding: ReconciledOrderBinding;
      orderState: "working";
      actualGrossFilled: null;
      actualNetOutcome: null;
      remainingGrossQuantity: VenueQuantity;
      averagePriceMicros: null;
      actualFeeAssessment: null;
      balanceDeltaEvidenceHash: string;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    }
  | {
      kind: "unfilled" | "reverted";
      locator: VenueLocator;
      orderBinding: ReconciledOrderBinding;
      orderState: "terminal";
      actualGrossFilled: null;
      actualNetOutcome: null;
      remainingGrossQuantity: null;
      averagePriceMicros: null;
      actualFeeAssessment: null;
      balanceDeltaEvidenceHash: string;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    }
  | {
      kind: "unknown";
      locator: VenueLocator;
      orderBinding: ReconciledOrderBinding;
      orderState: "unknown";
      actualGrossFilled: null;
      actualNetOutcome: null;
      remainingGrossQuantity: VenueQuantity | null;
      averagePriceMicros: null;
      actualFeeAssessment: null;
      balanceDeltaEvidenceHash: string | null;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    }
  | {
      kind: "partial" | "filled";
      locator: VenueLocator;
      orderBinding: ReconciledOrderBinding;
      orderState: "working" | "terminal" | "unknown";
      actualGrossFilled: VenueQuantity;
      actualNetOutcome: VenueQuantity;
      remainingGrossQuantity: VenueQuantity | null;
      averagePriceMicros: Micros | null;
      actualFeeAssessment: LiveFeeAssessment;
      balanceDeltaEvidenceHash: string;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    };
```

`ReconcileObservation` distinguishes `working`, `unfilled`, `partial`, `filled`,
`reverted`, and `unknown`. Every nonzero cumulative fill has typed gross and actual net
quantities with scales, current working/terminal/unknown state, remaining gross amount,
fee assessment, balance-delta evidence, and typed network/setup execution cost. JSON
evidence is supplementary and never used instead of these correctness fields. A partial
fill may remain working; adapters may not collapse it to terminal merely because a cancel
was acknowledged.

Every branch carries `ReconciledOrderBinding`; the reducer compares it byte-for-byte to
the immutable claim before interpreting state, fill, fee, balance delta, or cost. Tests
mutate market/side/outcome/signer/account/intent/artifact/signed/submission fields for
working, zero-fill, partial, filled, reverted, and unknown responses.

For `ExecutionCostObservation.kind = final`, checked integer arithmetic proves
`totalCostMicros = networkCostMicros + setupCostMicros`. A positive total requires charged
asset/atomic amount, valuation-policy version, receipt, and finality evidence; a proven
zero still requires finality/evidence and uses numeric zero rather than a missing value.
`unknown` retains the operation's full authorized cost reservation and never releases or
realizes a guessed zero. Append-only cost-accounting events dedupe by operation attempt,
receipt/finality revision, and cost evidence hash, so a reverted on-chain transaction can
realize gas/priority/rent exactly once even when its fill is zero.

- [ ] Implement closed transition maps. `MATCHED`, `NO_TRADE`, `COMPENSATED`, and `BOUNDED_RESIDUAL` are terminal. `BOUNDED_RESIDUAL` preserves an exact known nonzero position and permanent user pause. `UNHEDGED` and `INVALID` are non-recoverable by normal orchestration; only an audited operator resolution may annotate them, never mutate their historical event.

- [ ] Hash canonical unsigned payload plus venue, spend, expiry, and locator seed. Hash the signed payload separately; never overwrite the prepared hash.

- [ ] Run:

```bash
pnpm vitest run tests/execution/state-machine.test.ts tests/execution/artifact-hash.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 2: Create the Append-Only Execution Ledger and Repository Contracts

**Files:**

- Create: `supabase/migrations/202607170004_execution_ledger_and_functions.sql`
- Create: `supabase/tests/database/006_execution_constraints_test.sql`
- Create: `supabase/tests/database/007_execution_append_only_test.sql`
- Create: `supabase/tests/database/008_risk_reservation_test.sql`
- Create: `supabase/tests/database/009_reconciliation_jobs_test.sql`
- Create: `src/execution/repositories/bundles.ts`
- Create: `src/execution/repositories/attempts.ts`
- Create: `src/execution/repositories/reservations.ts`
- Create: `src/execution/repositories/jobs.ts`
- Create: `src/execution/repositories/probe-jobs.ts`
- Create: `src/execution/repositories/positions.ts`
- Create: `tests/execution/repositories.test.ts`
- Create: `tests/execution/probe-job-repository.test.ts`

- [ ] Write failing pgTAP tests for two immutable legs per bundle, append-only attempts/fills/events/cost events, unique stable entry and recovery semantic scopes, attempt keys, submission keys, and `(venue_id, venue_reference)`, two workers with distinct proposed bundle or recovery-intent UUIDs racing the same semantics, cancellation workers racing **different** reason/expiry/policy semantic scopes for one immutable order subject, `UNKNOWN` cancellation blocking every other subject scope/ordinal, optimistic bundle versions, profile-scoped probe jobs, reservation expiry only before any submit-start marker, rolling spend, one active compensation per residual, cumulative compensation loss including reverted-chain costs, exactly-once receipt/finality cost accounting, and concurrent `SKIP LOCKED` claims.

- [ ] Create:

```text
execution_bundles
execution_legs
operation_attempts
execution_attempts
execution_artifacts
execution_events
cancellation_intents
cancellation_operation_subjects
cancellation_attempts
cancellation_budgets
execution_operation_claims
fills
execution_cost_events
risk_reservations
risk_exposures
platform_risk_state
venue_inventory_lots
venue_inventory_reservations
positions
balance_snapshots
reconciliation_jobs
compensation_intents
compensation_budgets
compensation_attempts
redemption_intents
redemption_attempts
redemption_budgets
```

Use UUID public IDs, bigint microdollars, canonical decimal strings for atomic amounts, check constraints, indexed foreign keys, and JSONB only for schema-versioned validated evidence. `operation_attempts` is the shared parent for `entry`, `cancel`, `compensation`, and `redemption`; each specialized row has a one-to-one foreign key to it. A deferred constraint trigger requires exactly one child table matching `operation_kind`.

`cancellation_intents` has an immutable foreign key to the original operation attempt,
the original order revision, its cancellation operation subject, semantic scope/hash, and
subject-scoped budget; uniqueness covers the semantic scope/hash without granting it a
separate active sequence. `cancellation_operation_subjects` is unique on
`(profile_id, original_attempt_id, original_order_revision)`, holds the optimistic subject
version and nullable active operation-attempt foreign key, and is mutated only by the
security-definer materialization/marker/terminal functions. Partial uniqueness plus locked
subject-row checks permit at most one nonterminal cancellation across all semantic scopes;
an `UNKNOWN` active attempt cannot be cleared or superseded.

- [ ] Enforce exactly two legs and opposite outcomes with a deferred constraint trigger checked at transaction commit. Store the bundle's reduced canonical **net** share numerator/denominator and each leg's fixed gross order plus minimum/maximum net venue atomic amount, scale, net-bound/fee-schedule hashes, and conversion-evidence hashes. The trigger proves both minimum and maximum net leg rationals equal the canonical quantity by integer cross-multiplication; gross/raw atomic amounts need not match. Once a bundle leaves `DETECTED`, its opportunity hash, profile, legs, contract revisions, canonical/per-leg quantities and bounds, fee/net-bound evidence, and cost authorization fields are immutable.

- [ ] Store prepared and signed payloads only as `EncryptedEnvelopeV1` rows in `execution_artifacts`, with artifact kind/hash, required `operation_attempt_id`, key version, expiry, and AAD binding to profile, operation kind/scope, specialized subject revision, and attempt. Entry children additionally bind bundle/leg; compensation binds residual/intent; cancellation binds original attempt/intent; redemption binds position/intent. Grant table/column access only to `txbet_execution_worker`; web and market-data roles can read hash/status projections but never ciphertext. Add pgTAP for parent/child mismatch, orphan/cross-profile/cross-operation attachment, AAD/version constraints, unique artifact kind per attempt, RLS/grants, and response redaction. No API, log, audit event, metric, notification, or outbox payload may contain artifact ciphertext or plaintext.

- [ ] Add append-only triggers to attempts, events, fills, execution-cost events, and balance snapshots. `execution_cost_events` binds one operation attempt to a typed final or reserved-unknown observation, charged asset/value-policy provenance, receipt/finality revision, and evidence hash. A unique final receipt/finality/evidence tuple is realized at most once; unknown observations only retain the full reserved bound. State and accounting projections update only through security-definer transition functions that validate allowed transitions and expected versions.

- [ ] `venue_inventory_lots` stores only finalized venue-native inventory with exact asset,
  atomic quantity/scale, contract/condition revision, account revision, acquisition/finality
  evidence, realized cost, and optimistic version. `venue_inventory_reservations` binds a
  lot/version/fence and exact quantity to one bundle/leg. The reservation function permits
  no over-allocation, cross-profile/account/contract use, stale or forked finality, or reuse
  while an unknown attempt owns the fence. Release requires proof that no mutation started
  or authoritative unchanged balances after a killed/unfilled attempt. The current DFlow
  baseline creates no profile-probe job or executable quote table.

- [ ] Implement repository boundaries that never expose raw SQL rows:

```ts
export interface ExecutionRepository {
  reserveAndCreateBundle(input: ReserveAndCreateInput): Promise<{
    reservation: RiskReservation;
    bundle: ExecutionBundle;
  }>;
  transition(input: BundleTransitionInput): Promise<ExecutionBundle>;
  persistPreparedPair(input: PreparedPairInput): Promise<ExecutionBundle>;
  persistSignedPair(input: SignedPairInput): Promise<ExecutionBundle>;
  markSubmitting(input: MarkSubmittingInput): Promise<ExecutionBundle>;
  claimOperation(input: ClaimExecutionOperationInput): Promise<ExecutionOperationClaim>;
  markSubmitStartedPair(input: SubmitStartedPairInput): Promise<{
    bundle: ExecutionBundle;
    startedByThisClaim: boolean;
  }>;
  markCancelStarted(input: CancelStartedInput): Promise<{
    attempt: CancellationAttempt;
    startedByThisClaim: boolean;
  }>;
  markCompensationStarted(input: CompensationStartedInput): Promise<{
    attempt: CompensationAttempt;
    startedByThisClaim: boolean;
  }>;
  markRedemptionStarted(input: RedemptionStartedInput): Promise<{
    attempt: RedemptionAttempt;
    startedByThisClaim: boolean;
  }>;
  appendObservation(input: AttemptObservationInput): Promise<void>;
}
```

`markCancelStarted` returns the same `startedByThisClaim` discriminator as the methods
above. `execution_operation_claims` uses a stable `scope_kind` (`bundle`, `residual`,
`attempt`, or `position`), `scope_key`, operation kind, database-time lease, and a
monotonically increasing fence token. Every state-changing repository call after claim
checks owner, unexpired lease, and fence. Lease expiry before any submit/cancel/recovery
start marker permits a new claim; once a marker exists, every new/current claim for that
operation attempt is reconciliation-only forever.

`cancellation_attempts`, `compensation_attempts`, and `redemption_attempts` are append-only attempt/observation
roots with stable scope, ordinal, artifact/submission keys, marker time, locator, state,
and unique venue receipt/signature. Only one active ordinal exists per intent. In addition,
`cancellation_operation_subjects` provides one versioned active/mutation sequence for the
immutable profile/original-attempt/order-revision subject across every semantic intent and
scope. Materialization and marker CAS lock that subject row; a concurrent or `UNKNOWN`
cancellation blocks every other reason/expiry/policy scope. An authoritative
revert/no-broadcast may open the next bounded ordinal; `UNKNOWN` may not.
`cancellation_budgets` and `redemption_budgets` atomically track cumulative authorized,
reserved, and realized total execution cost across every ordinal **and every semantic
scope for the same immutable original-attempt/order revision or profile/venue/position
revision subject**. Unknown cost remains reserved; no next ordinal may exceed the current
audited subject authorization. A ceiling increase uses recent explicit user authorization,
append-only audit, and CAS while carrying prior counters; semantic/expiry/policy refreshes
cannot create a new budget. Race tests vary semantics and UUIDs and still get one budget.

Entry, cancellation, compensation, and redemption orchestrators all use
`claimOperation` plus a fenced marker CAS. Pre-marker signing is allowed only under the
active fence after a durable `SIGN_REQUESTED` event binds the immutable artifact hash and
stable signing-request key. A crash may re-sign only that identical non-broadcast payload
when no encrypted signed artifact exists; use provider idempotency where officially
supported and reject any message drift. Only `startedByThisClaim === true` may make the
irreversible submit/broadcast/cancel mutation. An existing mutation marker, stale fence,
lease loss, or false CAS result makes zero irreversible external calls and enters reconciliation. Concurrency tests
run two workers for every operation kind, expire leases before/after the marker, inject a
crash, and assert aggregate external mutation call count is exactly one.

Every marker CAS also rechecks the current effective action mode, fixed grant/policy and
venue certification, the master/spec's typed action-by-switch matrix, persisted gate version tokens, and its subject
revision (entry bundle, original attempt, residual/budget, or position/resolution). A
concurrent revoke/freeze/demotion/version change between gate and marker returns false and
makes zero external calls. Tests cover every matrix cell: entry-only pauses do not strand
otherwise authorized risk reduction; untrusted market data cannot price compensation;
invalid settlement still permits cancellation; and an affected venue/wallet/write-path
compromise blocks every mutation through that scope while read-only reconciliation and an
independently certified cross-venue hedge remain separately evaluable.

- [ ] Add a unique constraint on `(profile_id, strategy_id, opportunity_id)` and a unique `entry_scope_key`. Derive that key from the same stable scope plus `bundle_hash`; never include a caller-generated bundle UUID. Implement `reserve_and_create_bundle(...)` as one idempotent SQL function/transaction. It locks/looks up the stable entry scope first, performs every risk/global/concentration check, creates one reservation, bundle, and exactly two immutable legs, and returns the existing matching result when another worker won. A scope match with a different bundle hash is an invariant error. Add crash/concurrency tests proving two distinct proposed bundle UUIDs cannot create duplicate reservations/bundles.

- [ ] Repository methods run one short transaction each. They accept no adapter/upstream client and never perform network I/O.

- [ ] Reset and test:

```bash
pnpm db:reset
pnpm test:db
pnpm vitest run tests/execution/repositories.test.ts tests/execution/probe-job-repository.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 3: Enforce Atomic Risk Reservation and Execution-Mode Policy

**Files:**

- Create: `src/execution/risk.ts`
- Create: `src/execution/idempotency.ts`
- Create: `tests/execution/risk.test.ts`
- Create: `tests/execution/idempotency.test.ts`
- Modify: `supabase/tests/database/008_risk_reservation_test.sql`

- [ ] Write failing tests for every user/platform limit, concurrent reservations, a two-user race for the last global canary capacity, expired reservations, rolling 24-hour boundary, strategy/total capital, per-contract/per-fixture/per-team/per-venue/aggregate exposure, outstanding exposure, finalized inventory exactness, concurrent reuse/over-allocation, stale inventory revision/finality, disabled/shadow/canary/live entry modes, enabled/frozen recovery-action modes, canary allowlist, $10 aggregate canary cap, duplicate opportunity, and deterministic idempotency keys.

- [ ] Add an atomic Postgres reservation function that locks current `operator_state` and fresh `runtime_control_state` before risk rows, checks current database time, active grant, user/global/venue/contract kill switches, current opportunity, balances/reservations, rolling confirmed+pending spend, and effective entry/recovery modes. Canary/live entry is impossible unless effective recovery mode is enabled and healthy; stale/frozen recovery rejects reservation.

```ts
export interface ReserveExecutionInput {
  profileId: string;
  strategyId: string;
  opportunityId: string;
  bundleHash: string;
  notionalMicros: Micros;
  expectedProfitMicros: Micros;
  expectedReturnBps: number;
  exposureKeys: {
    contractIds: readonly [string, string];
    fixtureId: string | null;
    teamIds: readonly string[];
    venueIds: readonly [LiveVenueId, LiveVenueId];
  };
  inventoryClaims: readonly {
    venue: LiveVenueId;
    legIndex: 0 | 1;
    lotId: string;
    expectedLotVersion: number;
    quantity: VenueQuantity;
    evidenceHash: string;
  }[];
  entryScopeKey: string;
}
```

`exposureKeys` and inventory claims are derived from the persisted opportunity, acquisition
evidence, and settlement specs inside the worker/repository boundary, never from a public
API. The SQL function locks in this fixed order: singleton `platform_risk_state`, profile
`risk_state`, `risk_exposures` rows in deterministic `(dimension, dimension_key)` order,
then inventory lots in deterministic `(venue, lot_id)` order. This serializes the global
$10 canary budget and complete-set ownership across users, prevents deadlocks, and enforces
risk plus exact inventory exclusivity under concurrency.

Reservation commit, release, fill, compensation, and position-close functions use the same lock order and update the global/profile/dimension counters atomically. A worker crash cannot leak or double-release canary capacity. The expiry-reclaim function may release only a bundle for which no attempt has ever reached a submit/mutation-start marker and the bundle is still before submission. A deterministic pre-submit locator or signed-abort artifact remains immutable audit evidence and does not block release. Once either leg has a submit-start marker, expiry only enqueues reconciliation; capacity remains reserved until authoritative no-trade or terminal accounting.

The SQL function also enforces platform values directly, not only through TypeScript:

```text
each venue order <= 100_000_000 micros
total two-leg bundle cost <= 100_000_000 micros
rolling 24 hours <= 1_000_000_000 micros
net return >= 100 bps
net profit >= 100_000 micros
canary aggregate exposure <= 10_000_000 micros
```

- [ ] `shadow` may persist entry decisions but the reservation function returns a non-executable shadow result. `disabled` rejects new entries. `canary` requires both user and operator allowlists. `live` still requires the user's active grant. Entry mode never authorizes recovery actions. Cancellation, compensation, and redemption use separate persisted-intent functions that require `recovery_action_mode = enabled`, a pre-existing attempt/position, the current fixed grant/policy, and their own loss/position bounds. `frozen` rejects every new recovery signature/broadcast but leaves reconciliation readable.

- [ ] Derive three non-circular key layers and reject caller-supplied free-form keys at public APIs:

  - `bundleScopeKey = H(canonicalJson(["entry-bundle-scope-v1", profileId, strategyId, opportunityId, bundleHash]))` before bundle creation;
  - `legScopeKey = H(canonicalJson(["entry-leg-scope-v1", bundleScopeKey, legIndex]))` for integer leg `0 | 1`;
  - `attemptKey = H(canonicalJson(["operation-attempt-key-v1", "entry", legScopeKey, attemptOrdinal]))` before artifact construction and use it for venue client IDs;
  - `submissionKey = H(canonicalJson(["operation-submission-key-v1", attemptKey, artifactHash]))` after validation and before signing/submission.

  Unique constraints cover each layer. `legIndex` appears only in `legScopeKey`. Use one
  shared SQL/TypeScript byte-derivation helper from both repositories and orchestrators,
  with known-answer tests pinning canonical UTF-8 bytes plus all hashes for entry and each
  recovery operation kind. Mutation tests alter every tuple component. Neither `attemptKey` nor any artifact
  field depends on `artifactHash`; a random bundle/leg UUID is never the root of entry
  deduplication.

- [ ] Run:

```bash
pnpm test:db
pnpm vitest run tests/execution/risk.test.ts tests/execution/idempotency.test.ts
```

Expected: all pass, including concurrent SQL sessions where only one reservation wins.

- [ ] Review checkpoint; do not commit.

## Task 4: Build Signing and Broadcast Gates from Fresh, Bound Evidence

**Files:**

- Create: `src/execution/final-gate.ts`
- Create: `src/execution/fees/types.ts`
- Create: `src/execution/fees/policy.ts`
- Create: `src/execution/fees/evm.ts`
- Create: `src/execution/fees/polygon.ts`
- Create: `src/execution/fees/solana.ts`
- Create: `src/execution/fees/hydromancer.ts`
- Create: `tests/execution/final-gate.test.ts`
- Create: `tests/execution/fees/policy.test.ts`
- Create: `tests/execution/fees/evm.test.ts`
- Create: `tests/execution/fees/polygon.test.ts`
- Create: `tests/execution/fees/solana.test.ts`
- Create: `tests/execution/fees/hydromancer.test.ts`

- [ ] Write failing tests for grant expiry/revocation, unexpected superseded wallet authority, wallet ownership drift, policy mismatch, missing/expired/drifted venue certification, kill switches, risk-version drift, balance decline, allowance decline, gas reserve, changed contract/rule/link/book/fee/close-time/payout-asset/value-policy revision or evidence, stale/chain-expired quote, reduced canonical equal depth or scale-conversion mismatch, missing/stale/reused inventory lot or reservation fence, changed complete-set balances/finality/cost evidence, close buffer, minimum profit, venue/RPC/database/clock health, and artifact expiry.

- [ ] Write fee tests for Polygon/BSC/Base/SX Network EIP-1559 or officially required legacy gas estimation, Solana base/priority/rent estimation, Hydromancer action/builder/trading cost evidence, native-unit overflow, expired per-network USD upper-bound policy, missing RPC/API data, fee spike, setup action, and conservative fallback.

```ts
export interface NetworkCostPolicy {
  version: string;
  chain:
    | "polygon"
    | "solana"
    | "bsc"
    | "base"
    | "sx-network"
    | "hydromancer";
  estimator: "evm" | "solana-message" | "hydromancer-action";
  nativeUsdUpperBoundMicros: Micros;
  safetyBufferBps: number;
  validUntil: number;
}

export interface NetworkCostEstimate {
  policyVersion: string;
  nativeAtomic: AtomicAmount;
  priorityAtomic: AtomicAmount;
  rentAtomic: AtomicAmount;
  setupCostMicros: Micros;
  totalCostMicros: Micros;
  observedAt: number;
  expiresAt: number;
  evidenceHash: string;
}
```

Polygon, BSC, Base, and SX Network use the shared EVM estimator with the exact prepared
transaction, verified chain ID, `eth_estimateGas`, and the current officially supported
EIP-1559 or legacy fee fields. Solana uses the prepared message, `getFeeForMessage`,
recent prioritization fees, and required rent. Hydromancer uses the exact prepared action
plus current official builder, trading, account-action, and network-cost evidence; an
unknown cost component blocks execution. Convert chain-native costs with a versioned
per-network conservative native/USD upper bound whose expiry is audited. Missing/expired
policy or incomplete RPC/API evidence fails closed; never substitute zero.

```ts
export interface FinalGateDependencies {
  clock: Clock;
  authorizations: ExecutionAuthorizationReader;
  market: CurrentMarketEvidenceReader;
  balances: BalanceReader;
  eligibility: VenueEligibilityReader;
  health: ExecutionHealthReader;
  risk: RiskReservationReader;
  inventory: VenueInventoryReader;
}

export type FinalGateResult =
  | { ok: true; evidence: FinalGateEvidence }
  | { ok: false; reasons: readonly FinalGateReason[]; evidence: FinalGateEvidence };
```

- [ ] Gather upstream observations outside a transaction with strict timeouts and exact host clients. Every observation carries `observedAt`, source revision, and safe evidence hash. Eligibility must be fresh and `eligible` for the exact profile/wallet/account/venue/environment plus market/action scope at reservation, signing gate, broadcast gate, and marker CAS. The reader follows the exact complete-tuple/scope `venue_eligibility_current` pointer, then validates that pointed row's status/expiry; it never selects, sorts, or falls back across evidence rows. Scope drift, stale, denied, unknown, or unavailable fails closed.

- [ ] Run a signing gate against the same opportunity/bundle/artifact hashes. Then use one short database transition to re-lock the reservation, confirm current persisted versions, store the gate evidence, and either mark the bundle `SUBMITTING`/attempts `SIGNING` or release it to `NO_TRADE`.

- [ ] After both signatures and simulations succeed, collect a second broadcast-gate snapshot immediately before dispatch. Recheck grant/policy, every kill switch, balance/reservation, any exact inventory lot/version/fence and both complete-set balances, contract/link/book/fee/close-time/payout-asset/value-policy revisions, quote wall-clock and optional chain-height validity, exact canonical shares plus both per-leg scale conversions, conservative payout/profit, artifact expiry, venue/RPC health, and database version. Persist `BROADCAST_READY` for both attempts in one short transaction. Any failure proves no broadcast occurred, records signed-abort `NO_TRADE`, and releases only through the pre-submit release function.

- [ ] Treat any unavailable or ambiguous source as a failed gate. Do not reuse evidence older than its source-specific maximum age.

- [ ] Run:

```bash
pnpm vitest run tests/execution/final-gate.test.ts tests/execution/risk.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 5: Prepare Both Legs and Submit Each Exactly Once

**Files:**

- Create: `src/execution/orchestrator.ts`
- Create: `src/execution/timeouts.ts`
- Create: `tests/execution/orchestrator.test.ts`

- [ ] Write failing tests that prove:

  - reservation precedes preparation;
  - both `prepare` and `validate` complete before either artifact is persisted as a pair;
  - both immutable hashes exist before the final gate;
  - `SUBMITTING` persists before any `sign` call;
  - both signing results and simulations succeed before either `submitOnce` call;
  - both encrypted signed artifacts and deterministic locators persist before broadcast authorization;
  - pre-submit locators contain `createdAt` but no claimed submission time, including signed-abort/crash paths;
  - both per-leg `SUBMIT_STARTED` markers persist in one transaction before either network submission starts;
  - a crash after the marker transaction reconciles both legs and submits neither again;
  - submissions start concurrently within the configured skew;
  - each `submitOnce` is invoked at most once;
  - two orchestrators racing the same existing bundle obtain different fences but only the active marker-CAS winner dispatches, with aggregate submit count one per leg;
  - lease loss/expiry before the marker aborts dispatch and permits a fenced takeover, while expiry after the marker permits reconciliation only;
  - a throw/timeout becomes `unknown` and schedules reconciliation;
  - one rejection plus one unknown never becomes `NO_TRADE`;
  - cancellation/release happens safely when nothing was submitted.

```ts
export interface ExecuteBundleDependencies {
  adapters: ReadonlyMap<LiveVenueId, LiveVenueAdapter>;
  execution: ExecutionRepository;
  gate: FinalGateService;
  reconciliation: ReconciliationJobRepository;
  clock: Clock;
}

export function executeBundle(
  input: ExecuteBundleInput,
  dependencies: ExecuteBundleDependencies,
): Promise<ExecuteBundleResult>;
```

- [ ] Implement this order:

  1. call `reserveAndCreateBundle` to atomically reserve/create or return the stable existing bundle, then obtain a DB-time leased monotonic execution claim;
  2. prepare/validate both unsigned artifacts without broadcast;
  3. persist the prepared pair in one transaction;
  4. collect and evaluate fresh final-gate evidence;
  5. persist `SUBMITTING` plus attempt `SIGNING` before the next network call;
  6. sign both, verify signed hashes/locators, and persist both encrypted signed artifacts in one transaction;
  7. simulate/preflight both and persist observations;
  8. run and persist the second immediate broadcast gate for both legs;
  9. with the active fence, CAS one transaction that re-locks operator/runtime controls, grant/policy/certification, kill switches, reservation, and every persisted version token captured by the broadcast gate; only if all remain identical/current does it append `SUBMIT_STARTED` for each leg, persist both deterministic locators, mark both attempts `SUBMITTING`, and return `startedByThisClaim`;
  10. only when `startedByThisClaim === true` and the same fence is still owned, start both `submitOnce` promises without awaiting either first; every false/existing-marker/lease-loss result enqueues reconciliation and makes zero submit calls;
  11. persist every result/throw and enqueue reconciliation;
  12. return only the durable bundle projection.

- [ ] Use bounded `AbortSignal` timeouts. An abort never proves no submission. Do not call `submitOnce` again after an abort. Recovery reconciles every attempt with a `SUBMIT_STARTED` marker and never submits it, even if a crash occurred after the marker transaction but before the actual network call.

- [ ] Add deterministic fake-database concurrency tests with two orchestrators and a real
  Postgres integration race covering claim, preparation, lease expiry, marker CAS, crash
  before/after marker, takeover, and concurrent operator demotion, recovery freeze, grant
  revoke, policy/certification drift, or kill-switch activation between broadcast gate and
  marker. Any drift returns false and makes zero submit calls. Assert aggregate external
  submit calls equal exactly one per leg in every permitted interleaving.

- [ ] Measure submit start skew with the injected monotonic clock and emit a safe metric; do not weaken correctness based on skew.

- [ ] Run:

```bash
pnpm vitest run tests/execution/orchestrator.test.ts tests/execution/state-machine.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 6: Reconcile Authoritative Fills Without Blind Retry

**Files:**

- Create: `src/execution/reconciler.ts`
- Create: `src/execution/fills.ts`
- Create: `src/execution/cancellation.ts`
- Create: `tests/execution/reconciler.test.ts`
- Create: `tests/execution/fills.test.ts`
- Create: `tests/execution/cancellation.test.ts`

- [ ] Write failing tests for acknowledged working orders, unknown locators, REST/RPC read errors, duplicate observations, cross-scale gross/net fill normalization, outcome-fee balance delta, partial-working versus partial-terminal, equal partial fills while still working, equal terminal reduced fills, unequal terminal fills, fills after timeout, reverts, durable cancellation semantic intent/artifact/sign/simulate/start/reconcile claim, crash immediately before/after cancel, cancel timeout/ack followed by late fill, no blind cancel retry, cumulative cancellation cost ceiling, authoritative no-fill after expiry/cancel, and conflicting venue evidence.
- [ ] Add cost cases for proven-zero off-chain rejection, nonzero on-chain revert, unknown receipt retaining the full bound, late finality replacing only the held reservation, duplicate receipt/finality observations, and exactly-once realized cost for entry and cancellation.

- [ ] Implement reconciliation as an idempotent reducer:

```ts
export function reconcileBundle(
  claim: ReconciliationClaim,
  dependencies: ReconcilerDependencies,
): Promise<ReconciliationResult>;
```

`ReconcilerDependencies` contains separate fixed registries for `LiveVenueAdapter` and
`LiveCancellationAdapter`. A venue that can remain working cannot activate entry unless
both are registered and share the same certification/build/policy baseline. A missing
cancellation adapter is valid only when the same certification proves terminal-on-submit
and its adapter contract tests make a working observation impossible.

For each leg, load and schema-validate the complete immutable `OrderReconcileClaim`, then
call `adapter.reconcile(context, claim)`; never pass a bare locator or call entry
`prepare`, `sign`, or `submitOnce`. When a confirmed working order must be canceled, build an immutable
`CancellationIntentSemantics` projection with no new UUID/key/hash fields. In one short
transaction lock the immutable cancellation subject, derive its semantic hash/scope/attempt
key, materialize or return the single subject-authorized `CancellationIntent` and
parent/specialized attempt, and reserve its maximum total cost against the subject's
cumulative budget. Use the registered `LiveCancellationAdapter` to
prepare, validate, persist, sign, simulate, pass the action-specific gate, and persist
`CANCEL_STARTED` through the fenced marker CAS. Call cancellation `submitOnce` at most once
outside the transaction and only for the winning marker claim. A timeout/throw is
`UNKNOWN`, never success and never permission to issue a new cancel. Recovery passes the
complete immutable `CancellationReconcileClaim` to the cancellation adapter, accounts its
typed cost, and separately reconciles original order/fills until authoritative
no-working/no-fill or fill evidence exists.

Every cancellation/redemption observation branch returns a typed binding echo. Reducers
byte-compare signed-artifact, historical signer/authorization principal, venue-account,
operation-attempt, immutable subject/version, and subject-budget version/authorization
bindings before any state, payout, or cost mutation. Shared and venue contract tests mutate
each binding independently on pending, unknown, reverted, and succeeded observations.

- [ ] Normalize venue observations into append-only fills. A unique venue fill/trade/signature cannot attach to two attempts. Conflicting data records `INVALID`, activates kill switches, and preserves both evidence hashes.

- [ ] Cancellation semantic fields bind profile, original attempt key/order revision,
  locator, fixed reason, and deterministic expiry. Derive the semantic hash, operation
  scope, and ordinal attempt key exactly as locked in the master plan; no cancellation UUID
  or final record hash is an input. Unique constraints cover semantic scope, original
  attempt, ordinal, and key. A separate unique/versioned cancellation-subject row covers
  profile + original attempt + order revision across all semantic scopes. Race different
  proposed UUIDs **and differing reason/expiry/policy semantics** and require one active
  subject sequence and one marker winner. Persist
  request/response/unknown observations append-only. A cancel acknowledgment alone never
  proves no fill, and a late fill always wins over a prior cancel response. A later ordinal
  requires authoritative revert/no-broadcast plus remaining cumulative cancellation cost;
  unknown never retries or releases its bound.

- [ ] Terminal rules use cumulative **actual net** canonical shares and authoritative order state:

  - both orders terminal/no-working and both actual net fills equal the authorized canonical size -> full `MATCHED`;
  - both orders terminal/no-working and both actual net fills are the same smaller positive size -> `MATCHED` with immutable `match_kind = REDUCED`, exact matched shares/realized costs, and release of unused reservation;
  - both authoritative no-fill and no working order -> `NO_TRADE`;
  - unequal known fills while any original order is working/unknown/cancel-unknown -> pause user, preserve worst-case reservation, stay `RECONCILING`, and cancel/poll; do not freeze a residual or compensate yet;
  - only after every original order is authoritatively terminal/no-working may unequal actual net fills freeze an immutable residual revision and enter `COMPENSATING`;
  - equal partial fills while either order remains working are not terminal; cancel/poll because a late uneven fill can still occur;
  - remaining uncertainty -> stay `RECONCILING` and renew/requeue with bounded backoff;
  - invariant conflict -> `INVALID`.

- [ ] Run:

```bash
pnpm vitest run tests/execution/reconciler.test.ts tests/execution/fills.test.ts tests/execution/cancellation.test.ts
pnpm test:db
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 7: Compensate Within the Approved Loss and Pause Otherwise

**Files:**

- Create: `src/execution/compensation.ts`
- Create: `src/execution/residual.ts`
- Create: `tests/execution/compensation.test.ts`
- Create: `tests/execution/residual.test.ts`

- [ ] Write failing tests for each residual polarity, refusal while any original order is working/unknown/cancel-unknown, cancel ACK followed by late fill, immutable residual creation only after all original orders are terminal, same-venue unwind, cross-venue hedge, insufficient depth, stale quote, user loss limit, 5% platform limit, $5 platform limit, compensation timeout, partial compensation, and no legal unwind.

- [ ] `ResidualExposure` is created once from authoritative terminal original-order and
  actual net balance-delta evidence. Compensation refuses a mutable/provisional residual
  or any bundle with a working/unknown original order. It binds the residual revision and
  rechecks it before the recovery marker CAS so a late original fill cannot be over-hedged.

- [ ] Calculate the maximum authorized emergency loss as:

```ts
const userRelativeLimit = mulDivFloorMicros(
  bundleNotionalMicros,
  userEmergencyLossBps,
  10_000,
);
const platformLimit = Math.min(
  mulDivFloorMicros(bundleNotionalMicros, 500, 10_000),
  5_000_000,
);
const allowedLossMicros = Math.min(
  userEmergencyLossMicros,
  userRelativeLimit,
  platformLimit,
);
```

`mulDivFloorMicros` is the checked bigint helper from `src/core/live-money.ts`; tests
prove multiplication cannot overflow and conversion back to `Micros` occurs only after a
safe-integer check. No floating multiplication or `Math.floor` authorizes loss.

- [ ] Pause new user execution before fetching compensation quotes. Create one immutable `compensation_budgets` authorization per bundle with mutable locked counters `reserved_loss_micros` and `realized_loss_micros`. Select the deterministic lowest-loss action that restores a flat or explicitly bounded position and whose cumulative realized plus reserved loss remains within `allowedLossMicros`.

- [ ] Implement `reserve_compensation_intent(...)` as one idempotent SQL/CAS transaction.
  It locks the residual, budget, position, and operation scope in fixed order; verifies
  residual/budget/quote/fee/network versions and no working original order; hashes the
  selected `CompensationIntentSemantics`, derives its scope/attempt key, assigns only the
  winning random compensation UUID, creates the immutable materialized intent plus
  parent/specialized attempt, and increments reserved worst-case price loss, fees,
  setup/network cost, and buffers. It returns an existing matching semantic scope to a
  racing planner. A failure/crash before commit leaves neither budget reservation nor
  intent/attempt; after commit all exist. Test concurrent planners proposing distinct UUIDs
  for identical semantics and crash boundaries on both sides of commit.

- [ ] Ask only the venue's registered `LiveCompensationPlanner` for complete bounded `CompensationIntentSemantics` candidates, select deterministically, and atomically materialize the selected intent/semantic hash/scope/key/record hash before preparation. The semantics bind residual revision, target contract/side/outcome, canonical and venue quantity/scale, limit/max spend, quote/book/fee/asset/network revisions, expiry, budget version, incremental worst-case loss, and cumulative ceiling. Execute `intent.semantics.action` through the normal adapter prepare/validate/sign/simulate/broadcast-gate/submit-once/reconcile contract with `CompensationExecutionContext`. It gets distinct attempt/submission keys and never mutates original legs.

- [ ] Reconciliation converts each attempt's reserved loss to exact realized loss and releases only its unused portion. A retry or alternate venue consumes the same bundle-level budget; no code path recomputes or resets it. Database checks reject cumulative realized plus reserved loss above `allowedLossMicros`.
- [ ] A zero-fill or reverted compensation still realizes its final network/setup cost exactly once. An unknown cost keeps its complete reserved component. Only a typed final cost observation may convert or release that component, and the next bounded compensation ordinal sees the same bundle-level realized-plus-reserved total.

- [ ] When the compensation fill authoritatively flattens the residual, persist the resulting zero position, settle/release the reservation, append the compensation evidence, and transition the bundle to terminal `COMPENSATED`. The user's automation remains paused until the guarded reset prerequisites pass.

- [ ] When a legal compensation fill completes within budget but leaves an authoritatively known nonzero bounded position and no lower-loss permitted action remains, persist the exact atomic position, maximum loss, cumulative realized cost, and remaining budget; settle the original reservation into position accounting and transition to terminal `BOUNDED_RESIDUAL`. Keep the user paused and expose the manual venue URL. Never call this state `COMPENSATED`.

- [ ] If no legal compensation exists, preserve the position, transition to `UNHEDGED`, retain the pause, and expose the exact remaining atomic position and manual venue URL. Never exceed the loss limit just to flatten.

- [ ] Run:

```bash
pnpm vitest run tests/execution/compensation.test.ts tests/execution/residual.test.ts tests/execution/reconciler.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 8: Add Kill-Switch Evaluation and Crash-Boundary Recovery Tests

**Files:**

- Create: `src/execution/kill-switch.ts`
- Create: `src/execution/recovery.ts`
- Create: `tests/execution/kill-switch.test.ts`
- Create: `tests/execution/crash-recovery.test.ts`
- Modify: `eslint.config.mjs`

- [ ] Write failing table-driven tests for every action cell and precedence combination in
  the typed user/global/strategy/venue-write/wallet-credential/contract-settlement/data-
  source/recovery-freeze matrix, plus expired grant, stale data, reconciliation backlog,
  database uncertainty, residual exposure, and guarded reset eligibility.

- [ ] Inject a crash after every boundary: reservation, first/second prepare, pair persistence, gate, `SUBMITTING`, first/second signing, first/second simulation, first/second submission start, response persistence, fill persistence, compensation, and notification handoff.

- [ ] Restart from durable state and prove:

  - no attempt submits twice;
  - uncertain attempts are reconciled;
  - only pre-submit reservations with no submit/mutation-start marker can expire-release,
    even when immutable locator or signed-abort audit evidence exists;
  - after either submit-start marker, reservations release only after authoritative no-trade or terminal accounting;
  - unmatched fills pause immediately;
  - recovery never calls a generic signer or arbitrary relay.

- [ ] Add ESLint import restrictions so adapters cannot import bundle repositories and repositories cannot import upstream clients. The orchestrator is the only module allowed to compose both boundaries.

- [ ] Run:

```bash
pnpm vitest run tests/execution
pnpm test:db
pnpm lint
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 9: Document and Verify the Execution Protocol

**Files:**

- Modify: `docs/architecture.md`
- Create: `docs/execution-protocol.md`
- Create: `docs/runbooks/unknown-execution.md`
- Create: `docs/runbooks/unhedged-position.md`

- [ ] Document the state machines, immutable artifacts, transaction/network boundary, submit-once rule, locator strategy, compensation ceiling, and kill-switch precedence.

- [ ] Write operator runbooks that preserve reconciliation during rollback and forbid manual blind resubmission. Include evidence needed before an `UNKNOWN` or `UNHEDGED` case can be annotated resolved.

- [ ] Run the kernel gate:

```bash
pnpm lint
pnpm typecheck
pnpm vitest run tests/execution
pnpm test:db
pnpm test
pnpm build
git diff --check
```

Expected: every command exits `0`; existing replay and disclosure tests remain green.

- [ ] Inspect all signer/submission references:

```bash
rg -n "sign\(|submitOnce|sendTransaction|sendRawTransaction|broadcast|placeIoc" src/execution src/app
```

Expected: live signing/submission exists only behind venue-specific adapters and the orchestrator; there is no app route exposing it.

- [ ] Review `git status --short`; do not commit or push.
