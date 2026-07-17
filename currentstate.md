# txBet current state

Last updated: 2026-07-17 (Asia/Kuala_Lumpur)

This is the live delivery ledger for txBet. Update it whenever a milestone,
verification result, blocker, or scope decision changes. Source code and tests
remain the source of truth when this file and the repository disagree.

## Product objective

txBet is a World Cup event-triggered exact-complement scanner. TxLINE match
events wake a deterministic scan of reviewed prediction-market contracts. The
engine proceeds only when the contracts, executable depth, costs, freshness,
inventory, permissions, and execution evidence agree exactly.

`hydromancer` remains the canonical internal venue/configuration ID. The public
landing page displays that venue as **Hyperliquid**; the UI alias does not rename
backend policy, environment, adapter, or persistence contracts.

The hackathon deployment target is now **one Next.js application on Vercel**.
Next.js route handlers own auth, control, public-data reads, and the scheduled
agent wakeup. Private Vercel Blob is attached to that project for the
hash-chained control/execution journal; there is no deployed Supabase service,
standalone database, or separate worker in the quick MVP.

The exact-inventory Polymarket adapter and its one-POST ambiguity normalizer are
now implemented and tested, but they are not registered into the Cron cycle. A
future durable orchestrator must persist the prepared/signed artifacts and the
`submit_started` claim between adapter phases before registration. The
paired cycle remains structurally shadow-only because the second DFlow leg lacks
official production exact-output/eligibility contracts, and the Polymarket
outcome-token route still needs an explicitly authorized operator-wide CTF
approval plus a supported unattended Privy signing configuration. A separate
authenticated `POST /api/execution/dflow/order` manual canary can now submit one
reviewed World Cup exact-input order after delegated-wallet, signed-response,
simulation, atomic budget, and submit-once checks. It is not called by Cron or
the paired strategy.

## Status legend

| State | Meaning |
|---|---|
| DONE | Implemented and backed by passing focused tests |
| IN PROGRESS | Actively being implemented or re-verified |
| BLOCKED | Cannot safely proceed without an external dependency or new evidence |
| DEFERRED | Intentionally outside the quick MVP |
| SHADOW ONLY | Uses real or replayed observations but cannot move funds |

## Quick MVP definition

The quick MVP is complete only when all of these are true:

- [x] A deterministic World Cup replay can demonstrate event-to-scan behavior.
- [x] Money calculations use integer microdollars and exact atomic quantities.
- [x] Unknown settlement, stale evidence, bad depth, and ambiguous execution fail closed.
- [x] A credential-safe TxLINE client can authenticate, fetch a score snapshot,
      and observe the official score stream when configured.
- [x] TxLINE World Cup observations are available to the browser through a
      bounded server route or deterministic replay fallback.
- [x] The browser labels replay observations as replay and REST observations as
      live-unverified. It never implies Solana verification from REST alone.
- [x] Google OAuth sign-in is wired through Privy.
- [x] Privy automatically creates one embedded EVM wallet and one embedded
      Solana wallet for an authenticated user.
- [x] The authenticated browser can show the user's wallet addresses without
      exposing signing authority to generic client routes.
- [x] Real Polymarket public market data can feed one explicitly reviewed World
      Cup pair at a time through a read-only path with market-identity bindings.
- [x] Scanner output is shown in the console as `SHADOW_ONLY` with explicit
      reason codes and no money-mutation capability.
- [x] Authenticated users can persist a versioned disabled/shadow/canary request
      and a user-selected $1-$10 cap in a private, ETag-CAS Vercel Blob journal.
- [x] Vercel Cron can discover those private journals, run the World Cup shadow
      scan, and append one tamper-evident observation for each newly seen
      control-version/shadow-status state.
- [x] The scheduled cycle has no live submission callback and records zero
      Polymarket submissions and zero DFlow mutations.
- [x] An authenticated, same-origin, explicitly confirmed DFlow route can submit
      one reviewed World Cup exact-input canary under the persisted $10 ceiling.
