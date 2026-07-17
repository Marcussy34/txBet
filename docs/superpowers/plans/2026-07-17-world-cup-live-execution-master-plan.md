# World Cup Live Execution Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn txBet into a standalone, multi-user World Cup arbitrage system with an international Polymarket pre-split-inventory/exact-share-SELL canary candidate, a no-live-surface Kalshi-through-DFlow shadow lane, and the five approved follow-on venues behind equivalent certification gates. Direct Polymarket FOK BUY remains shadow-only.

**Architecture:** Keep `src/core` deterministic and replay-compatible. Add a Privy-authenticated Next.js control plane on Vercel, append-only execution and market records in Supabase Postgres, and two Railway services: market data plus an execution service containing independent execution, reconciliation, and notification loops. Live venue code implements a new prepared-artifact adapter boundary; the existing simulated `VenueAdapter` remains unchanged.

**Tech Stack:** Node 24, Next.js 16.2, React 19, TypeScript, Vitest, Playwright, Supabase Postgres, Privy embedded wallets/server signers, TxLINE, pinned unified `@polymarket/client@0.1.0-beta.16`, DFlow Trading API shadow schemas, Solana web3.js offline-fixture validation, Resend, Vercel, and Railway.

## Global Constraints

- Do not commit or push unless the user separately requests it. Every task ends with a diff review checkpoint instead of a commit.
- Never read, print, copy, or import secret values from Predictefy. Its source may inform architecture and environment-variable names only.
- Keep txBet standalone: its own Privy app, policies, database roles, venue credentials, deployments, and encryption keys.
- Preserve `/console`, the replay engine, and the permanent simulated-execution disclosure.
- Use integer microdollars for authorization and P&L. Venue-native token amounts are bigint-backed decimal strings.
- Fail closed on incomplete settlement evidence, stale data, insufficient depth, expired grants, policy mismatch, uncertain execution, or residual exposure.
- No generic signing, arbitrary calldata, arbitrary transaction, relay, or user-supplied URL endpoint.
- Token-account cleanup and generic venue withdrawals are manual-only; the worker exposes
  read-only readiness/manual links and never constructs or signs those mutations.
- No network call may occur inside a database transaction.
- Production begins in `disabled`; promotion follows `disabled -> shadow -> canary -> live` through audited state changes.
- The canary cap is $10 aggregate exposure and requires a genuine qualifying World Cup arbitrage.
- Upstream KYC, eligibility, sanctions, and geofence errors are enforced and never bypassed.
- Rain is excluded.
- Run focused tests after every meaningful change and `pnpm verify` before completion.

## Implementation Granularity

Each checkbox is a parent checkpoint, not permission to batch a feature. For every listed behavior or table, execute this red-green loop before moving to the next listed behavior:

1. Add one focused failing test or pgTAP assertion.
2. Run only that test and confirm the expected failure.
3. Add the smallest implementation or migration statement that makes it pass.
4. Rerun the focused test and its nearest regression file.
5. Run typecheck after an exported type changes.

Create database objects in dependency order one table/function/policy at a time. Create adapter behavior one method/state at a time. Mark the parent checkbox only when every enumerated subcase is green. Do not combine unrelated plan tasks or use a broad implementation pass before tests.

---

## Plan Set and Required Order

| Order | Plan | Outcome |
|---:|---|---|
| 1 | [Platform foundation](./2026-07-17-world-cup-platform-foundation-plan.md) | Auth, wallet identity, database roles/RLS, risk controls, grants, protected dashboard/API foundation |
| 2 | [Market truth](./2026-07-17-world-cup-market-truth-plan.md) | Complete World Cup settlement model, TxLINE feed, verified contract links, exact quote normalization, shadow opportunities |
| 3 | [Execution kernel](./2026-07-17-world-cup-execution-kernel-plan.md) | Append-only state machine, artifact boundary, final gate, orchestration, reconciliation, compensation, kill switches |
| 4 | [Polymarket lane](./2026-07-17-polymarket-live-lane-plan.md) | Type-3 deposit-wallet onboarding, pUSD/CTF bindings, direct-BUY shadow refusal, pre-split complete-set inventory, exact-share FOK SELL candidate, and websocket/REST reconciliation |
| 5 | [DFlow/Kalshi lane](./2026-07-17-dflow-kalshi-live-lane-plan.md) | Exact fixed-host schemas and sanitized offline Solana validation, with no live adapter/signing surface until official discovery, mapping, eligibility, redemption, and exact-output contracts exist |
| 6 | [Product and operations](./2026-07-17-world-cup-product-operations-plan.md) | Dashboard/API integration, worker loops, observability, deployment, E2E, security review, shadow/canary runbooks |
| 7 | [Venue expansion](./2026-07-17-approved-venue-expansion-plan.md) | Opinion, Predict.fun, Limitless, SX Bet, and Hydromancer under the same gates |

