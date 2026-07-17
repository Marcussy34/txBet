# World Cup live execution — design specification

_Date: 2026-07-17 · Status: approved by the user, with the Polymarket direct-BUY and DFlow discovery/eligibility/exact-output limitations recorded below · Scope: international Polymarket and Kalshi-through-DFlow first, followed by Opinion, Predict.fun, Limitless, SX Bet, and Hydromancer. Rain is excluded._

## 1. Intent

txBet becomes a standalone, multi-user World Cup arbitrage product that can execute
real-money, two-leg positions automatically. Users sign in with Google through Privy,
receive an embedded EVM wallet and an embedded Solana wallet, fund the two wallets
separately, and grant txBet a time-bound, policy-limited signer. txBet searches every
available World Cup market family, but it executes only when two contracts have provably
identical settlement semantics and the equal-size bundle remains profitable after every
known cost and safety buffer.

The first implementation lanes are:

- **International Polymarket CLOB on Polygon**, using the user's embedded EOA as the owner
  of the official type-3 deposit wallet. The deposit wallet is the distinct CLOB order
  signer, maker, and funder.
- **Planned Kalshi contracts tokenized through DFlow on Solana**. The current shadow lane
  does not bind or use the user's embedded Solana wallet because the official market and
  eligibility contracts are unavailable. Phase one does not submit native Kalshi REST
  orders or hold a user's Kalshi RSA key.

The current unified Polymarket SDK's direct FOK BUY is USD-notional and cannot guarantee an
exact share quantity. Direct BUY is shadow-only. The only current canary candidate is
finalized pre-split complete-set inventory followed by an exact-share FOK SELL of the
undesired outcome; that path may advance only after all inventory, split/merge, beta-SDK,
Privy-compatibility, adapter, and independent-review gates pass.

The current official DFlow documentation index has no prediction-market discovery,
Kalshi-market/outcome-mint mapping, or delegated-user eligibility/KYC contract. Its current
`GET /order` contract is also exact-input and exposes a
minimum output, not a finite exact-output upper bound. Therefore the DFlow lane is built,
tested, and operated only as fixed-host schemas plus sanitized offline fixtures. It has no
live adapter and is not eligible for signing, reservation, canary, or live submission unless
refreshed official documentation supplies every missing contract and decoded transaction
evidence proves that minimum and maximum output both equal txBet's required hedge quantity.
This is a product safety constraint, not an implementation TODO.

The engine remains deterministic and uses integer microdollars. Any ambiguity in
identity, settlement, freshness, liquidity, authorization, execution, or reconciliation
fails closed.

## 2. Decisions already approved

- Product model: multi-user application.
- Authentication: Google/Gmail through Privy.
- Wallets: one embedded EVM wallet and one embedded Solana wallet per user.
- Automation: unattended execution after an explicit, revocable grant.
- Grant duration: seven days maximum; users may choose a shorter duration.
- Scope: every World Cup market family may be ingested and matched.
- Execution: exact, complementary, two-leg arbitrage only; no directional strategies.
- Funding: Polygon and Solana wallets are funded separately.
- Bridging/rebalancing: no automatic cross-chain bridge or balance rebalancer in phase
  one.
- User risk controls: per-order, daily, strategy, and total budgets set by each user.
- Platform ceilings: $100 per order and $1,000 per rolling 24 hours per user.
- Platform profit floor: at least 1.00% net return and at least $0.10 expected net profit
  after fees, gas, slippage, and buffers. Users may require more.
- Residual exposure: automatically unwind within the user's emergency-loss limit, then
  pause that user's automation.
- Emergency-loss ceiling: the lower of 5% of the bundle notional or $5.
- Initial live canary: at most $10 total real-money exposure; never force a directional
  trade merely to exercise the path.
- Infrastructure: Vercel, Railway, Supabase Postgres, and Privy.
- Notifications: in-app and email.
- Later venues: Opinion, Predict.fun, Limitless, SX Bet, then Hydromancer. Rain is not in
  scope.
- Geographic posture: globally usable architecture without a custom compliance engine;
  upstream eligibility, KYC, sanctions, and geofence failures are not bypassed and fail
  closed.

## 3. Alternatives considered

### A. Standalone managed execution worker — selected

The web application owns authentication and controls. Durable Railway workers own
market ingestion and execution. Supabase stores every intent and transition. Privy
performs policy-authorized wallet operations without revealing private keys.

