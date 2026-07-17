# Polymarket Shadow Lane and Exact-Share Canary Candidate Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement international Polymarket onboarding, keep direct USD-notional FOK BUY shadow-only, and prove a venue-specific pre-split-complete-set plus exact-share FOK-SELL canary candidate that reconciles through authenticated websocket plus REST evidence.

**Architecture:** The user's Privy embedded EVM wallet is the deposit wallet's
`ownerSignerAddress`; it is not the type-3 CLOB order signer. txBet discovers or creates the
official deposit wallet, whose address is bound separately as `orderSignerAddress`, maker,
and funder for `POLY_1271`. It derives user-specific CLOB credentials, encrypts them at rest,
and allows only the current pUSD/CTF Polygon contracts. The adapter builds an immutable typed
order, obtains the owner's ERC-7739-wrapped signature through Privy, verifies the deposit
wallet's ERC-1271 binding, submits once, and reconciles by client/order/trade identifiers.

**Tech Stack:** the pinned unified `@polymarket/client@0.1.0-beta.16`, Privy Node SDK, viem, AES-256-GCM, Zod, Polygon RPC, WebSocket, Vitest, and sanitized official-shape fixtures.

## Global Constraints

- Re-fetch the official Polymarket trading quickstart, order creation, authenticated user channel, authentication, allowances, and wallet onboarding pages before Task 1.
- The current official docs win over Predictefy code. Predictefy supplies patterns only, never credentials, identity, infrastructure, or stale contract constants.
- New official API users use the current deposit-wallet onboarding path and `POLY_1271`/signature type `3` when that is what the official account reports. On this path, the deposit wallet is order signer, maker, and funder; the embedded owner EOA produces the underlying ERC-7739-wrapped owner signature. Existing accounts may report another supported type; discover and verify it, never guess.
- Use marketable `FOK` for arbitrage entry. Do not inherit a legacy `FAK` assumption.
- The unified SDK's FOK BUY is USD-notional and cannot guarantee exact shares, so direct
  BUY stays shadow-only. The only current exact-share candidate is finalized pre-split
  complete-set inventory followed by an exact-share FOK SELL of the undesired outcome;
  this candidate is also shadow-only until its full inventory and adapter gate passes.
- Use current six-decimal pUSD collateral. Legacy Polygon USDC/USDC.e is not the CLOB v2 collateral binding.
- Fetch current tick size and `negRisk` for each artifact build.
- Credentials and builder secrets are server-only, encrypted/redacted, and never stored in the browser.
- The unified client requires Node.js `>=24`. Its optional Privy peer currently names
  `@privy-io/node ^0.15.0`, while txBet uses `0.26.x`; signing remains quarantined until
  adapter tests prove the official `signerFrom` integration against the installed version.
- Allowances target only current reviewed exchange contracts and the exact required collateral/outcome tokens.
- A websocket event alone is not final authority; confirm with REST/chain evidence.
- Do not commit or push.

---