Plans 1-3 establish shared contracts. Execute plan 4's dependency/environment task before plan 5's dependency/environment task so `package.json`, `pnpm-lock.yaml`, `.env.example`, and typed environment loaders have a single writer; bounded source/test tasks may then run in parallel with disjoint ownership. Plan 6 begins after the Polymarket candidate suite passes and DFlow proves its no-live-surface shadow contract. Plan 7 begins venue-by-venue after phase-one shadow validation. Polymarket direct FOK BUY cannot enter canary under its USD-notional contract; only the independently reviewed pre-split/exact-share-SELL candidate may promote. DFlow cannot promote from code or mocked tests: it needs current official discovery, immutable market/mint mapping, delegated-user eligibility/KYC, redemption, and finite exact-output contracts before a live adapter may even be registered.

## Locked Shared Boundaries

### Live venue adapter

Create in `src/execution/types.ts` and do not add these methods to `src/adapters/venue.ts`:

```ts
export type LiveVenueId =
  | "polymarket"
  | "kalshi-dflow"
  | "opinion"
  | "predict-fun"
  | "limitless"
  | "sx-bet"
  | "hydromancer";

import type { JsonValue } from "@/core/canonical-json";
import type { AtomicAmount } from "@/core/live-money";

export interface VenueReadContext {
  profileId: string;
  wallet: WalletBinding;
  nowMs: number;
  signal?: AbortSignal;
}

export interface EntryExecutionContext extends VenueReadContext {
  operationKind: "entry";
  operationAttemptId: string;
  attemptKey: string;
  subject: {
    bundleHash: string;
    bundleId: string;
    legId: string;
  };
}

export interface CompensationExecutionContext extends VenueReadContext {
  operationKind: "compensation";
  operationAttemptId: string;
  attemptKey: string;
  subject: {
    originalBundleHash: string;
    residualRevision: string;
    compensationSemanticHash: string;
  };
}

export interface CancellationExecutionContext extends VenueReadContext {
  operationKind: "cancel";
  operationAttemptId: string;
  attemptKey: string;
  subject: {
    originalAttemptKey: string;
    cancellationSemanticHash: string;
  };
}

export interface RedemptionExecutionContext extends VenueReadContext {
  operationKind: "redemption";
  operationAttemptId: string;
  attemptKey: string;
  subject: {
    positionRevision: string;
    redemptionSemanticHash: string;
  };
}

export type OrderExecutionContext = EntryExecutionContext | CompensationExecutionContext;
export type ExecutionContext =
  | OrderExecutionContext
  | CancellationExecutionContext
  | RedemptionExecutionContext;

export type ArtifactExecutionContext<
  Context extends
    | OrderExecutionContext
    | CancellationExecutionContext
    | RedemptionExecutionContext =
    | OrderExecutionContext
    | CancellationExecutionContext
    | RedemptionExecutionContext,
> = Context & {
  artifactHash: string;
  submissionKey: string;
};

export interface WalletBinding {
  walletId: string;
  chain: "evm" | "solana";
  address: string;
  network: string;
  funderAddress: string | null;
}

export interface VenueLocator {
  schemaVersion: "venue-locator-v1";
  venue: LiveVenueId;
  primaryId: string;
  clientId: string | null;
  transactionSignature: string | null;
  createdAt: number;
  expiresAt: number | null;
  evidenceHash: string;
}

export type ExecutionCostObservation =
  | {
      kind: "final";
      networkCostMicros: Micros;
      setupCostMicros: Micros;
      totalCostMicros: Micros;
      chargedAssetId: string | null;
      chargedAtomic: AtomicAmount | null;
      valuationPolicyVersion: string | null;
      receiptId: string | null;
      finalityRevision: string;
      evidenceHash: string;
    }
  | {
      kind: "unknown";
      heldReservedCostMicros: Micros;
      evidenceHash: string | null;
    };

export interface BalanceObservation {
  assetId: string;
  amountAtomic: AtomicAmount;
  decimals: number;
  observedAt: number;
  evidenceHash: string;
}

export interface PositionObservation extends BalanceObservation {
  contractVersionId: string;
  outcome: "YES" | "NO";
  exactShares: ExactShares;
}

export interface ResidualExposure {
  bundleId: string;
  legId: string;
  contractVersionId: string;
  outcome: "YES" | "NO";
  quantity: VenueQuantity;
  maximumLossMicros: Micros;
}

export type LiveAcquisitionPath =
  | {
      kind: "direct-buy";
      orderSide: "BUY";
      orderOutcome: "YES" | "NO";
    }
  | {
      kind: "complete-set-sell-complement";
      orderSide: "SELL";
      orderOutcome: "YES" | "NO";
      inventoryLotId: string;
      inventoryLotVersion: number;
      inventoryReservationFence: number;
      inventoryEvidenceHash: string;
    };

export interface LiveOrderIntent {
  contractVersionId: string;
  settlementSpecVersionId: string;
  desiredOutcome: "YES" | "NO";
  acquisitionPath: LiveAcquisitionPath;
  exactNetShares: ExactShares;
  grossVenueQuantity: VenueQuantity;
  minimumNetVenueQuantity: VenueQuantity;
  maximumNetVenueQuantity: VenueQuantity;
  netOutcomeBoundsHash: string;
  feeScheduleVersion: string;
  limitPriceMicros: Micros;
  maxSpendMicros: Micros;
  expiresAt: number;
}

export interface OrderReconcileClaim {
  intent: LiveOrderIntent;
  orderIntentHash: string;
  operationRecordHash: string;
  artifactHash: string;
  signedArtifactHash: string;
  submissionKey: string;
  signerAddress: string;
  venueAccountRevision: string;
  locator: VenueLocator;
  submitStartedAt: number;
  expectedOperationAttemptVersion: number;
  expectedSubjectVersion: number;
}

export interface LiveVenueAdapter {
  readonly id: LiveVenueId;
  prepare(context: OrderExecutionContext, intent: LiveOrderIntent): Promise<PreparedArtifact>;
  validate(
    context: OrderExecutionContext,
    intent: LiveOrderIntent,
    artifact: PreparedArtifact,
  ): Promise<void>;
  sign(
    context: ArtifactExecutionContext<OrderExecutionContext>,
    intent: LiveOrderIntent,
    artifact: PreparedArtifact,
  ): Promise<SignedArtifact>;
  simulate(
    context: ArtifactExecutionContext<OrderExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<void>;
  submitOnce(
    context: ArtifactExecutionContext<OrderExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<SubmitObservation>;
  reconcile(
    context: OrderExecutionContext,
    claim: OrderReconcileClaim,
  ): Promise<ReconcileObservation>;
  balances(context: VenueReadContext): Promise<readonly BalanceObservation[]>;
  positions(context: VenueReadContext): Promise<readonly PositionObservation[]>;
}

export interface CancellationIntentSemantics {
  schemaVersion: "cancellation-intent-semantics-v1";
  profileId: string;
  originalAttemptKey: string;
  originalOrderRevision: string;
  locator: VenueLocator;
  reason: "EXPIRED" | "PAIR_RISK" | "OPERATOR_FREEZE";
  maximumAttemptCostMicros: Micros;
  cumulativeTotalCostCeilingMicros: Micros;
  costAuthorizationRevision: string;
  costPolicyVersion: string;
  expiresAt: number;
}

export interface CompensationIntentSemantics {
  schemaVersion: "compensation-intent-semantics-v1";
  profileId: string;
  originalBundleHash: string;
  residualRevision: string;
  action: LiveOrderIntent;
  quoteRevision: string;
  budgetVersion: number;
  worstCaseIncrementalLossMicros: Micros;
  cumulativeLossCeilingMicros: Micros;
  expiresAt: number;
}

export interface RedemptionIntentSemantics {
  schemaVersion: "redemption-intent-semantics-v1";
  profileId: string;
  venue: LiveVenueId;
  positionRevision: string;
  contractVersionId: string;
  quantity: VenueQuantity;
  ownerWalletId: string;
  ownerAddress: string;
  destinationAddress: string;
  payoutAssetId: string;
  payoutAssetRevision: string;
  payoutAssetDecimals: number;
  minimumPayoutAtomic: AtomicAmount;
  maximumAttemptCostMicros: Micros;
  cumulativeTotalCostCeilingMicros: Micros;
  costAuthorizationRevision: string;
  costPolicyVersion: string;
  resolutionRevision: string;
  resolutionEvidenceHash: string;
  expiresAt: number;
}

export interface RecoveryIntentIdentity {
  semanticHash: string;
  operationScopeKey: string;
  attemptOrdinal: number;
  attemptKey: string;
}

export interface CancellationIntent extends RecoveryIntentIdentity {
  schemaVersion: "cancellation-intent-v1";
  cancellationId: string;
  costBudgetSubjectKey: string;
  semantics: CancellationIntentSemantics;
  recordHash: string;
}

export interface ReconciledCancellationBinding {
  originalAttemptKey: string;
  originalOrderRevision: string;
  cancellationOperationSubjectKey: string;
  cancellationOperationSubjectVersion: number;
  semanticHash: string;
  operationScopeKey: string;
  attemptKey: string;
  operationAttemptVersion: number;
  signerAddress: string;
  authorizationPrincipalId: string;
  venueAccountRevision: string;
  recordHash: string;
  artifactHash: string;
  signedArtifactHash: string;
  submissionKey: string;
  costBudgetSubjectKey: string;
  costBudgetVersion: number;
  costAuthorizationRevision: string;
  bindingEvidenceHash: string;
}

export type CancellationObservation =
  | {
      kind: "pending" | "unknown";
      locator: VenueLocator;
      originalAttemptKey: string;
      cancellationBinding: ReconciledCancellationBinding;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    }
  | {
      kind: "reverted";
      locator: VenueLocator;
      originalAttemptKey: string;
      cancellationBinding: ReconciledCancellationBinding;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    }
  | {
      kind: "succeeded";
      locator: VenueLocator;
      originalAttemptKey: string;
      cancellationBinding: ReconciledCancellationBinding;
      finalizedAt: number;
      receiptEvidenceHash: string;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    };

export interface CancellationReconcileClaim {
  intent: CancellationIntent;
  recordHash: string;
  artifactHash: string;
  signedArtifactHash: string;
  submissionKey: string;
  locator: VenueLocator;
  submitStartedAt: number;
  signerAddress: string;
  authorizationPrincipalId: string;
  venueAccountRevision: string;
  expectedOperationAttemptVersion: number;
  expectedOriginalAttemptVersion: number;
  cancellationOperationSubjectKey: string;
  expectedCancellationOperationSubjectVersion: number;
  costBudgetSubjectKey: string;
  expectedCostBudgetVersion: number;
  costAuthorizationRevision: string;
}

export interface LiveCancellationAdapter {
  readonly venue: LiveVenueId;
  prepare(
    context: CancellationExecutionContext,
    intent: CancellationIntent,
  ): Promise<PreparedArtifact>;
  validate(
    context: CancellationExecutionContext,
    intent: CancellationIntent,
    artifact: PreparedArtifact,
  ): Promise<void>;
  sign(
    context: ArtifactExecutionContext<CancellationExecutionContext>,
    intent: CancellationIntent,
    artifact: PreparedArtifact,
  ): Promise<SignedArtifact>;
  simulate(
    context: ArtifactExecutionContext<CancellationExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<void>;
  submitOnce(
    context: ArtifactExecutionContext<CancellationExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<SubmitObservation>;
  reconcile(
    context: CancellationExecutionContext,
    claim: CancellationReconcileClaim,
  ): Promise<CancellationObservation>;
}

export interface CompensationIntent extends RecoveryIntentIdentity {
  schemaVersion: "compensation-intent-v1";
  compensationId: string;
  semantics: CompensationIntentSemantics;
  recordHash: string;
}

export interface LiveCompensationPlanner {
  readonly venue: LiveVenueId;
  quoteBoundedIntentSemantics(
    context: VenueReadContext,
    residual: ResidualExposure,
    remainingLossMicros: Micros,
  ): Promise<readonly CompensationIntentSemantics[]>;
}

export interface RedemptionIntent extends RecoveryIntentIdentity {
  schemaVersion: "redemption-intent-v1";
  redemptionId: string;
  costBudgetSubjectKey: string;
  semantics: RedemptionIntentSemantics;
  recordHash: string;
}

export interface ReconciledRedemptionBinding {
  positionSubjectKey: string;
  positionRevision: string;
  semanticHash: string;
  operationScopeKey: string;
  attemptKey: string;
  operationAttemptVersion: number;
  signerAddress: string;
  authorizationPrincipalId: string;
  venueAccountRevision: string;
  recordHash: string;
  artifactHash: string;
  signedArtifactHash: string;
  submissionKey: string;
  costBudgetSubjectKey: string;
  costBudgetVersion: number;
  costAuthorizationRevision: string;
  bindingEvidenceHash: string;
}

export type RedemptionObservation =
  | {
      kind: "pending" | "unknown";
      locator: VenueLocator;
      positionRevision: string;
      redemptionBinding: ReconciledRedemptionBinding;
      payoutAtomic: null;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    }
  | {
      kind: "reverted";
      locator: VenueLocator;
      positionRevision: string;
      redemptionBinding: ReconciledRedemptionBinding;
      payoutAtomic: "0";
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    }
  | {
      kind: "succeeded";
      locator: VenueLocator;
      positionRevision: string;
      redemptionBinding: ReconciledRedemptionBinding;
      payoutAssetId: string;
      payoutAssetRevision: string;
      payoutAtomic: AtomicAmount;
      finalizedAt: number;
      receiptEvidenceHash: string;
      executionCost: ExecutionCostObservation;
      evidence: JsonValue;
    };

export interface RedemptionReconcileClaim {
  intent: RedemptionIntent;
  recordHash: string;
  artifactHash: string;
  signedArtifactHash: string;
  submissionKey: string;
  locator: VenueLocator;
  submitStartedAt: number;
  signerAddress: string;
  authorizationPrincipalId: string;
  venueAccountRevision: string;
  expectedOperationAttemptVersion: number;
  positionSubjectKey: string;
  positionRevision: string;
  expectedPositionVersion: number;
  costBudgetSubjectKey: string;
  expectedCostBudgetVersion: number;
  costAuthorizationRevision: string;
}

export interface LiveRedemptionAdapter {
  readonly venue: LiveVenueId;
  prepare(
    context: RedemptionExecutionContext,
    intent: RedemptionIntent,
  ): Promise<PreparedArtifact>;
  validate(
    context: RedemptionExecutionContext,
    intent: RedemptionIntent,
    artifact: PreparedArtifact,
  ): Promise<void>;
  sign(
    context: ArtifactExecutionContext<RedemptionExecutionContext>,
    intent: RedemptionIntent,
    artifact: PreparedArtifact,
  ): Promise<SignedArtifact>;
  simulate(
    context: ArtifactExecutionContext<RedemptionExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<void>;
  submitOnce(
    context: ArtifactExecutionContext<RedemptionExecutionContext>,
    artifact: SignedArtifact,
  ): Promise<SubmitObservation>;
  reconcile(
    context: RedemptionExecutionContext,
    claim: RedemptionReconcileClaim,
  ): Promise<RedemptionObservation>;
}
```