This is the only approach that satisfies background automation, durable recovery,
user-owned wallets, and txBet's standalone boundary.

### B. Browser-only signing — rejected

Keeping every signing action in the browser minimizes server authority, but automation
stops when the tab closes, websocket state is transient, and crash recovery cannot be
made reliable. It is incompatible with unattended execution.

### C. Reuse Predictefy's hosted execution service and secrets — rejected

This would shorten initial implementation, but it couples identity, credentials,
availability, deployment, and incident response across products. txBet may reference
Predictefy's architecture and environment-variable names, but it must not copy its
identity, secret values, databases, hosted services, or infrastructure.

## 4. System boundaries

### 4.1 Web application — Vercel

The existing Next.js application gains:

- Privy login and verified server-session handling.
- Trading onboarding and funding instructions.
- Automation-grant creation, renewal, and revocation.
- Strategy and risk settings.
- Live opportunities, executions, fills, positions, and audit history.
- User kill switch and an operator-only global kill switch.
- In-app notification inbox.
- Read-only replay/demo views with the permanent simulated-execution disclosure intact.

The web application never receives raw wallet private keys, Privy authorization private
keys, DFlow keys, RPC secrets, database service-role keys, or decrypted venue secrets.
It does not expose a generic signing endpoint.

### 4.2 Market-data worker — Railway

An always-on worker maintains:

- TxLINE mainnet real-time World Cup fixture and event state.
- Polymarket catalog, rule text, tick size, `negRisk`, status, order books, and trades.
- Current DFlow fixed-host health plus
  `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE`/`DFLOW_OUTPUT_NOT_EXACT` shadow signals. It does
  not invent a Kalshi catalog, outcome mint, settlement link, or eligibility record from
  historical 404 pages. It never receives the DFlow execution key or user wallet context.
- Canonical contracts and settlement fingerprints.
- Versioned contract links and public-book-only executable opportunity snapshots.

TxLINE establishes sports-event truth and fixture identity. Venue APIs establish the
contracts, executable prices, balances, and order state. TxLINE odds are never treated
as a substitute for executable venue depth.

### 4.3 Execution worker — Railway

A separate always-on worker owns:

- Strategy evaluation for opted-in users.
- Budget reservation and exposure locks.
- Venue-specific preflight, artifact construction, signing, submission, and cancellation.
- Reconciliation, compensation, redemption, and risk pausing.
- DFlow fixed-host schema/fixture validation only; no DFlow user quote, artifact, signer,
  write RPC, submitted attempt, or live adapter exists while its documentation gate is
  closed.
- Notification and audit outbox production.

Only this worker can access the txBet Privy authorization key, DFlow production key,
RPC write endpoints, and the envelope-encryption key used for venue credentials.

### 4.4 Supabase Postgres

Postgres is the source of truth for user controls, normalized contracts, execution
intents, state transitions, and reconciliation. Postgres-backed jobs use transactional
claims (`FOR UPDATE SKIP LOCKED`) and an outbox; phase one does not require Redis.

## 5. Identity, wallets, and onboarding

1. A user opens Privy's modal through
   `useLogin().login({ loginMethods: ["google"] })`. txBet does not use the direct
   `useLoginWithOAuth` flow because automatic wallet creation does not apply to that custom
   flow.
2. txBet verifies the Privy access token server-side through the current Node SDK method
   `privy.utils().auth().verifyAuthToken(token)` and binds the Privy DID to exactly one
   txBet account.
3. `PrivyProvider` configures both
   `embeddedWallets.ethereum.createOnLogin: "all-users"` and
   `embeddedWallets.solana.createOnLogin: "all-users"`, producing exactly one embedded EVM
   and one embedded Solana wallet for the user.
4. The user reviews txBet's automation scope, budgets, expiry, and emergency-loss limit.
5. The user explicitly adds txBet's authorization quorum as a signer to both wallets,
   with txBet-specific policies and a maximum seven-day expiry.
6. Polymarket onboarding deploys or discovers the user's official type-3 deposit wallet,
   verifies that the embedded EOA is `ownerSignerAddress` and the deposit wallet is the
   separate order signer/maker/funder, derives the user's CLOB credentials, and configures
   only current pUSD/CTF approvals needed by the armed exchange contracts.