- [x] The permanent replay/simulated-execution disclosure remains visible.
- [ ] The latest full `pnpm verify` rerun is blocked by unrelated worktree parse
      errors in `txbet-console.tsx` and `tasks/reference-stadium-pitch/score-types.ts`.
      The last clean baseline passed 924 tests and an optimized build; the new
      DFlow boundary passes its focused tests, lint, and scoped typecheck.
- [x] Credential-free production browser QA passes for landing, console,
      deterministic fallback, matched/no-trade replay paths, reduced-motion,
      and a 390 x 844 mobile viewport.
- [ ] Configured-origin browser QA passes for Privy Google login, embedded EVM
      and Solana wallet addresses, and a configured TxLINE observation. BLOCKED
      until operator-owned txBet credentials and allowed origins are supplied.

The replay demo and scheduled agent do **not** place, approve, cancel, or settle
real-money orders. The manual DFlow route is the one exception: it can submit a
configured exact-input canary, returns only `submitted` or `unknown`, and never
claims a synchronous fill. Polymarket remains unregistered and unreachable from
the deployed Cron/control routes.

## Current implementation inventory

| Area | State | Current evidence | MVP action |
|---|---|---|---|
| Landing page and replay console | DONE | Existing SSR, replay, pipeline, and UI tests | Preserve disclosures and add live/shadow status |
| Exact settlement matcher | DONE | Settlement and market-truth tests | No change unless review finds a defect |
| Depth/cost optimizer | DONE | Optimizer and pipeline tests | Reuse for shadow candidates |
| Execution state machine and recovery | DONE | Execution and crash-recovery tests | Keep mutation adapters unregistered |
| TxLINE guest auth/snapshot/SSE | DONE | `tests/txline.test.ts`, `tests/txline-smoke.test.ts` | Keep credentials server-only |
| TxLINE live-to-browser integration | DONE | No-store API, strict browser parser, fallback UI, 20 focused tests, and unconfigured production browser QA pass | Configure an operator-owned feed and exercise the live-unverified path |
| TxLINE Solana proof validation | DEFERRED | Official contract documented; no verified app integration | MVP shows honest proof status; full `validateStat` is M2 |
| Privy bearer session boundary | DONE | 33 focused session tests | Integrate into routes |
| Privy official SDK adapter | DONE | Official SDK adapter and focused tests pass | Keep verification material server-only |
| Privy React provider | DONE | Google-only provider, automatic dual-chain wallet config, strict wallet summarizer tests, and unconfigured browser state pass | Configure an operator-owned app and exercise login/address rendering |
| Polymarket public client/HMAC/credentials | DONE | Focused adapter tests passed before review | Keep credentials server-only |
| Polymarket World Cup scanner | DONE for one reviewed pair | Wire order/identity corrections, credential-free no-store API, strict browser parser, and shadow UI pass focused tests | Expand to the complete reviewed World Cup catalog in M2 |
| Polymarket pUSD allowance planning | DONE for revoke/bounded ERC-20 | 34 focused tests pass | New operator-wide CTF approvals are forbidden |
| Polymarket CTF `setApprovalForAll` | BLOCKED | On-chain permission is operator-wide, not token-bounded | Requires explicit isolated-wallet design before M3 |
| Polymarket cancellation | DONE at artifact layer / BLOCKED for canary | Atomic claim and authenticated-request tests pass; no database repository exists | Implement database claim only in M2 |
| Polymarket exact-inventory live adapter | DONE at isolated adapter boundary / BLOCKED for production | Runtime intent canonicalization, attempt/prepared-artifact submission-key binding, shared artifact verification, exact FOK SELL, tamper, ambiguity, and one-POST-per-invocation tests pass | Add durable prepared/signed/submit-started orchestration, then close approval, supported SDK/Privy, delegated signer, production factory, and reconcile blockers before registration |
| DFlow/Kalshi | MANUAL CANARY / AGENT SHADOW | Reviewed World Cup binding allowlist, signed DFlow response verification, delegated Privy signing, lookup-free transaction checks, simulation, Blob CAS claim, $10 cumulative cap, and one Solana send are tested; exact output and redemption remain absent | Configure reviewed bindings/programs and delegated signer policy; keep Cron/paired execution shadow-only |
| Vercel private execution journal | DONE | Private Blob reads, ETag CAS writes, hash-chain validation, durable request-key/hash replay, mutation throttling, final-disable reserve, and hard event/history bounds pass focused tests | Configure the project Blob store and run the first-write collision smoke check |
| Vercel scheduled agent | DONE for shadow | Bearer-only Cron route, rotating 100-profile batches, per-profile failure isolation, state-change-only observation writes, and zero-mutation cycle tests pass | Vercel Pro is required for the checked-in one-minute schedule |
| Supabase/database deployment | DEFERRED | Legacy foundation scaffolding remains in-repo but is outside the deployed path | Do not provision for the hackathon MVP |