All `payload`, `locator`, semantic intent, materialized intent, and `evidence` values cross
a versioned Zod schema before persistence or use. `artifactHash` covers canonical JSON
and never changes after `PREPARED`. Compensation planners may only return complete,
immutable `CompensationIntentSemantics` candidates; the reservation transaction
materializes the one winning `CompensationIntent`, and the normal venue adapter
prepares/validates/signs `intent.semantics.action`, so no residual can bypass the order
contract. Redemption uses a separate fixed-intent interface and is disabled for a
venue until that venue has an official-reference fixture and adapter contract tests.
Every venue whose official entry can remain working must also register a
`LiveCancellationAdapter`; a terminal-on-submit venue may omit it only when certification
and adapter tests prove no working state is possible. Off-chain
cancellation still uses an immutable prepared/signed authenticated-request artifact and
returns a typed final-zero cost proof, while on-chain cancellation reconciles its receipt,
finality, and actual cost. A cancellation success means only that the cancellation action
was acknowledged/finalized. The original order is reconciled independently, and a late
fill wins.

Cancellation and redemption budgets are keyed to immutable subjects, not semantic hashes:

```text
cancellationCostBudgetSubjectKey = H(canonicalJson(["cancel-cost-budget-v1", profileId, originalAttemptKey, originalOrderRevision]))
redemptionCostBudgetSubjectKey = H(canonicalJson(["redemption-cost-budget-v1", profileId, venue, positionRevision]))
```