7. DFlow onboarding remains unavailable and shadow-only because there is no current
   official delegated-user eligibility/KYC or market-to-mint contract. It cannot mint an
   eligible record or activate trading from a historical response.
8. The user funds Polygon and Solana independently. txBet displays balances and required
   gas reserves but does not bridge funds automatically.

`wallets` records store only Privy wallet identity, chain/kind, chain-correct public
address, ownership revision, and timestamps. Versioned `venue_accounts` store each
venue's Safe/proxy/deposit/funder binding. `automation_grants` and
`automation_grant_venues` store grant expiry, policy versions, and per-venue authority.
This prevents seven venues or successive grants from overwriting shared-wallet state.
No table stores private keys.

Polymarket CLOB API credentials are user-specific secrets. They are encrypted with
authenticated envelope encryption before persistence, excluded from application logs,
and decrypted only inside the execution worker for the shortest practical interval.

## 6. World Cup contract model

"All World Cup markets" means catalog and matcher coverage for every market family. It
does not mean ambiguous contracts may trade. Each venue contract is normalized into a
versioned settlement specification containing at least:

- Competition and edition.
- Tournament stage, group, round, and fixture identity.
- Participant identity: team, player, manager, or other named entity.
- Proposition family and statistic.
- Comparator, threshold, range, units, and rounding rules.
- Evaluation period: regulation, extra time, penalties, whole tournament, or dated
  interval.
- Draw, tie, dead-heat, and shared-winner treatment.
- Postponement, abandonment, cancellation, rescheduling, and void rules.
- Qualification, advancement, elimination, and replacement-team semantics.
- Resolution source, resolution deadline, and dispute/revision behavior.
- Outcome polarity and payout currency/amount.
- Raw rule-text hash, source URL, venue revision, and retrieval timestamp.

The matcher proves equivalence field by field. Titles, embeddings, and language-model
similarity may suggest candidates but are never settlement evidence. A pair is executable
only when:

- Both specifications are complete and current.
- Every settlement field is equal or transformed by a reviewed deterministic rule.
- The selected outcomes are mutually exclusive and collectively exhaustive.
- Fixed payouts and unit sizes are compatible.
- Neither venue reports a pause, close, revision, or resolution transition.

Unknown or conflicting fields produce `UNVERIFIED`, not a guessed match. Operator
overrides are versioned, attributable, reviewable, and automatically invalidated when
either venue changes its rule text or contract version.

## 7. Opportunity calculation

For each verified complementary pair, the deterministic engine:

1. Reads fresh executable acquisition-cost levels for both venues. A direct-buy venue uses
   asks. The Polymarket candidate derives a synthetic acquisition cost from finalized
   complete-set inventory cost minus current executable bid proceeds for selling the
   undesired outcome, plus all split/sell/recovery costs.
2. Walks equal exact-share depth and chooses only quantity available on both legs. A
   Polymarket synthetic level is bounded by both exclusively reservable complete-set
   inventory and FOK sell depth at its `minPrice`.
3. For each fixed gross FOK order, proves the minimum and maximum net outcome over every
   permitted price, maker/multi-level allocation, and fee-rounding path. Both bounds must
   exactly equal the same canonical hedge quantity; otherwise the candidate is shadow-only.
4. Computes total entry cost, venue fees, network fees, priority fees, approval/setup
   costs where applicable, slippage, and a configurable safety buffer.
5. Computes the worst-case fixed payout for every exhaustive outcome.
6. Applies wallet balances, outstanding reservations, user budgets, platform ceilings,
   concentration limits, close times, and quote freshness.
7. Requires both the 1.00% net-return floor and the $0.10 net-profit floor.

All internal money and payout calculations use integer microdollars. Chain token amounts
use integers/bigints or canonical decimal strings and are converted only at explicit
currency boundaries. Floating-point values cannot authorize an order.

An opportunity snapshot includes the exact quote/book revisions, settlement-spec
versions, fee schedule versions, amount, expected payout, expected cost, safety buffer,
expiry, and a deterministic bundle hash.

## 8. Execution protocol

### 8.1 Durable state machine

The bundle state machine is:

`DETECTED -> RESERVED -> PREPARING -> PREPARED -> SUBMITTING -> RECONCILING`

It then proceeds to one of these recovery or terminal states:

- `MATCHED` — both equal legs are authoritatively filled.
- `NO_TRADE` — neither leg filled and no residual order remains.
- `COMPENSATING` — both original orders are authoritatively terminal/no-working, their
  cumulative actual net fills are unequal, and automatic bounded recovery is active.
- `COMPENSATED` — the automatic unwind completed and the residual position is authoritatively flat.
- `BOUNDED_RESIDUAL` — permitted compensation completed within the cumulative loss budget,
  but a known nonzero residual remains within its explicitly recorded bound.
- `UNHEDGED` — no legal bounded compensation exists, compensation failed, or the allowed
  unwind loss is insufficient.
- `INVALID` — persisted or upstream data violates an invariant.

`MATCHED`, `NO_TRADE`, `COMPENSATED`, and `BOUNDED_RESIDUAL` are terminal for the
bundle's automated workflow. A bounded residual remains observable and keeps the user's
automation paused; later manual resolution is stored as a linked record rather than
rewriting the terminal bundle. `UNHEDGED` and
`INVALID` activate the relevant kill switch and require reconciliation/operator review.

Each bundle contains two immutable leg intents. Every build, sign, submit, cancel,
reconcile, fill, and compensation attempt receives its own idempotency key and append-only
record. A unique venue reference or chain signature cannot belong to two attempts.

### 8.2 Final gate

Immediately before signing, and again immediately before broadcast, txBet rechecks:

- Persisted profile-wallet ownership, the current server-inspected signer policy/grant,
  grant expiry, and txBet's Privy service authorization. Unattended workers never receive,
  store, or require a user's browser access token or live browser session.
- User and platform kill switches.
- Per-order, daily, strategy, and total budgets.
- Available balances, token approvals, gas/priority-fee reserves, and existing exposure.
- Contract status, settlement-spec version, and venue rule revision.
- Book freshness, equal executable depth, fees, net return, and close-time buffer.
- Venue, RPC, database, clock, and websocket health.

Failure of the first gate releases a pre-submit reservation and returns `NO_TRADE`
without signing. Failure of the second gate occurs after signing but before either
`SUBMIT_STARTED` marker: it persists the signed-abort evidence, releases only through the
pre-submit release function, and returns `NO_TRADE` without broadcasting. Once a
submit-start marker exists, only reconciliation may release accounting capacity.

### 8.3 Prepared parallel submission

Cross-chain atomicity is impossible. To minimize skew:

1. Build and validate both unsigned venue artifacts without broadcasting them.
2. Persist both encrypted artifacts/hashes and mark both legs `PREPARED`.
3. Run the signing gate against the same immutable bundle hash.
4. Persist `SUBMITTING` before the first Privy signing network call.
5. Sign both artifacts, persist both encrypted signed artifacts, and verify their hashes.
6. Simulate every signed artifact using the exact bytes/body that would be submitted.
7. Run a second immediate broadcast gate against current grants, balances, books,
   close/expiry/chain-height bounds, health, and the same artifact hashes.
8. Persist durable `SUBMIT_STARTED` markers and deterministic locators for both legs in
   one transaction before either network submission.
9. Dispatch both legs concurrently with a bounded start skew.
10. Enter reconciliation regardless of whether either HTTP/RPC response is lost.

No network timeout is interpreted as a failed order. Unknown results are reconciled by
order ID, client ID, transaction signature, wallet, market, amount, and submission
window. Blind submission retries are forbidden.

## 9. Venue adapters

### 9.1 Polymarket international

The adapter uses the pinned unified `@polymarket/client@0.1.0-beta.16` and:

- Fetches current tick size and `negRisk` before building.
- Uses the official `POLY_1271` type-3 deposit-wallet path. It binds the Privy embedded EOA
  as `ownerSignerAddress` and the deposit wallet separately as order signer, maker, and
  funder, then verifies the ERC-7739-wrapped signature through ERC-1271.
- Uses current six-decimal pUSD collateral, CTF, CTF Exchange, and Neg Risk CTF Exchange
  addresses from the frozen official baseline.
- Pins the unified beta and requires Node 24. Its optional Privy peer expects `^0.15.0`
  while txBet uses `0.26.x`, so live signing is quarantined until an adapter-level
  compatibility test proves the official `@polymarket/client/privy` `signerFrom` boundary.
- Keeps direct FOK BUY shadow-only because its `amount` is USD notional and does not
  guarantee exact shares, even with `maxSpend` and `maxPrice`.
