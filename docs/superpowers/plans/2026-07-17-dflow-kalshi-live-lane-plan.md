# DFlow/Kalshi Shadow Lane and Deferred Live Gate Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a production-shaped Kalshi-through-DFlow documentation/schema shadow lane while keeping user-profile quotes, reservation, Privy signing, and Solana broadcast structurally unreachable until DFlow publishes current official prediction-market discovery, eligibility/KYC, and exact-outcome contracts.

**Architecture:** txBet implements fixed-host parsers for the current exact-input DFlow Trading API and offline hostile-mutation validation over sanitized unsigned-transaction fixtures. No current official source authoritatively maps the Kalshi catalog to outcome mints or attests delegated-user eligibility/KYC, so no DFlow market binding becomes executable and no live adapter is registered. The future signing/broadcast design remains documented but cannot be wired into a worker until the named official gates are refreshed and proven. txBet never holds or requests a native Kalshi RSA key.

**Tech Stack:** the current DFlow Trading API at `quote-api.dflow.net`, `@solana/web3.js`, Privy Node SDK for a deferred live gate only, Zod, base58/ed25519 verification, Solana JSON-RPC, Supabase Postgres, Vitest, and sanitized official-shape transactions.

## Global Constraints

- Re-fetch DFlow endpoints, `GET /order`, `GET /order-status`, the documentation index, Privy wallet recipe, and any newly published prediction-market discovery/eligibility pages before Task 1.
- As of 2026-07-17, DFlow's current documentation index has no prediction-market catalog, Kalshi market-to-mint mapping, or delegated-user eligibility/KYC contract. The previously referenced pages return 404. This absence keeps the entire lane shadow-only regardless of fixture or mocked success.
- Mainnet hosts and API keys are server-only. DFlow `/order` is proxied through the backend because the official service does not support browser CORS.
- Do not claim a current DFlow/Kalshi outcome mint. Canonical Solana USDC and an exact
  official market/mint binding are future live prerequisites; fixtures use fake mints.
- Bind owner, destination, revert wallet, and prediction-market initialization payer to the user's embedded Solana wallet where the official API supports those fields.
- Reject Token-2022 on the path where DFlow's official FAQ states it is unsupported.
- Unknown programs, mints, writable destinations, signers, extra outflows, or account-table contents fail closed.
- Persist `SUBMITTING` before broadcast. Broadcast exactly once; timeout becomes `UNKNOWN`.
- A DFlow `closed` state alone does not prove a fill. Inspect fills, reverts, atomic deltas, balances, and Solana confirmation.
- No shadow path reserves money, asks Privy to sign, calls a write RPC, or registers a `LiveVenueAdapter`.
- Do not commit or push.

---

## Task 1: Install Solana Dependencies and Freeze the Official DFlow Baseline

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `src/server/config/env.ts`
- Modify: `tests/server/env.test.ts`
- Create: `docs/references/dflow-api-baseline.md`
- Create: `tests/fixtures/dflow/order-response.json`
- Create: `tests/fixtures/dflow/order-status-open.json`
- Create: `tests/fixtures/dflow/order-status-closed.json`
- Create: `tests/fixtures/dflow/error.json`
- Create: `tests/fixtures/dflow/unsigned-transaction.base64.txt`

- [ ] Re-fetch the official pages and record access date, production/dev hosts, auth header, query names, response fields, market/mint discovery, slippage fields, `lastValidBlockHeight`, status/fill/revert shapes, supported token programs, and eligibility behavior.

- [ ] Install and lock:

```bash
pnpm add @solana/web3.js bs58 @noble/ed25519
```

- [ ] Add blank txBet-owned variables:

```dotenv
DFLOW_API_BASE_URL=https://quote-api.dflow.net
DFLOW_WS_URL=wss://quote-api.dflow.net
DFLOW_API_KEY=
SOLANA_RPC_URL=
SOLANA_USDC_MINT=
DFLOW_PROGRAM_ALLOWLIST=
DFLOW_MAX_SWAP_SLIPPAGE_BPS=50
DFLOW_MAX_PREDICTION_MARKET_SLIPPAGE_BPS=50
```

At runtime, compare configured mint/program IDs against the current reviewed baseline. Configuration alone is not evidence.

- [ ] Extend `loadExecutionWorkerEnv` with the exact DFlow REST/WebSocket hosts and every DFlow/Solana value above. Do not configure a prediction-market catalog host. Add Zod tests that reject `b.quote-api.dflow.net`, the former `a.prediction-markets-api.dflow.net` host, arbitrary stream paths, malformed base58 mints/program lists, invalid slippage bounds, missing keys, and any Vercel/public-loader access to execution values.