Cancellation also has one immutable operation-subject sequence, independent of semantic
scope:

```text
cancellationOperationSubjectKey = H(canonicalJson(["cancel-operation-subject-v1", profileId, originalAttemptKey, originalOrderRevision]))
```

Materialization locks that subject row and permits only one active cancellation attempt
across every reason, expiry, policy revision, semantic hash, and operation scope. The
fenced marker CAS locks and versions the same row. An active or `UNKNOWN` attempt blocks
all other ordinals and semantic scopes for the subject; only an authoritative terminal
no-broadcast/revert may advance the subject sequence to a later bounded ordinal. Race
tests propose differing reason/expiry/policy semantics and require exactly one active
attempt and one possible marker winner.

Every refreshed expiry, fee/cost policy, quote, or semantic scope for that same subject
uses the same budget and preserves prior realized/reserved cost. The first authorization
sets its ceiling and `costAuthorizationRevision`. A higher ceiling requires a separate
recent user authorization plus append-only audit and an atomic budget-version CAS; it
carries all prior counters forward and never creates a fresh budget. A lower ceiling is
accepted only if it is not below realized plus reserved cost.

Before any ordinal, one atomic function reserves `maximumAttemptCostMicros` against
`cumulativeTotalCostCeilingMicros`; an unknown observation keeps the full reservation,
and a typed final observation converts it to actual network plus setup cost exactly once.
An authoritative revert/no-broadcast may open a later ordinal only when prior final cost
plus all current reservations plus the new attempt bound remains within the same ceiling.
There is no new semantic scope, retry, expiry refresh, position poll, or policy refresh
path that resets either budget. Known-answer and concurrency tests vary random intent IDs,
expiry, cost-policy revision, and semantic hash while asserting one subject budget.