- Prepares exact complete-set inventory before arming an opportunity by splitting pUSD and
  proving finalized equal balances of both outcomes. One fenced reservation owns each set.
- For the only current exact-share candidate, prepares a marketable `FOK` SELL of exactly
  `shares` of the undesired outcome with a bound `minPrice`. A full sell leaves the exact
  desired shares; a killed sell leaves the complete set unchanged for release or a
  separately persisted merge.
- Persists and validates the unified SDK's bigint order draft before the signature and
  posts only the field-identical order. Split, merge, and order workflows never use a
  one-shot helper that hides the mutation boundary.
- Proves split/sell/merge atomic amounts, finality, exclusive inventory ownership, all
  price/maker/fee paths, pUSD and gas cost, and unknown-state recovery. Until all candidate
  tests and independent review pass, Polymarket remains shadow-only.
- Derives HMAC authentication from the user's encrypted CLOB credentials without logging
  them.
- Tracks order/trade transitions through the authenticated user websocket and confirms
  them with REST reconciliation.
- Treats websocket disconnect, heartbeat failure, `RETRYING`, and unknown chain state as
  reconciliation conditions, not clean failure.
- Supports cancellation, position reads, fills, redemption/claim, and compensating orders.

### 9.2 Kalshi through DFlow/Solana

There is currently no live DFlow adapter. The shadow lane:

- Allowlists only `https://quote-api.dflow.net` and `wss://quote-api.dflow.net`; the old
  `b.quote-api` and `a.prediction-markets-api` hosts are rejected/quarantined.
- Parses current exact-input `/order` and `/order-status` official shapes. It records the
  expected output, minimum output, `maximumOutcome: null`, and the documented statuses;
  `closed` alone is not a fill.
- Omits `userPublicKey` from shadow `/order` requests so DFlow cannot return a user-signable
  transaction. The lane creates no profile candidate, executable quote, reservation, or
  user-wallet request.
- Runs complete Solana-message hostile-mutation tests only against sanitized offline
  fixtures with fake keys.
- Registers no `LiveVenueAdapter`, Privy signer wrapper, write-capable Solana RPC,
  compensation, redemption, or cleanup mutation.

Future promotion requires new official discovery, immutable Kalshi-market/outcome-mint,
delegated-user eligibility/KYC, and redemption contracts plus exact net-output proof. Only
then may the full byte-identity, simulation, submit-once, and read-only reconciliation
design be implemented and independently reviewed.

## 10. Residual exposure and compensation

If unequal fills are known while either original order remains working, unknown, or has
an unknown cancellation outcome, txBet pauses that user's new execution, preserves the
worst-case reservation, and cancels/polls. It does not freeze a residual or compensate
while a late original fill can still change the exposure.

Once both original orders are authoritatively terminal with no working remainder, any
unequal cumulative actual net fills—one zero/one positive or two positive but different—
create one immutable residual revision. Then txBet:

1. Stop new executions for that user.
2. Confirm no original order remains working or cancellation-unknown.
3. Refresh both actual positions, the opposite venue, and unwind venue books.
4. Choose the lowest-loss deterministic compensation that restores a bounded position.
5. Require the user-set emergency-loss limit and the platform ceiling (lower of 5% or
   $5).
6. Persist and submit the compensation as a new linked intent.
7. Atomically reserve each attempt's worst-case loss against a bundle-level cumulative
   compensation budget. Realized loss, fees, setup cost, and network cost from every
   attempt consume that one budget; retries never reset it.
8. Reconcile until the exposure is flat or provably bounded.
9. Notify the user and operator with the full audit trail.

If no allowed unwind exists, txBet does not exceed the approved loss limit. It records
`UNHEDGED`, leaves automation paused, and surfaces the exact remaining position and
manual venue link.

If a permitted compensation action succeeds but leaves a known nonzero position, txBet
records `BOUNDED_RESIDUAL`, the exact atomic position, maximum loss, cumulative realized
loss, and remaining compensation budget. It never labels that outcome `COMPENSATED`.

## 11. Risk controls

- Per-user order, rolling-day, strategy, and total capital budgets.
- Platform hard limits of $100/order and $1,000/rolling 24 hours/user.
- Per-contract, per-fixture, per-team, per-venue, and aggregate exposure limits.
- Seven-day maximum automation grant with immediate revocation.
- User, venue, contract, data-source, and global kill switches.
- Automatic pause on residual exposure, expired authorization, stale data, rule revision,
  venue degradation, database uncertainty, or reconciliation backlog.