- [ ] Create sanitized official-shape fixtures. The base64 transaction must be generated for tests from public fake keys and contain no real user, API, order, or funding data.

- [ ] Run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm audit --prod
```

Expected: pass with no critical/high production advisory.

- [ ] Review checkpoint; do not commit.

## Task 2: Quarantine Missing Discovery and Eligibility Contracts

**Files:**

- Modify: `docs/references/dflow-api-baseline.md`
- Create: `src/execution/venues/dflow/documentation-gate.ts`
- Create: `tests/execution/dflow/documentation-gate.test.ts`

- [ ] Write failing tests proving the gate returns `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE`
  when the current official source set lacks any one of: a complete prediction-market
  catalog contract, immutable Kalshi-market/outcome-mint binding, delegated-user
  eligibility/KYC response, and expiry/revision semantics.

- [ ] Reject and quarantine the historical prediction-market URLs and
  `a.prediction-markets-api.dflow.net`. A 404 page, cached fixture, Predictefy route, search
  result, or manually supplied URL is never promoted into an upstream client.

- [ ] Do not create a production prediction-market catalog client,
  `dflow_market_bindings`, or `dflow_profile_market_eligibility` from unavailable docs. No
  DFlow row may materialize `eligible` shared evidence and no DFlow contract link may become
  executable while this gate is closed.

- [ ] A sanitized historical fixture may be retained only as non-authoritative test data
  labeled with its original date and `executable: false`. It cannot supply a live market,
  mint, rule, KYC, geofence, redemption, or position binding.

- [ ] Re-open this task only after DFlow publishes current official replacements. At that
  point, revise the baseline first, add cursor/exhaustion and profile-isolation tests, then
  implement append-only bindings and exact action-scoped eligibility under the shared gate.

- [ ] Run:

```bash
pnpm vitest run tests/execution/dflow/documentation-gate.test.ts
```

Expected: the current baseline deterministically returns a typed shadow-only refusal and
offers no signing or reservation capability.

- [ ] Review checkpoint; do not commit.

## Task 3: Build Fixed-Host Shadow Parsers for `/order` and `/order-status`

**Files:**

- Create: `src/execution/venues/dflow/schemas.ts`
- Create: `src/execution/venues/dflow/client.ts`
- Create: `src/execution/venues/dflow/status.ts`
- Create: `src/execution/venues/dflow/shadow-quote.ts`
- Create: `tests/execution/dflow/schemas.test.ts`
- Create: `tests/execution/dflow/client.test.ts`
- Create: `tests/execution/dflow/status.test.ts`
- Create: `tests/execution/dflow/shadow-quote.test.ts`

- [ ] Write failing tests for exact-input query encoding, `x-api-key`, exact
  `https://quote-api.dflow.net` host enforcement, redirects, timeout, 4xx/5xx, malformed
  JSON, status 404/500, every documented status, fill/revert combinations, and secret
  redaction.

- [ ] Model the current request without inventing exact-output parameters:

```ts
export interface DFlowShadowOrderRequest {
  inputMint: string;
  outputMint: string;
  amountAtomic: AtomicAmount;
  slippageBps: number;
  predictionMarketSlippageBps: number;
}
```

`amountAtomic` is exact canonical-USDC input. The live hedge quantity is not sent because
the current official API has no exact-output field. The shadow client omits
`userPublicKey`, destination, revert wallet, and initialization payer so `/order` cannot
return a user-signable transaction.

- [ ] Construct `GET /order` with `URLSearchParams`, attach `x-api-key` only after exact
  host validation, disable redirects, and use a bounded abort signal. Production scheduling
  remains disabled while Task 2's documentation gate is closed; contract tests use
  sanitized official-shape fixtures and explicitly configured non-user test mints.

- [ ] Validate every response field and normalize expected output plus
  `otherAmountThreshold` as expected/minimum output. Set `maximumOutcome: null` and
  `exactOutcomeGuaranteed: false`; record `DFLOW_OUTPUT_NOT_EXACT` and
  `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE`.

- [ ] A DFlow shadow quote never implements or converts to `LiveVenueQuote`, never enters
  `scanVerifiedLinks`, and never reserves a user balance. There is deliberately no
  `ProfileProbeCandidate` or execution-worker quote-prober until the official catalog,
  mapping, eligibility, and exact-outcome gates all reopen.