Redemption semantic hashes bind owner/destination, position/resolution revisions, exact
quantity, payout asset/revision/decimals, minimum payout, per-attempt/cumulative total
cost, cost-policy version, and expiry.
Database uniqueness permits one active redemption per position revision and credits one
finalized receipt/signature only once. `unknown` is polled; it is never rebuilt or
resubmitted. A succeeded observation must meet the minimum payout and finality policy
before position accounting closes. Reconciliation receives the complete immutable claim,
not a locator alone, and independently rechecks owner, destination, position/quantity,
payout asset/minimum, cost, resolution revision, and every hash before interpreting a
receipt. Adapters never query execution repositories or guess intent fields.

Every cancellation and redemption observation branch carries its typed reconciled binding.
Before applying status, payout, or execution cost, the reducer byte-compares every binding
field to the immutable claim, including historical signer/authorization principal,
venue-account revision, record/prepared/signed/submission hashes, recovery attempt version,
immutable operation subject/version, and subject-scoped cost-budget version/current
authorization revision. Any mismatch is invalid evidence and activates the relevant switch.
Contract tests mutate each field independently for pending, unknown, reverted, and
succeeded branches.

Order reconciliation receives a complete immutable `OrderReconcileClaim`, never a bare
locator. It re-hashes the order intent and independently binds the venue response/receipt
to contract, outcome, side, gross/net bounds, signer/account, artifact, signed artifact,
submission key, locator, subject, and attempt versions. A mismatch returns invalid
evidence and activates the relevant switch; the adapter may not query a repository to fill
in missing claim fields. Shared and venue contract tests mutate every claim binding.