- Separate `disabled`, `shadow`, `canary`, and `live` execution modes. Production defaults
  to `disabled`; changing mode is an audited operator action.
- Canary allowlist and $10 aggregate real-money ceiling.
- No execution solely to prove that execution works. A live canary requires a genuine
  qualifying World Cup arbitrage.

## 12. Persistence model

The minimum durable tables are:

| Area | Tables / purpose |
|---|---|
| Identity | `profiles`, `wallets`, `automation_grants`, `venue_accounts` |
| Controls | `strategies`, `risk_limits`, `risk_state`, `kill_switch_events` |
| Markets | `fixtures`, `venue_contracts`, `settlement_specs`, `contract_links` |
| Pricing | `quote_snapshots`, `opportunities`, `fee_schedule_versions` |
| Execution | `execution_bundles`, `execution_legs`, `execution_attempts`, `fills` |
| Portfolio | `positions`, `balance_snapshots`, `redemption_intents` |
| Recovery | `reconciliation_jobs`, `compensation_intents`, `worker_leases` |
| Evidence | `audit_events`, `outbox_events`, `notifications` |

Every mutable aggregate carries a version for optimistic concurrency. Irreversible
transitions use database transactions and constraints, not best-effort in-memory flags.
User-facing tables use row-level security. Workers use a separate least-privilege service
role. Append-only execution/audit records cannot be updated through public APIs.

## 13. API surface

Authenticated user APIs cover:

- Session/profile and wallet readiness.
- Automation grant/renew/revoke.
- Strategy and risk settings.
- Funding addresses and balances.
- Opportunities and settlement evidence.
- Executions, legs, fills, positions, compensation, and redemptions.
- Notification inbox.
- User kill-switch activation and guarded reset.

Operator APIs cover execution mode, allowlists, global/venue kill switches, contract-link
review, reconciliation escalation, and audit inspection. Operator routes require a
separate role and recent authentication.

There is no generic `sign`, `sendTransaction`, `relay`, or arbitrary-calldata endpoint.
Every signing path is venue-specific, schema-validated, owner-bound, amount-bounded, and
allowlisted.

## 14. Secrets and environment contract

Implementation may inspect Predictefy-related repositories to learn variable names and
integration contracts. It must never print, copy, commit, or silently import their secret
values. txBet defines its own `.env.example` and production secret set for:

- TxLINE mainnet guest JWT/API token and allowed host.
- Privy app/client IDs, app secret, authorization key/quorum, and policy IDs.
- DFlow production API key and allowed hosts.
- Polygon and Solana RPC endpoints.
- Supabase/Postgres public and worker credentials.
- Polymarket public endpoints and any official builder/relayer credentials required by
  the selected onboarding path.
- Envelope-encryption key/KMS binding.
- Email provider credentials.
- Operator identity allowlist and execution-mode controls.

Development secrets remain in ignored local environment files. Production secrets live
in Vercel/Railway/Supabase secret stores. All configured upstream URLs are HTTPS/WSS,
host-allowlisted, and validated before credentials are attached.

## 15. Notifications and observability

In-app and email notifications are emitted for:

- Grant creation, renewal warning, expiry, and revocation.
- Strategy activation/deactivation.
- Bundle submitted, matched, refused, canceled, or reconciled.
- Partial/unmatched fill, compensation started/completed/blocked.
- Kill-switch activation/reset.
- Deposit, balance, approval, gas, or eligibility problems.
- Redemption availability and completion.

Structured logs use correlation IDs and redact credentials, authorization headers,
signed payload bodies, and personal data. Metrics cover stream freshness, opportunity
age, submit skew, fill latency, reconciliation age, unknown attempts, residual exposure,
worker leases, and notification failures. Alerts are driven from durable states, not log
text alone.

## 16. Testing strategy

Implementation follows test-driven development.

### Pure/unit tests

- Settlement normalization and every supported World Cup semantic field.
- Complement/exhaustiveness proofs and ambiguous-rule rejection.
- Integer money, fee, depth, slippage, gas, payout, and budget calculations.
- State-machine transition legality and idempotency.
- Policy, grant-expiry, kill-switch, and compensation-limit decisions.