## Safety-review ledger

### P0 items

| Finding | State | Closure evidence |
|---|---|---|
| Forged Polymarket contract object could redirect an approval spender | DONE | Hostile-property regression added; 34 allowance/contract tests pass |
| Final gate accepted malformed non-finite runtime evidence or invalid stages | DONE | Strict deep runtime boundary returns `INVALID_GATE_EVIDENCE`; 312 focused and 416 execution tests pass |
| Polymarket wire books were interpreted in the opposite order | DONE | Official worst-first wire order is reversed to best-first; 59 market-truth tests pass |
| Cancellation marker did not prevent a second DELETE after restart | DONE | Atomic claim makes existing or ambiguous submissions reconcile-only; 14 focused tests pass |

### Deferred live-canary blockers

- Bind fresh balance and allowance snapshots to account, asset, spender, block,
  revision, observation time, and expiry at signing and broadcast.
- Bind every gasless typed-data field to chain 137, the deposit wallet, verifying
  contract, calls, calldata, value, deadline, nonce, and semantic operation hash;
  then recover the local signer before submission.
- Prove at most one hidden `/submit` using the executed pinned SDK and current
  Privy adapter, not a hand-written generator or source-map string.
- Bind credential deployment evidence to chain, owner, deposit wallet,
  factory/beacon/code revision, and verification source.
- Authenticate encrypted credentials against account revision and the canonical
  signer/deposit-wallet binding.
- Keep the public-client abort deadline active through response-body consumption.
- Redact encrypted envelopes and ciphertext in logs.
- Require an explicit user-approved isolated-wallet policy before any
  operator-wide CTF permission can be created.
- Resolve the installed Polymarket beta SDK's declared Privy peer range or pin a
  combination officially supported by both projects.
- Provision unattended Privy delegated authorization/key-quorum policy without
  persisting an expiring browser JWT.
- Compose the tested adapter with production market binding, allowance,
  inventory, position, and unique-order reconciliation readers before registry
  registration.

### M1 read-only surface review

| Finding | State | Closure evidence |
|---|---|---|
| Polymarket scan clock was sampled before public network I/O | DONE | Injectable clock is sampled before and after I/O; post-fetch freshness/close regressions pass |
| A self-consistent but stale/future Polymarket review could remain accepted | DONE | Pinned identity reviews reject future timestamps and expire after the existing 24-hour contract-review window |
| Repeated browser reads could amplify into repeated public CLOB fan-out | DONE | One-second server single-flight/cache is capped by candidate expiry; browser response remains `no-store` |
| Public TxLINE status reads could fan out without an upstream deadline | DONE | One four-second abort signal covers guest auth, snapshot headers, and body consumption; one-second single-flight/cache tests pass |
| Stale or unconfirmed TxLINE rows could be labeled live | DONE | Server and strict browser schema require `confirmed: true` and age at most 30 seconds |
| TxLINE freshness was sampled before public network I/O | DONE | A second clock sample validates freshness and computes age after snapshot body consumption |
| A clock rollback could extend the TxLINE cache lifetime | DONE | The reader preserves a monotonic high-water mark, clears cache, and fails closed on invalid or decreasing time |

Independent re-review reported no remaining prioritized finding in the M1
Polymarket surface. The final cross-cutting and targeted TxLINE re-reviews report
no remaining P0, P1, or P2 finding.

### One-app Vercel review