Recovery idempotency has four deliberately separate, domain-separated hashes. First, canonicalize the
fully enumerated `*IntentSemantics` object, which contains every business-authorizing
field but contains **no newly generated operation UUID, database row ID, attempt key,
submission key, artifact hash, semantic hash, scope key, or record hash**. Then derive:

```text
semanticHash = H(canonicalJson(["recovery-semantic-hash-v1", operationKind, semanticIntent]))
operationScopeKey = H(canonicalJson(["recovery-operation-scope-v1", profileId, operationKind, semanticHash]))
attemptKey = H(canonicalJson(["operation-attempt-key-v1", operationKind, operationScopeKey, attemptOrdinal]))
submissionKey = H(canonicalJson(["operation-submission-key-v1", attemptKey, artifactHash]))
```

Semantic deadlines and revisions come from the referenced immutable order transition,
quote, residual, position, resolution, and policy evidence; they are never generated from
a worker-local clock after the race begins. The insert transaction enforces unique
`operationScopeKey + attemptOrdinal`, assigns the winning random operation UUID, persists
the semantic object/hash plus derived keys, and returns that row to all losing racers.
Only then is `recordHash = H(canonicalJson(materializedIntentWithoutRecordHash))` computed
and stored. Thus a random UUID or record hash can never feed its own scope/key. Tests race
two workers proposing different cancellation/compensation/redemption UUIDs for byte-equal
semantics and require one scope, one attempt key, and one persisted winner.

Entry uses these exact domain-separated canonical-JSON byte formulas everywhere:

```text
bundleScopeKey = H(canonicalJson(["entry-bundle-scope-v1", profileId, strategyId, opportunityId, bundleHash]))
legScopeKey = H(canonicalJson(["entry-leg-scope-v1", bundleScopeKey, legIndex]))
attemptKey = H(canonicalJson(["operation-attempt-key-v1", "entry", legScopeKey, attemptOrdinal]))
```

`legIndex` is an integer `0 | 1`; it appears only in `legScopeKey`, not again in the
attempt formula. The same shared helper owns database and TypeScript derivation. Known-
answer tests pin the UTF-8 canonical bytes and all three entry hashes, and one-field
mutations cover every component.

`attemptKey` exists before artifact construction and supplies any venue client ID required
inside the payload. It never depends on a newly generated operation UUID, random bundle
ID, final record hash, or artifact hash. After validation,
`submissionKey = H(canonicalJson(["operation-submission-key-v1", attemptKey, artifactHash]))`
is used for
durable submit-once/audit deduplication and is not retroactively inserted into the
artifact. Database uniqueness separately covers every stable operation scope, ordinal,
attempt key, and submission key. An `UNKNOWN` operation never gets a new ordinal; an
authoritatively reverted/no-broadcast recovery action may create the next bounded ordinal.

One shared SQL/TypeScript derivation helper owns these exact UTF-8 byte formulas for
entry and every recovery operation kind. Known-answer tests pin the canonical bytes and
hash for every domain, and mutation tests change each tuple component independently so
concatenation ambiguity, domain reuse, or a missing field fails closed.

Order methods receive only `EntryExecutionContext | CompensationExecutionContext`;
cancellation receives `CancellationExecutionContext`; redemption receives
`RedemptionExecutionContext`; read-only balance/position calls receive `VenueReadContext`.
The discriminated subject is bound into artifact AAD, logs, and audit evidence. No caller
may invent a bundle ID for a position-based redemption or use one operation subject as
another.

`VenueLocator.createdAt` is the deterministic locator-construction time. It never claims
that a submission occurred. The authoritative `submit_started_at` is stored on the
append-only attempt event when the pair marker transaction commits, and acknowledgment
observation time is stored separately. Signed-abort artifacts may therefore retain a
valid locator without a submission timestamp.

### Identity and authorization