### Adapter contract tests

- Official Polymarket and DFlow response fixtures.
- Unified Polymarket beta pin/Privy compatibility, owner versus deposit-wallet binding,
  pUSD/contracts, direct-BUY shadow refusal, exact split/merge inventory, exact-share FOK
  SELL draft/signature, HMAC headers, and REST/WebSocket status normalization.
- DFlow exact-host/schema and documentation-gate tests plus offline transaction decoding,
  message binding, owner/outflow/program/mint allowlists, and blockhash expiry over
  sanitized fake-key fixtures. Tests prove no DFlow signature, write RPC, or broadcast
  surface exists.
- Malformed payloads, unknown fields/programs, partial data, timeouts, rate limits, and
  venue rejection.

### Database/integration tests

- Migrations, row-level security, constraints, job claims, outbox delivery, rolling spend,
  and concurrent workers.
- Crash at every boundary: before/after reservation, persistence, signing, submission,
  acknowledgment, fill, compensation, and notification.
- Lost responses and duplicate delivery never create duplicate orders.

### End-to-end tests

- Google/Privy onboarding with mocked wallets, then real development-app smoke.
- Both wallet funding/readiness flows.
- Shadow opportunity through durable `NO_TRADE` and `MATCHED` simulations.
- Injected one-leg fill through compensation and user pause.
- Grant expiry/revocation and global kill-switch behavior.
- Vercel/Railway/Supabase production-shaped staging deployment.

### Live canary

The Polymarket candidate live gate requires txBet-specific credentials, finalized and
exclusively reservable complete-set inventory, funded embedded wallets, all
automated checks green, independent security review, and a real qualifying opportunity.
Total authorized exposure is capped at $10. The canary is reconciled through final fills
or proven no-fill state and any resulting position is redeemed or explicitly documented.
DFlow is not eligible for this gate under the current baseline.

## 17. Rollout gates

The four values below control **new entry** execution only:

1. **Disabled:** schemas, UI, and read paths only; new-entry signing is impossible.
2. **Shadow:** live inputs and durable decisions, but no new-entry signing or submission.
3. **Canary:** explicit user/operator allowlist and $10 aggregate ceiling.
4. **Live:** automatic execution for opted-in users under their limits and platform caps.

Promotion requires green verification, zero unresolved `UNKNOWN`, `BOUNDED_RESIDUAL`,
or `UNHEDGED` records,
healthy streams/workers, tested kill switches, and an audited operator action. Rollback
disables new entries but never disables read-only reconciliation. Compensation,
cancellation, and redemption are controlled separately by `recovery_action_mode` and may
sign/submit only for a pre-existing persisted position/attempt, a current fixed venue
policy, an active user grant, and the original bounded authorization. The audited
`recovery_action_mode = frozen` emergency switch prohibits every new signature and
broadcast, including recovery actions; reconciliation/alerts continue and the UI exposes
manual venue controls. Tests cover rollback with an existing residual in both enabled and
frozen recovery modes.

Kill switches are typed; a marker never evaluates an unqualified boolean. The persisted
action matrix is:

| Switch class | New entry | Cancel existing order | Compensation | Redemption | Read-only reconciliation |
|---|---|---|---|---|---|
| user/global/strategy entry pause or unresolved residual | block | allow under recovery gates | allow under recovery gates | allow under recovery gates | allow |
| quote/market-data source untrusted | block | allow only with independent fresh order-status evidence | block actions priced by that source | allow only with independent fresh resolution evidence | allow and flag evidence |
| settlement/contract semantics invalid | block | allow risk-reducing cancellation | block | block | allow and alert |
| affected venue write path, wallet, credential, signer, or policy compromised | block affected write | block affected write | block affected target; an independently certified unaffected venue may hedge an authoritative residual | block affected write | allow reads when trustworthy |
| `recovery_action_mode=frozen` or unhealthy recovery path | block promotion/reservation | block | block | block | allow and send urgent manual-action alerts |

Cancellation, compensation, and redemption marker functions receive an explicit action
and subject and apply only its matrix cells. They also recheck grant, venue certification,
typed eligibility, freshness, and immutable authorization. Cancellation and redemption
reserve per-attempt maximum network-plus-setup cost against immutable cumulative total-
cost ceilings; unknown retains the bound and final receipts realize cost exactly once.

## 18. Phase-two venue expansion