| Finding | State | Closure evidence |
|---|---|---|
| More than 100 historical profiles could stop the whole Cron cycle | DONE | Deterministic rotating batches process at most 100 profiles and report discovered, processed, deferred, and failed counts |
| One corrupt or unavailable profile could starve every peer | DONE | Per-profile reads and observation writes fail that profile closed while the cycle continues |
| Per-minute Cron rewrote an ever-growing monolithic journal | DONE | Cron reads each selected journal once and writes only the first observation for a new control-version/shadow-status state; the journal is hard-capped |
| Control idempotency header was discarded or could be reused ambiguously | DONE | The durable key and canonical request hash bind the resulting version; matching races replay, stale/different reuse returns conflict |
| Loaded UI understated an existing cap or expiry | DONE | Current persisted maximum and UTC expiry render separately from the proposed next 24-hour grant |
| Unqueried venue balances appeared as observed `$0.00` | DONE | The account menu renders `Not loaded` until an authoritative balance adapter supplies evidence |

## Milestones

### M1 — quick hackathon MVP

Goal: one Vercel-hosted, real-data-capable World Cup demo with Google login,
automatic embedded wallets, one explicitly reviewed Polymarket pair,
versioned user controls, scheduled deterministic shadow execution, and honest
TxLINE/Solana provenance.

Exit gate:

1. Every code-owned checkbox in **Quick MVP definition** is complete; the
   configured-origin checkbox stays visibly blocked until credentials exist.
2. No route or registered Cron adapter can move funds.
3. Live-data failure falls back only to a clearly labeled deterministic replay.
4. `pnpm verify` and browser QA pass.

### M2 — complete World Cup shadow coverage

Goal: move from the one-pair MVP to every supported, explicitly reviewed World
Cup market without parsing display titles as settlement evidence.

Required work:

- Persist a versioned reviewed catalog instead of passing one review artifact
  through an environment variable.
- Discover every active World Cup candidate from official venue catalog APIs,
  then require a human-reviewed settlement fingerprint before scanning it.
- Replace the pre-reviewed comparison quote in the MVP artifact with a second
  fresh public venue adapter. DFlow/Kalshi remains the first target.
- Route qualifying TxLINE events into fixture-scoped scans; keep the independent
  live-status panel as provenance evidence.
- Add refresh scheduling, catalog revision handling, book streaming, shadow-soak
  metrics, and browser pagination without weakening freshness or identity gates.
- Implement and validate TxLINE `validateStat` proof handling before displaying
  any observation as Solana-verified.

### M3 — controlled Polymarket canary

Goal: one narrowly bounded Polymarket route with a platform ceiling of $10 total
exposure, explicit user limits, no hidden retry, and crash-safe reconciliation.

Required before enablement:

- All deferred live-canary blockers above are closed.
- Private Blob journal recovery, conflict, replay, and unique-submit claims pass
  destructive and concurrency tests; a database is not required for the
  hackathon deployment.
- Operator-wide CTF authority has an explicit, reviewed isolated-wallet policy.
- Signing and broadcast gates re-read fresh balances, permissions, books, fees,
  gas, health, and account deployment evidence.
- Unknown submission outcomes freeze entry and force reconciliation.
- An independent security review returns no P0/P1 live-money findings.

### M4 — additional venue promotion

Goal: promote another venue beyond M2 shadow use only when official documentation and adapter-level
evidence cover discovery, quote, order semantics, authentication, cancellation,
fill reconciliation, settlement, and legal availability. DFlow/Kalshi paired
automation remains structurally shadow-only until that gate passes; the manual
exact-input canary is intentionally narrower.

## Verification ledger