```ts
export interface VerifiedSession {
  profileId: string;
  privyDid: string;
  email: string;
  evmWalletId: string;
  evmAddress: string;
  solanaWalletId: string;
  solanaAddress: string;
  operator: boolean;
}

export interface VenueEligibilityEvidence {
  schemaVersion: "venue-eligibility-v1";
  profileId: string;
  venue: LiveVenueId;
  walletId: string;
  venueAccountId: string;
  accountRevision: string;
  environmentRevision: string;
  scope:
    | {
        kind: "venue";
        action: "onboard";
        scopeRevision: string;
      }
    | {
        kind: "market";
        action: "quote" | "entry" | "compensation" | "cancel" | "redemption";
        contractVersionId: string;
        marketBindingRevision: string;
      };
  status: "eligible" | "denied" | "unknown";
  reasonCode: string;
  sourceRevision: string;
  observedAt: number;
  expiresAt: number;
  evidenceHash: string;
}

export interface VenueEligibilityReader {
  readCurrent(
    tuple: Pick<
      VenueEligibilityEvidence,
      | "profileId"
      | "venue"
      | "walletId"
      | "venueAccountId"
      | "accountRevision"
      | "environmentRevision"
      | "scope"
    >,
  ): Promise<VenueEligibilityEvidence | null>;
}
```

The browser opens Privy's Google-only modal with
`useLogin().login({ loginMethods: ["google"] })`; it does not use direct
`useLoginWithOAuth`, because that custom flow does not apply automatic wallet creation.
`PrivyProvider` sets both Ethereum and Solana `createOnLogin` values to `"all-users"`.
The server verifies the bearer token through
`privy.utils().auth().verifyAuthToken(token)` and derives every identifier above from its
claims plus persisted ownership, never from mutation request bodies. Auth tokens are never
stored by txBet in Web Storage. Route handlers are the only browser-to-database boundary.

Eligibility is upstream evidence, not a txBet bypass or custom compliance decision. The
execution worker refreshes the exact profile/wallet/account/venue/environment **and typed
action scope** through the venue's fixed official client. Market-scoped evidence binds the
exact canonical contract version and venue market-binding revision; venue-wide onboarding
evidence cannot authorize a quote, entry, compensation, cancellation, or redemption.
Before network I/O, the refresh worker claims a database generation and monotonic fence
for the complete tuple/scope. Only that unexpired winning claim may advance the optimistic
current pointer after persisting a response. `readCurrent` follows that pointer before
testing status or expiry; completion order, source timestamps, UUIDs, and delayed stale
workers never choose the winner. Reservation, signing gate, broadcast gate, and marker CAS require fresh `eligible`
for every exact leg/action scope; `denied`, `unknown`, stale, unavailable, scope drift, or
tuple drift fails closed.
Read-only reconciliation of any durable submit-start operation is never eligibility-gated:
it continues polling and accounting authoritative results after denial, expiry, freeze, or
upstream unavailability, without gaining authority to sign or broadcast anything new.

### Money and quantity

```ts
export type Micros = number;
export type AtomicAmount = `${bigint}`; // Canonical owner: src/core/live-money.ts

export interface ExactShares {
  numerator: AtomicAmount;
  denominator: AtomicAmount;
}

export interface VenueQuantity {
  atomic: AtomicAmount;
  scale: number;
  exactShares: ExactShares;
  conversionEvidenceHash: string;
}
```

Keep the repository's existing `Micros` representation for replay compatibility, but live constructors accept only nonnegative safe integers. Decimal strings are converted exactly once. `ExactShares` is a positive reduced rational with a positive denominator; equality is checked by bigint cross-multiplication. Each leg carries the fixed gross order quantity plus independently proven minimum and maximum net venue outcomes over **every** execution price, maker split, multi-level allocation, and fee-rounding path permitted by the FOK artifact. An official invariant may prove the bounds, but its revision/evidence is bound into `netOutcomeBoundsHash`. Reservation and both final gates require `minimumNetVenueQuantity.exactShares == maximumNetVenueQuantity.exactShares == exactNetShares`; a range, even one caused only by favorable price improvement, is shadow-only because post-fill compensation is too late to satisfy equal-output entry. Gross quantities may differ when a venue deducts outcome-token fees. Atomic integers from different venue scales are never compared directly. No float or `Math.floor` may authorize an order.

### Persistence and jobs

- Web requests connect with `SUPABASE_WEB_DATABASE_URL`, set a transaction-local verified `profile_id`, and remain subject to RLS.
- Market data connects with `SUPABASE_MARKET_DATABASE_URL`; execution connects with `SUPABASE_EXECUTION_DATABASE_URL`. Their roles and grants are distinct, and only execution may read encrypted venue credentials or mutate execution state.
- Migrations use lowercase names, indexed foreign keys, indexed RLS predicates, check constraints, append-only triggers, and unique idempotency/venue-reference constraints.
- Job claims use database time plus `FOR UPDATE SKIP LOCKED`; leases can be reclaimed after expiry.
- Network actions happen after the reservation/state transaction commits. Their observations are persisted in a new short transaction.

## End-to-End Acceptance Matrix