## Task 1: Install the Current Official SDKs and Freeze Sanitized Contract Fixtures

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.env.example`
- Modify: `src/server/config/env.ts`
- Modify: `tests/server/env.test.ts`
- Create: `tests/fixtures/polymarket/market.json`
- Create: `tests/fixtures/polymarket/book.json`
- Create: `tests/fixtures/polymarket/tick-size.json`
- Create: `tests/fixtures/polymarket/user-order.json`
- Create: `tests/fixtures/polymarket/user-trade.json`
- Create: `tests/fixtures/polymarket/error.json`
- Create: `docs/references/polymarket-api-baseline.md`

- [ ] Re-fetch official docs with Firecrawl and record access date, package names, supported chain ID, base URLs, signature types, deposit-wallet path, collateral token, exchange/neg-risk exchange discovery, authentication headers, FOK semantics, and websocket states in `docs/references/polymarket-api-baseline.md`.

- [ ] Install the official packages named by the current docs. At the known baseline this is:

```bash
pnpm add --save-exact @polymarket/client@0.1.0-beta.16 viem ws
pnpm add -D @types/ws
```

Do not add the legacy standalone CLOB, builder-relayer, or builder-signing clients: the
legacy relayer graph failed the high-severity production audit. If the unified beta version
changes, revise the baseline and rerun every adapter fixture, audit, and compatibility gate
before writing or promoting adapter code.

- [ ] Add blank txBet-owned environment names:

```dotenv
POLYMARKET_CLOB_URL=https://clob.polymarket.com
POLYMARKET_MARKET_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market
POLYMARKET_USER_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/user
POLYMARKET_GAMMA_URL=https://gamma-api.polymarket.com
POLYMARKET_RELAYER_URL=https://relayer-v2.polymarket.com/
POLYMARKET_CHAIN_ID=137
POLYMARKET_COLLATERAL_ADDRESS=0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB
POLYMARKET_CTF_ADDRESS=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
POLYMARKET_EXCHANGE_ALLOWLIST=["0xE111180000d2663C0091e4f400237545B87B996B","0xe2222d279d744050d28e00520010520000310F59"]
POLYMARKET_RELAYER_API_KEY=
POLYMARKET_RELAYER_API_KEY_ADDRESS=
```

Only `NEXT_PUBLIC_PRIVY_APP_ID` remains public.

- [ ] Extend `loadExecutionWorkerEnv` with every Polymarket value above and `loadMarketWorkerEnv` with only the public CLOB, Gamma, and market-websocket values. Add Zod tests for chain ID, both exact websocket paths, the exact relayer host, current checksum addresses, the complete exchange allowlist, the relayer key/address pair, and proof that Vercel/public loaders cannot read execution credentials. Relayer API-key auth is primary; builder HMAC is an optional, separately configured compatibility mode only if current official relayer docs require it.

- [ ] Save sanitized official-shape JSON fixtures with no real key, address, token, order, trade, or account identifier. Add a header to the baseline document explaining the sanitization.

- [ ] Run:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm audit --prod
```

Expected: install and typecheck pass; no critical/high production advisory.

- [ ] Add a compatibility test that instantiates `@polymarket/client/privy` `signerFrom`
  with txBet's installed `@privy-io/node`, verifies the exact wallet ID and authorization
  context for a fake official typed-data request, rejects response/binding drift, and never
  reaches a network submit. The peer-range mismatch is a hard live blocker until this test
  passes in the Node 24 worker runtime.

- [ ] Review checkpoint; do not commit.

## Task 2: Validate Public Catalog, Rule, Tick, `negRisk`, and Book Data

**Files:**

- Create: `src/venues/polymarket/public/schemas.ts`
- Create: `src/venues/polymarket/public/client.ts`
- Create: `src/venues/polymarket/public/catalog.ts`
- Create: `src/venues/polymarket/public/book.ts`
- Create: `tests/execution/polymarket/schemas.test.ts`
- Create: `tests/execution/polymarket/public-client.test.ts`
- Create: `tests/execution/polymarket/catalog.test.ts`
- Create: `tests/execution/polymarket/book.test.ts`

- [ ] Write failing tests for current official payloads, unknown enum values, malformed decimals, missing rule text, inactive/closed markets, invalid token IDs, tick mismatch, `negRisk` mismatch, stale books, redirects, timeouts, and host injection.

- [ ] Add cursor/page tests with a World Cup contract present only on a later page, repeated rows, advancing and echoing cursors, rate-limit recovery, restart from a persisted checkpoint, mid-scan failure, and contract removal after a complete scan.

- [ ] Implement one fixed-host public client with injected fetch/clock. Every response is parsed with versioned Zod schemas before normalization. Disable automatic redirects for any authenticated call.

- [ ] Normalize raw market/rules into the market-truth plan's catalog types. Missing settlement semantics remain `UNVERIFIED`; never fill a field from title similarity.

- [ ] Walk every official catalog page sequentially to cursor exhaustion, persist checkpoints after each committed page, and mark the scan `COMPLETE` only after the terminal cursor. Dedupe by immutable contract/revision ID. A partial scan never tombstones unseen contracts; a complete scan records tombstones/status transitions for previously current contracts that disappeared.

- [ ] Fetch tick size and `negRisk` at artifact preparation time, not only catalog time. Preserve source revision and retrieval time in evidence.