| When | Command/scope | Result |
|---|---|---|
| 2026-07-17 earlier baseline | `pnpm verify` | PASS: lint, typecheck, build, production audit, 69 files / 475 tests |
| 2026-07-17 | Privy session + environment tests | PASS: 47 tests |
| 2026-07-17 | Polymarket allowance + contract tests after review fix | PASS: 34 tests |
| 2026-07-17 | Final-entry gate | PASS: 312 focused tests; 416 execution tests |
| 2026-07-17 | Market truth and reviewed Polymarket identity | PASS: 59 tests |
| 2026-07-17 | Polymarket cancellation restart fence | PASS: 14 tests |
| 2026-07-17 | TxLINE World Cup status service and route | PASS: 8 tests plus typecheck |
| 2026-07-17 | Privy provider and embedded-wallet summary | PASS: 5 focused tests; combined auth/landing/Privy run passed 46 tests |
| 2026-07-17 | Browser live-status widgets and API integration | PASS: 7 files / 39 tests |
| 2026-07-17 | Privy embedded-wallet CSP sources | PASS: 5 security/proxy tests and scoped lint |
| 2026-07-17 | Polymarket shadow surface after review fixes | PASS: 23 integration tests, focused lint, typecheck, clean independent re-review |
| 2026-07-17 | Browser QA against isolated production server | PASS: desktop landing/console, matched and no-trade paths, reduced motion, 390 x 844 mobile console, no-store fallback APIs, 0 console errors, 0 warnings |
| 2026-07-17 | CSP browser regression | PASS: report-only policy no longer upgrades local HTTP requests; production build and security/proxy tests pass |
| 2026-07-17 | Full verification before final TxLINE review fixes | PASS: production audit threshold (0 high/critical; 2 moderate transitive paths), lint, typecheck, 79 files / 866 tests, optimized build and route generation |
| 2026-07-17 | TxLINE deadline, cache, confirmation, freshness, client cap, and rollback regressions | PASS: RED observed for every finding, then 4 files / 36 tests, focused lint, and typecheck |
| 2026-07-17 | Final independent cross-cutting and targeted re-reviews | PASS: no remaining P0/P1/P2 finding; no approve/sign/submit/cancel/settle route found |
| 2026-07-17 | Final verification after review fixes | PASS: production audit threshold (0 high/critical; 2 moderate transitive paths), lint, typecheck, 79 files / 877 tests, optimized build and route generation |
| 2026-07-17 | Final sanitized production smoke | PASS: console disclosures present; both read-only APIs return 200, `no-store`, and explicit unconfigured/non-executable states |
| 2026-07-17 | Honest-boundary panel sync | PASS: 79 files / 878 tests, optimized build, desktop and 390 px browser checks, and zero console errors or warnings |
| 2026-07-17 | One-app Vercel execution MVP | PASS: production audit threshold, lint, typecheck, 87 files / 909 tests, and optimized build with dynamic control/Cron routes |
| 2026-07-17 | Final one-app Vercel review fixes | PASS: production audit threshold (0 high/critical; 2 moderate transitive paths), lint, typecheck, 88 files / 924 tests, and optimized build with dynamic control/Cron routes |
| 2026-07-17 | Manual DFlow live-canary boundary | PASS: 25 files / 171 focused tests, scoped ESLint, scoped TypeScript, clean diff check, and independent security review after wallet-debit and freshness fixes |
| 2026-07-17 | Latest full `pnpm verify` attempt | BLOCKED before the DFlow gates by unrelated unclosed syntax in `src/components/dashboard/txbet-console.tsx` and `tasks/reference-stadium-pitch/score-types.ts`; those concurrent files were left untouched |

The two moderate production-audit paths are the same transitive `uuid`
`GHSA-w5hq-g745-h8pq` advisory (installed 8.3.2 and 9.0.1, patched at 11.1.1)
reached through Privy -> x402 -> wagmi -> wallet connectors. No broad
major-version override was applied. Report-only CSP still records informational
inline-style violations from current UI style attributes; it produced no browser
error or warning, but must be resolved or explicitly documented before CSP
enforcement.

## External blockers and required user actions

1. Real TxLINE browser data requires a valid activated `TXLINE_API_TOKEN` and a
   World Cup fixture/competition selection. Secrets must stay in local/deployment
   environment storage and must never be copied into this file.
2. Privy login requires valid app configuration, allowed origins, Google login,
   and embedded EVM/Solana wallet creation enabled for the same app.
3. Vercel requires a private Blob store, `BLOB_READ_WRITE_TOKEN`, and a
   32-character-or-longer `CRON_SECRET`. The checked-in every-minute Cron
   schedule requires a Vercel plan that supports that frequency. Before the
   demo, run one real-Blob concurrent first-write smoke check because the
   official SDK documents ETag precondition failures more clearly than
   duplicate create-only failures.