| Capability | Required evidence |
|---|---|
| Google sign-in | `useLogin` modal restricted to Google plus Privy development-app E2E and current Node `verifyAuthToken` tests |
| Embedded wallets | Both chain configs use `createOnLogin: "all-users"`; exactly one EVM and one Solana wallet persist per profile and repeated login is idempotent |
| Delegation | Explicit grant, policy verification, <=7-day expiry, immediate revoke, no generic signer |
| Risk | SQL and service tests for $100/order, $1,000 rolling day, user limits, 1% and $0.10 floors |
| World Cup scope | All discovered contracts cataloged; only complete exact complements become executable links |
| Market truth | Rule-hash/revision/spec changes invalidate links and opportunities |
| Polymarket | Unified beta pinned/audited on Node 24; Privy peer compatibility proven; owner versus type-3 deposit-wallet binding; pUSD/contracts; direct-BUY shadow refusal; finalized exclusive complete-set inventory; exact-share FOK SELL and split/merge uncertainty tests; REST+WS reconcile |
| DFlow/Kalshi | Exact current hosts/schemas and documentation gate; historical URLs rejected; sanitized offline transaction mutations pass; registry proves no signer/write-RPC/live adapter while discovery, mapping, eligibility, redemption, and exact output remain unavailable |
| Cross-chain bundle | Both artifacts prepared before `SUBMITTING`; concurrent dispatch; timeouts become `UNKNOWN` |
| Residual exposure | Auto-pause, bounded compensation, `UNHEDGED` if loss cap prevents an unwind |
| Recovery | Crash-boundary tests prove no duplicate submission and eventual reconciliation |
| Notifications | Transactional outbox, in-app delivery, email dedupe/retry |
| Security | Runtime schema validation, fixed upstream hosts, secret redaction, CSP/headers, independent review |
| Deployment | Vercel web plus separate Railway worker health/readiness checks against staging Supabase |
| Canary | Genuine opportunity only, allowlisted account, $10 aggregate cap, zero unresolved unknowns first |

## Cross-Plan Verification Commands

Run from `/Users/marcus/Projects/txBet`:

```bash
pnpm install --frozen-lockfile
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
```

Expected final result: every command exits `0`. A production dependency advisory must be fixed or recorded with an explicit upstream mitigation before canary promotion.

## Official Source Baseline

- [TxLINE quickstart](https://txline.txodds.com/documentation/quickstart) and [World Cup service](https://txline.txodds.com/documentation/worldcup)
- [Privy automatic wallet creation](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation), [login modal](https://docs.privy.io/authentication/user-authentication/ui-component), [access-token verification](https://docs.privy.io/authentication/user-authentication/access-tokens), [server signers](https://docs.privy.io/wallets/using-wallets/signers), and [signer policies](https://docs.privy.io/wallets/using-wallets/signers/quickstart)
- [Polymarket unified TypeScript SDK](https://docs.polymarket.com/dev-tooling/typescript), [deposit wallets](https://docs.polymarket.com/trading/deposit-wallets), [contracts](https://docs.polymarket.com/resources/contracts), [order creation](https://docs.polymarket.com/trading/orders/create), and [authenticated user channel](https://docs.polymarket.com/market-data/websocket/user-channel); see [the frozen txBet baseline](../../references/polymarket-api-baseline.md)
- [DFlow documentation index](https://pond.dflow.net/llms.txt), [endpoints](https://pond.dflow.net/get-started/endpoints), [`GET /order`](https://pond.dflow.net/resources/trading-api/order/order), and [`GET /order-status`](https://pond.dflow.net/resources/trading-api/order/order-status); see [the frozen txBet baseline](../../references/dflow-api-baseline.md)
- [Kalshi authenticated requests](https://docs.kalshi.com/getting_started/quick_start_authenticated_requests) and [order API](https://docs.kalshi.com/api-reference/orders/create-order-v2)

At the start of each venue task, re-fetch the official page named by that task. If the API or SDK contract changed, stop, revise the affected plan section, and run its contract fixtures before implementation.

## Master Completion Gate

- [ ] Execute plans 1-6 in order and pass every plan-local gate.
- [ ] Run the cross-plan verification commands above.
- [ ] Run a read-only independent review focused on authorization, signing boundaries, transaction validation, idempotency, and recovery.
- [ ] Resolve every critical/high finding and rerun its regression suite.
- [ ] Demonstrate `disabled` and `shadow` in a production-shaped staging deployment.
- [ ] Confirm zero unresolved `UNKNOWN`, `BOUNDED_RESIDUAL`, `UNHEDGED`, and `INVALID` records.
- [ ] Exercise user and global kill-switch drills.
- [ ] Promote only the Polymarket pre-split complete-set/exact-share FOK-SELL candidate or a later independently certified venue to canary through an audited operator action and only when a genuine opportunity exists. Direct Polymarket FOK BUY stays shadow-only. DFlow is ineligible until every missing official discovery, mapping, delegated-user eligibility/KYC, redemption, and exact-output contract is current and independently verified.
- [ ] Review `git diff --check` and `git status --short`; do not commit or push.