- [ ] Convert book decimals with `parseUsdMicros` and atomic quantity parsing. Do not call `Number()` on price or size strings for authorization.

- [ ] Produce the quote's cost evidence from the shared fee/network policy. The candidate
  includes the fully realized cost of preparing its exact complete-set inventory and any
  bounded merge/recovery cost, plus CLOB fees. A CLOB submit may have zero incremental chain
  fee only after deposit wallet, pUSD/CTF approvals, and finalized reserved inventory are
  authoritatively ready; otherwise mark the quote non-executable. Missing/expired fee policy
  never becomes zero.

- [ ] Run:

```bash
pnpm vitest run tests/execution/polymarket/schemas.test.ts tests/execution/polymarket/public-client.test.ts tests/execution/polymarket/catalog.test.ts tests/execution/polymarket/book.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 3: Discover or Create the Official Deposit Wallet and Bind Account Type

**Files:**

- Create: `src/execution/venues/polymarket/deposit-wallet.ts`
- Create: `src/execution/venues/polymarket/account.ts`
- Create: `src/execution/venues/polymarket/ownership.ts`
- Create: `src/execution/venues/polymarket/eligibility.ts`
- Create: `tests/execution/polymarket/deposit-wallet.test.ts`
- Create: `tests/execution/polymarket/account.test.ts`
- Create: `tests/execution/polymarket/ownership.test.ts`
- Create: `tests/execution/polymarket/eligibility.test.ts`

- [ ] Write failing tests for a new account, existing supported account types, EOA mismatch, Safe/proxy owner mismatch, wrong chain, wrong relayer host, unknown signature type, deployment timeout, duplicate request, post-deployment ownership verification, eligibility denial, geoblock denial, unavailable eligibility service, stale evidence, and attempts to spoof forwarding/location headers.

- [ ] Define:

```ts
export interface PolymarketAccountBinding {
  profileId: string;
  privyWalletId: string;
  ownerSignerAddress: `0x${string}`;
  orderSignerAddress: `0x${string}`;
  makerAddress: `0x${string}`;
  funderAddress: `0x${string}`;
  signatureType: 0 | 1 | 2 | 3;
  chainId: 137;
  discoveredAt: number;
  evidenceHash: string;
}
```

- [ ] Use the pinned unified secure client with primary relayer API-key auth at
  `https://relayer-v2.polymarket.com/`. For a new account, derive/request the official
  deposit wallet from factory `0x00000000000Fb5C9ADea0298D729A0CB3823Cc07`, wait through
  bounded status polling, then independently verify on Polygon that the embedded EOA is its
  owner and that the returned wallet is the deterministic factory address.

- [ ] Discover signature type from the official account/onboarding result. Assert the new-account path returns the documented `POLY_1271` type `3`, with `orderSignerAddress == makerAddress == funderAddress == depositWalletAddress` and a distinct `ownerSignerAddress`. Verify the owner's ERC-7739-wrapped signature through the deposit wallet's ERC-1271 path. Existing supported values remain usable only when their separately documented ownership and signing evidence matches.

- [ ] Persist the binding only after independent verification. Repeated onboarding returns the same binding; a changed owner signer, order signer, maker, funder, signature type, or factory derivation pauses the account and requires review.

- [ ] Implement the current official Polymarket eligibility/geoblock mechanism without changing, fabricating, or forwarding user-controlled IP/location headers. Bind fresh account/user eligibility evidence to onboarding and both execution gates. If the official mechanism can only see the Railway server region and cannot authoritatively attest the delegated user's eligibility, keep Polymarket execution shadow-only until an official supported delegated-server mechanism exists.

- [ ] Run:

```bash
pnpm vitest run tests/execution/polymarket/deposit-wallet.test.ts tests/execution/polymarket/account.test.ts tests/execution/polymarket/ownership.test.ts tests/execution/polymarket/eligibility.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 4: Encrypt and Derive User-Specific CLOB Credentials

**Files:**

- Create: `supabase/migrations/202607170005_polymarket_accounts.sql`
- Create: `supabase/tests/database/010_polymarket_credentials_test.sql`
- Create: `src/execution/venues/polymarket/credentials.ts`
- Create: `src/execution/venues/polymarket/hmac.ts`
- Create: `tests/execution/polymarket/credentials.test.ts`
- Create: `tests/execution/polymarket/hmac.test.ts`

- [ ] Reuse the foundation's tested AES-256-GCM envelope and write failing HMAC known-answer tests over timestamp + method + exact path + exact body, plus credential-specific AAD and redaction tests.

- [ ] Add `polymarket_accounts` keyed to `venue_accounts` with account binding, signature type, encrypted credential envelope, key ID/version, credential state, and timestamps. The web role can read safe readiness fields but cannot select ciphertext or write the table. Only the execution worker can access ciphertext.

- [ ] Implement an authenticated envelope format:

```ts
export interface EncryptedEnvelopeV1 {
  version: 1;
  keyId: string;
  algorithm: "aes-256-gcm";
  iv: string;
  ciphertext: string;
  authTag: string;
}
```

Use a random 96-bit IV, bind profile ID + venue account ID + credential version as additional authenticated data, and zero/shorten plaintext lifetime where the runtime permits. Never log plaintext or the envelope.

- [ ] Through the pinned unified client, initialize the verified owner signer with the bound deposit wallet and derive the current user CLOB authorization through its secure-client flow. Store any returned API key/secret/passphrase only inside the encrypted envelope. CLOB L2 credentials and relayer API keys are separate and are never substituted for one another.

- [ ] Implement HMAC signing from decrypted credentials for the exact serialized request body. Redact all auth headers and decrypted fields from success/error objects.

- [ ] Run:

```bash
pnpm db:reset
pnpm test:db
pnpm vitest run tests/server/envelope.test.ts tests/execution/polymarket/credentials.test.ts tests/execution/polymarket/hmac.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 5: Verify and Limit Collateral and Outcome-Token Allowances

**Files:**

- Create: `src/execution/venues/polymarket/allowances.ts`
- Create: `src/execution/venues/polymarket/contracts.ts`
- Create: `tests/execution/polymarket/allowances.test.ts`
- Create: `tests/execution/polymarket/contracts.test.ts`

- [ ] Write failing tests for wrong chain, collateral, spender, exchange, neg-risk exchange, proxy, unlimited approval policy, insufficient gas, stale contract config, and allowance-read failure.

- [ ] Load current Polygon pUSD, CTF, CTF Exchange, and Neg Risk CTF Exchange addresses from server configuration whose values exactly match `docs/references/polymarket-api-baseline.md`. Validate chain ID, six-decimal pUSD, and exact checksum addresses before use.

- [ ] Calculate the minimum required allowance for the armed strategy budget plus buffer. Do not approve unrelated contracts or a user-supplied spender. If current official SDK/onboarding requires a maximum approval, explicitly bind that method, token, and allowlisted spender in the Privy policy and document the rationale.

- [ ] Build only venue-specific approval plus exact split/merge actions exposed by the
  pinned unified client and sign them through the same Privy policy boundary. Bind pUSD,
  CTF condition/token IDs, amount, deposit wallet, and current contracts; there is no public
  approval, arbitrary transaction, or generic split/merge route.

- [ ] Verify on-chain receipt and resulting allowance before marking readiness. Timeout or reorg is unknown and reconciled; it is not retried blindly.

- [ ] Run:

```bash
pnpm vitest run tests/execution/polymarket/allowances.test.ts tests/execution/polymarket/contracts.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 6: Prove the Pre-Split Inventory and Exact-Share FOK SELL Candidate

**Files:**

- Create: `supabase/migrations/202607170006_polymarket_inventory.sql`
- Create: `supabase/tests/database/011_polymarket_inventory_test.sql`
- Create: `src/execution/venues/polymarket/order.ts`
- Create: `src/execution/venues/polymarket/inventory.ts`
- Create: `src/execution/venues/polymarket/split-merge.ts`
- Create: `src/execution/venues/polymarket/signing.ts`
- Create: `tests/execution/polymarket/order.test.ts`
- Create: `tests/execution/polymarket/inventory.test.ts`
- Create: `tests/execution/polymarket/split-merge.test.ts`
- Create: `tests/execution/polymarket/signing.test.ts`

- [ ] Write failing tests that keep every direct FOK BUY shadow-only, including all
  `amount`/`maxSpend`/`maxPrice` combinations. Add candidate-path failures for missing or
  unfinalized complete-set inventory, wrong condition/outcome pair, unequal outcome balances,
  reused reservation, split/merge reorg or timeout, non-FOK SELL, wrong `shares` or
  `minPrice`, insufficient sell depth, fee/atomic rounding, wrong owner signer/order
  signer/maker/funder/token/exchange/side/outcome, malformed ERC-7739 wrapping, failed
  ERC-1271 verification, `negRisk` drift, Privy peer incompatibility, and signed artifact
  mutation.

- [ ] Before an opportunity is armed, use the unified client's
  `prepareSplitMarketPosition` workflow to create an exact, finalized complete set from pUSD.
  Persist split intent before signing, reconcile its relayer/on-chain finality, and record
  exact atomic pUSD/YES/NO deltas and total gas/relayer cost. The inventory service reserves
  one complete set exclusively to one bundle with a fencing token; a pending, forked,
  partially observed, already reserved, or stale set is unavailable.

- [ ] Build a typed SELL of the undesired outcome from the immutable live intent and current
  market/inventory evidence. Bind into the prepared payload:

```text
owner signer address
order signer address
maker
funder/deposit wallet
token ID
exchange address
side SELL
undesired outcome
exact shares
minPrice
complete-set inventory ID/revision
split finality and balance-evidence hash
bigint offered amount
bigint requested amount
fee rate
nonce
salt
expiration
signature type
order type FOK
tick size
negRisk
client order ID/idempotency key
```

- [ ] Prepare a market SELL through the pinned unified client with exact decimal-string
  `shares`, bound `minPrice`, and `orderType: OrderType.FOK`. The `shares` must equal both
  sides of the reserved complete set and the bundle's canonical hedge exactly. Do not use
  the one-shot `placeMarketOrder` helper: persist and validate the bigint draft before
  signing, then submit only the field-identical signed order through the explicit post
  boundary. Before reservation, enumerate every execution price, maker split, multi-level
  allocation, and fee-rounding path. The resulting
  `minimumNetVenueQuantity` and `maximumNetVenueQuantity` must both exactly equal the
  retained desired-outcome shares from inventory and their proof must match
  `netOutcomeBoundsHash`. A full gross FOK sell with any fee mechanism that reduces the
  retained desired outcome is shadow-only. Adapter-level proof
  must inspect the unified SDK's bigint `offeredAmount` and `requestedAmount`, then compare
  the signed wire order's integer-string `makerAmount` and `takerAmount` exactly against
  independently derived bigint/rational values before signing or submission.

- [ ] If the SELL is authoritatively killed/unfilled, the complete set must remain unchanged
  and its reservation can be released only after exact balance proof. It may then be retained
  for later inventory or merged through a separately persisted
  `prepareMergeMarketPosition` workflow. Unknown sell or merge state retains the reservation
  and blocks reuse. Split, SELL, and merge costs all count in profitability and risk.

- [ ] Reconciliation checks SELL fills plus both outcome and collateral balance deltas. If
  the retained desired shares or disposed undesired shares differ from the exact pre-trade
  bounds, record the
  exact residual, pause, and compensate; this is anomaly recovery, never a substitute for
  proving equal bounds before entry. A nominal FOK fill is not labeled matched by itself.

- [ ] Choose the highest `minPrice` that still proves the exact undesired shares are fully
  marketable at reserved depth and keeps the complete inventory/sell/fee cost inside the
  opportunity authorization. Quantize exactly to the current tick; reject rather than
  silently widen.

- [ ] Keep the entire candidate lane shadow-only until the inventory, split/merge,
  exact-share SELL, unified-beta, Privy compatibility, and uncertainty tests all pass and an
  independent adapter review approves promotion. Direct FOK BUY remains shadow-only
  permanently under the current USD-notional contract.

- [ ] Persist append-only inventory lots and fenced reservations through the shared kernel
  tables. Add pgTAP for exact atomic YES/NO equality, finalized split evidence,
  cross-profile/account/condition rejection, concurrent reservation, over-allocation, stale
  version/fence, unknown SELL retention, authoritative killed-order release, and finalized
  merge consumption.

- [ ] `validate` independently re-derives every field from the intent/account/market evidence and recomputes the artifact hash.

- [ ] `sign` uses only the pinned unified client's official `@polymarket/client/privy`
  `signerFrom` entrypoint with the policy-limited Privy `ownerSignerAddress`, after its
  installed-version compatibility test passes. It obtains the documented `POLY_1271`
  signature, verifies its ERC-7739/ERC-1271 semantics, and rechecks
  owner/order-signer/maker/funder binding plus `signedArtifactHash` locally.

- [ ] Run:

```bash
pnpm db:reset
pnpm test:db
pnpm vitest run tests/execution/polymarket/order.test.ts tests/execution/polymarket/inventory.test.ts tests/execution/polymarket/split-merge.test.ts tests/execution/polymarket/signing.test.ts tests/execution/artifact-hash.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 7: Implement Submit-Once, User Websocket, and REST Reconciliation