4. The Polymarket MVP accepts exactly one versioned reviewed pair through
   `POLYMARKET_WORLD_CUP_SHADOW_REVIEW_JSON`. Blank means intentionally
   unconfigured. The comparison quote must remain integrity-bound and fresh.
5. A real Polymarket canary additionally requires the isolated CTF approval,
   supported SDK/Privy pairing, delegated signer policy, funded inventory, and
   production reconciliation listed above. Supplying secrets alone does not arm it.
6. The final codebase-memory graph refresh is tooling-blocked because the MCP
   transport closed before indexing began. This does not affect source, tests,
   browser QA, or the production build; refresh the generated graph when that
   service is available again.

No Predictefy identity, secrets, or infrastructure will be copied into txBet.
The user may configure equivalent txBet-owned services through local or
deployment environment storage.

## Official references used for M1

- TxLINE: [quickstart](https://txline.txodds.com/documentation/quickstart),
  [World Cup guide](https://txline.txodds.com/documentation/worldcup), and
  [score snapshot API](https://txline.txodds.com/api-reference/scores/get-snapshots-for-each-action-in-the-latest-score-events-for-a-fixture).
- Privy: [React provider setup](https://docs.privy.io/basics/react/setup),
  [automatic Ethereum and Solana wallet creation](https://docs.privy.io/basics/react/advanced/automatic-wallet-creation),
  and [web CSP requirements](https://docs.privy.io/security/implementation-guide/content-security-policy).
- Polymarket: [official market discovery](https://docs.polymarket.com/market-data/fetching-markets)
  and [public CLOB order-book API](https://docs.polymarket.com/api-reference/market-data/get-order-book).
- Vercel: [Cron Jobs](https://vercel.com/docs/cron-jobs),
  [managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs), and
  [private Blob downloads](https://vercel.com/docs/vercel-blob/private-storage).
- DFlow: the official developer Metadata OpenAPI and production Quote API
  evidence are pinned in `docs/references/dflow-api-baseline.md`.
- Node.js 24: official [`AbortSignal.timeout()`](https://nodejs.org/docs/latest-v24.x/api/globals.html#static-method-abortsignaltimeoutdelay)
  contract used to bound the complete TxLINE REST read.

These references were re-fetched on 2026-07-17 before implementation. Pinned
schemas and captured fixtures remain fail-closed if an upstream response drifts.
The local `txline_skill.md` was also used as integration context; the official
TxLINE documentation above remains authoritative when the two disagree.

## Local verification commands

```bash
pnpm vitest run tests/venues/polymarket/allowances.test.ts
pnpm vitest run tests/execution/final-gate.test.ts
pnpm vitest run tests/market-truth/quote-normalization.test.ts
pnpm vitest run tests/venues/polymarket/cancellation.test.ts
pnpm vitest run tests/server/world-cup-status.test.ts tests/server/world-cup-route.test.ts
pnpm vitest run tests/server/polymarket-world-cup-shadow.test.ts tests/server/polymarket-world-cup-shadow-route.test.ts
pnpm vitest run tests/world-cup-live-status.test.tsx tests/polymarket-shadow-status.test.tsx tests/console-mvp.test.tsx
pnpm vitest run tests/execution/polymarket-live-adapter.test.ts tests/venues/polymarket/order-workflow.test.ts
pnpm vitest run tests/server/vercel-blob-journal.test.ts tests/server/vercel-blob-store.test.ts tests/server/vercel-execution-control.test.ts tests/server/vercel-execution-control-route.test.ts tests/server/vercel-execution-cycle.test.ts tests/server/vercel-cron-route.test.ts
pnpm vitest run tests/execution/dflow tests/server/dflow-canary-budget.test.ts tests/server/dflow-canary-service.test.ts tests/server/dflow-live-order-route.test.ts tests/server/dflow-live-quote.test.ts tests/server/dflow-privy-signer.test.ts tests/server/dflow-signed-response.test.ts tests/server/dflow-solana-rpc.test.ts tests/server/vercel-blob-journal.test.ts tests/server/vercel-env.test.ts tests/server/vercel-execution-control.test.ts tests/server/vercel-execution-control-route.test.ts
pnpm typecheck
pnpm lint
pnpm verify
```

Legacy database checks are optional and are not part of the Vercel MVP:

```bash
pnpm db:start
pnpm test:db
```

## Decisions

- Scope is World Cup and International Friendlies only for the hackathon.
- TxLINE mainnet service level 12 is the documented real-time World Cup option;
  level 1 is the delayed option. Network, program, subscription, guest JWT, and
  activation host must always match.
- A TxLINE REST/SSE observation is not called Solana-verified until the matching
  proof has been checked against the official on-chain program/root.
- Polymarket public reads may be live in M1. All Polymarket mutations remain off.
- The deployed M1 topology is one Next.js project plus its attached private
  Vercel Blob store and Vercel Cron; there is no Supabase deployment or
  separately operated worker.
- M1 scans one reviewed pair at a time. “All World Cup markets” is the tracked M2
  catalog-expansion milestone, not an implicit title-matching shortcut.
- ERC-1155 `setApprovalForAll` is operator-wide. Metadata cannot make it bounded.
- DFlow/Kalshi manual exact-input canaries are allowed only through the dedicated
  authenticated route; Cron and paired execution remain shadow-only.
- No secrets or infrastructure are copied from another repository.
- No git commit or push is performed without explicit user authorization.

## Change log

- 2026-07-17: Created the milestone ledger and defined the quick MVP.
- 2026-07-17: Closed the forged Polymarket approval-spender escape.
- 2026-07-17: Quarantined creation of operator-wide CTF approvals; revocation only.
- 2026-07-17: Closed the final-gate, Polymarket book-order/identity, and cancellation P0 findings.
- 2026-07-17: Added Google-only Privy login with automatic EVM and Solana embedded wallets.
- 2026-07-17: Added a credential-safe, no-store TxLINE World Cup status API with explicit `LIVE_UNVERIFIED` provenance.
- 2026-07-17: Added the one-pair, reviewed-identity Polymarket public-book shadow API and non-executable browser status.
- 2026-07-17: Integrated both read-only live boundaries beside permanent replay and simulated-execution disclosures.
- 2026-07-17: Closed post-I/O freshness, review-age, and public-request amplification findings; independent re-review returned clean.
- 2026-07-17: Removed `upgrade-insecure-requests` from report-only development CSP after production browser QA exposed the local-HTTP regression.
- 2026-07-17: Completed credential-free desktop, reduced-motion, mobile, API, and replay browser QA with zero console errors or warnings.
- 2026-07-17: Passed the final release command: 79 files, 866 tests, lint, typecheck, audit threshold, and optimized production build.
- 2026-07-17: Closed final-review TxLINE fan-out, deadline, stale-row, and unconfirmed-row P2 findings with RED-first regression tests.
- 2026-07-17: Closed post-I/O freshness, strict browser age, and cache-clock rollback findings; targeted re-review returned clean.
- 2026-07-17: Passed the final post-review release command: 79 files, 877 tests, lint, typecheck, audit threshold, optimized build, and sanitized production smoke.
- 2026-07-17: Synced the landing-page honest-boundary panel to the M1 delivery ledger without exposing live-money controls.
- 2026-07-17: Added the one-app Vercel lane: private Blob journal, authenticated versioned user controls, bounded Cron discovery, and a zero-mutation scheduled shadow cycle.
- 2026-07-17: Added the exact-inventory Polymarket adapter with normalized typed evidence, Privy signing boundary, FOK SELL validation, and ambiguous one-POST handling; kept it unregistered until durable phase persistence and the other production blockers are closed.
- 2026-07-17: Updated the DFlow gate for the official developer-only Metadata market/mint mapping while retaining the production shadow-only decision.
- 2026-07-17: Added the capped manual DFlow World Cup canary route with delegated Privy signing, simulation, atomic Blob claim, and submit-once Solana broadcast; paired automation remains shadow-only.