After the Polymarket pre-split/FOK-SELL candidate is independently proven and the DFlow lane
has completed its no-live-surface shadow certification, the same adapter and state-machine
contracts extend in this order. DFlow live promotion remains independently gated by all
missing discovery, binding, eligibility, redemption, and exact-output rules above:

1. Opinion.
2. Predict.fun.
3. Limitless.
4. SX Bet.
5. Hydromancer.

Each venue needs official current documentation, an explicit artifact allowlist, fee and
settlement verification, adapter-level tests, shadow evidence, and its own canary before
arming. Rain is excluded.

## 19. Definition of done

- Every phase-one component in this specification is implemented and documented.
- Polymarket can reach canary only through the independently approved pre-split
  complete-set plus exact-share FOK-SELL path. Direct FOK BUY remains shadow-only. DFlow is
  honestly reported as shadow-only unless every missing official contract and exact-output
  certification exists; a mocked success or minimum-output quote does not satisfy this
  definition of done.
- Existing deterministic engine behavior and replay/simulation disclosures remain intact.
- All money remains integer microdollars internally.
- No generic signer or arbitrary relay exists.
- No Predictefy secret/infrastructure dependency exists.
- Lint, strict TypeScript, unit, integration, adapter, E2E, and production build checks pass
  through `pnpm verify` plus the new database/live-worker suites.
- A clean production-shaped deployment passes shadow mode and kill-switch drills.
- Independent review finds no unresolved critical/high security or correctness issue.
- The live canary runs only if a genuine qualifying World Cup opportunity exists; absence
  of such an opportunity is reported honestly rather than bypassing strategy gates.

## 20. Official references

- TxLINE quickstart: <https://txline.txodds.com/documentation/quickstart>
- TxLINE World Cup service: <https://txline.txodds.com/documentation/worldcup>
- Privy embedded wallets: <https://docs.privy.io/wallets/overview/embedded>
- Privy automatic wallet creation:
  <https://docs.privy.io/basics/react/advanced/automatic-wallet-creation>
- Privy login modal (`useLogin`):
  <https://docs.privy.io/authentication/user-authentication/ui-component>
- Privy access-token verification:
  <https://docs.privy.io/authentication/user-authentication/access-tokens>
- Privy server signers: <https://docs.privy.io/wallets/using-wallets/signers>
- Privy signer quickstart and policies:
  <https://docs.privy.io/wallets/using-wallets/signers/quickstart>
- Polymarket trading quickstart: <https://docs.polymarket.com/trading/quickstart>
- Polymarket order creation: <https://docs.polymarket.com/trading/orders/create>
- Polymarket unified TypeScript SDK: <https://docs.polymarket.com/dev-tooling/typescript>
- txBet Polymarket frozen baseline: [Polymarket API baseline](../../references/polymarket-api-baseline.md)
- Polymarket authenticated user channel:
  <https://docs.polymarket.com/market-data/websocket/user-channel>
- DFlow production endpoints: <https://pond.dflow.net/get-started/endpoints>
- DFlow `GET /order`: <https://pond.dflow.net/resources/trading-api/order/order>
- DFlow `GET /order-status`:
  <https://pond.dflow.net/resources/trading-api/order/order-status>
- DFlow Privy wallet integration: <https://pond.dflow.net/resources/recipes/wallets/privy>
- DFlow documentation index: <https://pond.dflow.net/llms.txt>
- txBet DFlow frozen baseline: [DFlow API baseline](../../references/dflow-api-baseline.md)
- Kalshi authenticated requests:
  <https://docs.kalshi.com/getting_started/quick_start_authenticated_requests>
- Kalshi order API reference: <https://docs.kalshi.com/api-reference/orders/create-order-v2>
- Opinion Open API overview:
  <https://docs.opinion.trade/developer-guide/opinion-open-api/overview>
- Predict.fun developer API: <https://dev.predict.fun/>
- Limitless programmatic API:
  <https://docs.limitless.exchange/developers/programmatic-api>
- SX Bet API reference: <https://docs.sx.bet/api-reference/introduction>
- Hydromancer HIP-4 API: <https://hydromancer.xyz/hip-4>
- Hyperliquid HIP-4 outcome markets:
  <https://hyperliquid.gitbook.io/hyperliquid-docs/hyperliquid-improvement-proposals-hips/hip-4-outcome-markets>