- [ ] Parse `GET /order-status` fixtures by transaction signature plus
  `lastValidBlockHeight`. A read error/404/500 is `unknown`; `closed` is not a full fill
  without fills, reverts, and exact atomic evidence. The current shadow worker performs no
  production status polling because it never submits.

- [ ] Run:

```bash
pnpm vitest run tests/execution/dflow/schemas.test.ts tests/execution/dflow/client.test.ts tests/execution/dflow/status.test.ts tests/execution/dflow/shadow-quote.test.ts tests/server/upstream-url.test.ts tests/server/redaction.test.ts
```

Expected: all pass; every normalized quote is non-executable and no fixture path can create
a transaction or signing request.

- [ ] Review checkpoint; do not commit.

## Task 4: Decode and Strictly Validate Sanitized Solana Fixtures Offline

**Files:**

- Create: `src/execution/venues/dflow/transaction.ts`
- Create: `src/execution/venues/dflow/program-allowlist.ts`
- Create: `src/execution/venues/dflow/bounds.ts`
- Create: `tests/execution/dflow/transaction.test.ts`
- Create: `tests/execution/dflow/program-allowlist.test.ts`
- Create: `tests/execution/dflow/bounds.test.ts`

- [ ] Write failing mutations of the sanitized transaction for malformed base64, unsupported message version, blockhash mismatch, expired block height, fee-payer mismatch, unknown address lookup table, unknown program, Token-2022, unexpected signer, writable attacker account, wrong mint, wrong destination, extra SPL approval, multisig-shaped token instruction, excess USDC outflow, excess lamport transfer, and hidden transfer through a CPI-capable unknown program.

- [ ] Deserialize current legacy/versioned transaction formats represented by sanitized official-shape DFlow fixtures. Resolve every fake/test address lookup table through an injected read-only fixture/RPC boundary, bind the table account hash, and reject a lookup that changed between preparation and simulation. This module receives no production `/order` response while the documentation gate is closed.

- [ ] Decode every compiled instruction. The allowlist contains only reviewed current IDs for system, compute budget, associated token, classic SPL token, and DFlow prediction-market/routing programs required by the captured official path. An allowlisted program still receives instruction-specific account and data validation.

- [ ] Enforce:

  - fee payer is the embedded Solana wallet;
  - the embedded wallet is the only user-required signer;
  - canonical USDC is the only authorized input mint;
  - output is the exact verified outcome mint;
  - all wallet-controlled USDC outflow is `<=` reserved atomic spend;
  - lamport outflow is `<=` configured fee/rent reserve;
  - destination/revert/init payer equal the embedded wallet;
  - no delegate approval, close authority, owner change, multisig, or unrelated writable destination exists.

If the current official transaction requires an additional initialization payer/signer, add it only as an explicitly controlled txBet signer with a reviewed purpose and policy. Otherwise fail closed.

- [ ] Extract the fixture message bytes, recent blockhash, derived last-valid block height, resolved account list/hash, required signers, expected atomic deltas, and unsigned message SHA-256 into test evidence only. It never persists an executable artifact or exposes a signing method.

- [ ] Run:

```bash
pnpm vitest run tests/execution/dflow/transaction.test.ts tests/execution/dflow/program-allowlist.test.ts tests/execution/dflow/bounds.test.ts
pnpm typecheck
```

Expected: all malicious mutations are rejected and the good fixture passes.

- [ ] Review checkpoint; do not commit.

## Task 5: Prove the Shadow Lane Has No Signing Surface

**Files:**

- Create: `tests/execution/dflow/no-live-surface.test.ts`

- [ ] Write architecture tests proving the DFlow registry has no `LiveVenueAdapter`, no
  Privy signer wrapper, no write-capable Solana RPC client, and no exported function that
  accepts production transaction bytes for signing, simulation, or broadcast.

- [ ] Assert the execution worker cannot import a DFlow sign/send module and that all DFlow
  opportunity conversions return a typed shadow refusal before reservation.

- [ ] Keep the future signing proof in this plan only: after all official gates reopen, it
  must bind the exact persisted message to the verified Privy wallet, prove byte identity
  and ed25519 signatures, recheck block height, and require successful simulation. Do not
  create that production module during the current phase.

- [ ] Run:

```bash
pnpm vitest run tests/execution/dflow/no-live-surface.test.ts tests/execution/dflow/transaction.test.ts
```