**Files:**

- Create: `src/execution/venues/polymarket/adapter.ts`
- Create: `src/execution/venues/polymarket/status.ts`
- Create: `src/execution/venues/polymarket/user-stream.ts`
- Create: `tests/execution/polymarket/adapter.test.ts`
- Create: `tests/execution/polymarket/status.test.ts`
- Create: `tests/execution/polymarket/user-stream.test.ts`

- [ ] Write failing tests for ACK, explicit rejection, HTTP timeout, connection reset, rate limit, duplicate client ID, websocket `MATCHED`, `MINED`, `CONFIRMED`, `RETRYING`, `FAILED`, heartbeat loss, disconnect/reconnect, REST disagreement, partial fill, and late fill after timeout.

- [ ] Implement `LiveVenueAdapter`:

  - `prepare` fetches current tick/`negRisk`, account, allowance, exact book evidence, and an
    exclusively reserved finalized complete-set inventory revision, then prepares only the
    undesired-outcome exact-share FOK SELL candidate;
  - `validate` re-derives the artifact;
  - `sign` uses Privy and verifies locally;
  - `simulate` performs deterministic preflight/account/allowance/signature validation without submitting;
  - `submitOnce` posts the exact signed FOK SELL body once with exact HMAC headers;
  - `reconcile` validates the complete immutable `OrderReconcileClaim`, then reads current
    order/trades by its persisted locator/client ID and rejects any response binding drift;
  - `cancel` is used only for authoritatively working orders.

- [ ] Normalize a timeout/connection loss to `unknown`; retain client order ID, order hash, owner signer, order signer, maker, funder, token, amount, and submission window as locator evidence. Never issue a second POST for the same attempt.

- [ ] Authenticate the user websocket with decrypted user credentials inside the worker. Validate all messages, heartbeat, reconnect with bounded backoff, and persist safe observations. Confirm terminal websocket states with REST before reducing the bundle.

- [ ] Treat `RETRYING`, `FAILED`, disconnect, or malformed data as reconciliation conditions. They do not prove no fill.

- [ ] Run:

```bash
pnpm vitest run tests/execution/polymarket/adapter.test.ts tests/execution/polymarket/status.test.ts tests/execution/polymarket/user-stream.test.ts tests/execution/orchestrator.test.ts tests/execution/reconciler.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 8: Add Balances, Positions, Cancellation, Compensation, and Redemption

**Files:**

- Create: `src/execution/venues/polymarket/positions.ts`
- Create: `src/execution/venues/polymarket/cancellation.ts`
- Create: `src/execution/venues/polymarket/redemption.ts`
- Create: `tests/execution/polymarket/positions.test.ts`
- Create: `tests/execution/polymarket/cancellation.test.ts`
- Create: `tests/execution/polymarket/redemption.test.ts`
- Create: `tests/fixtures/polymarket/redemption.json`

- [ ] Write failing tests for collateral/gas balances, outcome balances, working-order reservation, reorg/read failure, immutable CLOB cancellation prepare/validate/authenticate/simulate artifact, full reconcile claim, fenced submit-once, final zero-cost proof, cancellation cumulative ceiling, cancel race with fill, bounded sell compensation, illiquid compensation, resolved position, already redeemed, redemption timeout, reverted Polygon redemption with nonzero gas, unknown receipt retaining the full cost reservation, and duplicate final receipt charging cost exactly once.

- [ ] Return balances/positions as exact atomic strings plus explicit token scale and safe microdollar valuation timestamp. Unknown reads block the final gate.

- [ ] Have the venue's `LiveCompensationPlanner` return complete bounded semantics for a
  marketable order whose worst-case loss stays within the kernel authorization, then run
  the materialized intent through the normal order adapter. Never widen or resubmit
  without a new bundle-level calculation.

- [ ] Implement `LiveCancellationAdapter` only for an authoritatively working CLOB order.
  Persist the exact DELETE/authenticated-request artifact before its fenced mutation,
  reconcile the complete claim plus original fills, and emit typed final-zero cost
  evidence. A cancel ACK never proves no fill, and timeout is unknown with no blind retry.

- [ ] Before implementing automatic redemption, capture a named current official Polymarket redemption/CTF reference in `docs/references/polymarket-api-baseline.md` and a sanitized official-shape instruction fixture. Implement only that fixed contract/relayer method for authoritatively resolved/redeemable positions, persist intent before signing, and reconcile receipt/finality after timeout. If no current official reference is available, keep automatic redemption disabled and show the authenticated manual Polymarket position URL; do not infer a transaction from Predictefy.

- [ ] Automatic redemption also requires fresh exact profile/wallet/account/contract-
  binding/`redemption` eligibility at intent creation, reservation, signing, broadcast,
  and marker CAS. No onboarding/entry/other-market evidence can authorize those mutations.
  Once submit-start is durable, read-only reconciliation always continues polling and
  persisting payout/cost evidence despite later denial, expiry, freeze, or upstream
  unavailability; it never gains authority to sign or broadcast a new transaction.

- [ ] Run:

```bash
pnpm vitest run tests/execution/polymarket/positions.test.ts tests/execution/polymarket/cancellation.test.ts tests/execution/polymarket/redemption.test.ts tests/execution/compensation.test.ts
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 9: Run the Polymarket Contract and Development-App Gate

**Files:**

- Create: `docs/polymarket-live-lane.md`
- Create: `docs/runbooks/polymarket-onboarding.md`
- Create: `scripts/smoke-polymarket.ts`
- Modify: `package.json`

- [ ] Add `polymarket:smoke` that can read public catalog/book data without credentials and, only with an explicit `--account-readiness` flag, inspect the configured development account. It must never create/sign/submit an order.

- [ ] Document account types, owner-signer versus deposit-wallet order-signer/maker/funder binding, ERC-7739/ERC-1271 verification, credential encryption/rotation, pUSD/CTF allowance scope, the pinned unified beta, direct-BUY shadow refusal, pre-split complete-set inventory, exact-share SELL `shares`/`minPrice` and bigint draft proof, split/merge recovery, the Privy peer-compatibility quarantine, exact market/user websocket paths, REST reconciliation, and redemption.

- [ ] Run:

```bash
pnpm vitest run tests/execution/polymarket tests/server/envelope.test.ts
pnpm test:db
pnpm polymarket:smoke
pnpm lint
pnpm typecheck
pnpm build
pnpm audit --prod
git diff --check
```

Expected: every automated command passes. Public smoke succeeds. Account readiness succeeds only in the txBet development Privy/Polymarket environment and does not move funds.

- [ ] Search for secret leaks and unsafe order paths:

```bash
rg -n "apiSecret|passphrase|authorization|privateKey|FAK|placeMarketOrder|postOrder|splitMarketPosition|mergeMarketPosition|approve" src tests
```

Expected: fixture secrets are fake; production secrets are redacted/encrypted; direct BUY
and one-shot order placement are unreachable from live entry; split/merge and exact-share
FOK SELL calls exist only behind the reviewed inventory/venue adapter boundaries.

- [ ] Review `git status --short`; do not commit or push.