Expected: all pass, and DFlow has zero reachable signing or write-RPC capability.

- [ ] Review checkpoint; do not commit.

## Task 6: Register Shadow Evidence, Not a Live Adapter

**Files:**

- Create: `src/execution/venues/dflow/shadow-adapter.ts`
- Create: `tests/execution/dflow/shadow-adapter.test.ts`

- [ ] Write failing tests proving the shadow adapter can validate and report sanitized
  quote/status evidence but cannot satisfy `LiveVenueAdapter`, prepare an artifact, reserve,
  sign, simulate, submit, cancel, compensate, or redeem.

- [ ] Register only the typed shadow reason set. The live venue registry must reject DFlow
  with both `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE` and `DFLOW_OUTPUT_NOT_EXACT`.

- [ ] Keep the future submit-once/reconciliation design dormant. Promotion requires current
  official market/mint/eligibility contracts, exact net-output proof, a reviewed complete
  Solana instruction allowlist, and adapter-level tests that persist `SUBMITTING` before one
  broadcast and reconcile every timeout. None of those future requirements may be mocked to
  open the registry.

- [ ] Run:

```bash
pnpm vitest run tests/execution/dflow/shadow-adapter.test.ts tests/execution/dflow/no-live-surface.test.ts tests/execution/dflow/status.test.ts
```

Expected: all pass and the live registry has no DFlow entry.

- [ ] Review checkpoint; do not commit.

## Task 7: Expose Read-Only Shadow Readiness Only

**Files:**

- Create: `src/execution/venues/dflow/shadow-readiness.ts`
- Create: `tests/execution/dflow/shadow-readiness.test.ts`

- [ ] Report only the official-documentation gate, exact-output gate, fixed endpoint health,
  and whether sanitized fixture validation passes. Do not query or display a user's balance,
  position, market eligibility, or redemption state without a current official market/mint
  binding.

- [ ] Do not implement compensation, redemption, token-account cleanup, or a manual
  transaction destination. There is no authoritative current DFlow prediction-market
  redemption or eligibility reference, and txBet must not infer one from historical pages or
  Predictefy.

- [ ] Tests assert every mutation method is absent and every readiness result carries
  `shadowOnly: true` plus the two blocking reason codes.

- [ ] Run:

```bash
pnpm vitest run tests/execution/dflow/shadow-readiness.test.ts tests/execution/dflow/no-live-surface.test.ts
```

Expected: all pass with no wallet mutation or user-fund path.

- [ ] Review checkpoint; do not commit.

## Task 8: Run the DFlow Shadow Contract Gate

**Files:**

- Create: `docs/dflow-kalshi-shadow-lane.md`
- Create: `docs/runbooks/dflow-shadow-readiness.md`
- Create: `scripts/smoke-dflow.ts`
- Modify: `package.json`

- [ ] Add `dflow:smoke` that checks the exact documented REST/WebSocket hosts and parses a non-transaction fixture response. It does not accept a wallet flag, query a user wallet, call a historical catalog, request an order transaction, or sign/broadcast.

- [ ] Document the Kalshi-through-DFlow boundary, lack of native Kalshi keys, missing official discovery/eligibility authority, exact-input/minimum-output limitation, quarantined historical URLs, offline transaction-fixture validation, and absence of every live mutation surface. Describe future byte-identity, simulation, submit-once, reconciliation, compensation, and redemption only as blocked promotion requirements.

- [ ] Document that the fetched baseline lacks discovery/eligibility and is exact-input/minimum-output. Phase-one acceptance is a production-shaped schema/fixture shadow lane with no user-profile quote, signing, or reservation reachable. DFlow remains shadow-only until every current official prerequisite plus decoded transaction proof yields a finite exact outcome equal to the hedged quantity; mocked adapter success is not enough to promote it.

- [ ] Run:

```bash
pnpm vitest run tests/execution/dflow
pnpm test:db
pnpm dflow:smoke
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
git diff --check
```

Expected: every automated command passes. The fixed-host shadow smoke succeeds, reports both blocking reason codes, and never reads or moves user funds.

- [ ] Search for unsafe Solana paths:

```bash
rg -n "sendRawTransaction|sendTransaction|signTransaction|skipPreflight|maxRetries|Token2022|TOKEN_2022" src tests
```

Expected: no production DFlow signing, sending, write-RPC, adapter, redemption, or cleanup path exists; any matches are test-only assertions or explicitly deferred documentation.

- [ ] Review `git status --short`; do not commit or push.
