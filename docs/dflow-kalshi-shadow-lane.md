# DFlow/Kalshi lanes

_Baseline accessed: 2026-07-17 · Runtime state: manual exact-input canary; paired agent shadow-only_

txBet does not hold or request native Kalshi RSA credentials. The automated venue adapter
remains read-only because DFlow does not guarantee the exact output needed for the second
complementary leg. A separate authenticated manual route can submit one reviewed World Cup
exact-input order through DFlow using the user's delegated Privy Solana wallet.

## Manual canary boundary

`POST /api/execution/dflow/order` accepts only a server-owned binding ID, positive integer
USDC microdollars, a minimum output, the current control version, and literal real-money
confirmation. Raw wallet IDs, mints, programs, RPC URLs, and upstream hosts are never
accepted from the browser. The route requires same-origin Privy bearer auth and an
idempotency key.

Before one RPC send, txBet verifies DFlow's pinned Ed25519 RFC 9421 response, validates a
lookup-free user-bound transaction and reviewed programs, re-resolves the exact delegated
Privy signer/policy, proves the signed message is unchanged, simulates with signature
verification, rechecks block height/control/binding freshness, and atomically reserves the
cumulative worst-case spend in private Blob. A durable `submit_started` claim always
precedes the single `sendTransaction` call. Ambiguity returns `unknown` and never requotes
or resubmits that operation.

## Why paired execution is blocked

The current official DFlow Trading API documents fixed production endpoints and
exact-input `/order` plus `/order-status`. It does not currently publish all contracts
txBet needs to authorize a Kalshi-through-DFlow trade:

- a current prediction-market catalog;
- an immutable Kalshi market/outcome-mint mapping;
- delegated-user eligibility/KYC evidence with revision and expiry semantics;
- an authoritative redemption contract; and
- exact output, or a finite upper and lower net-output bound equal to the hedged quantity.

`/order` exposes expected output and a minimum output. A minimum is not an exact hedge.
The paired lane therefore reports `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE` and
`DFLOW_OUTPUT_NOT_EXACT`. A `closed` order status is also insufficient proof without fills,
reverts, exact atomic deltas, and Solana confirmation.

The former prediction-market pages and
`a.prediction-markets-api.dflow.net` are quarantined historical evidence. txBet does not
infer live markets, mints, KYC, geofencing, positions, or redemption from those pages or
from another repository.

## What the automated shadow lane does

- Builds only a fixed-host, exact-input `/order` request without `userPublicKey`,
  destination, revert wallet, or initialization payer. DFlow cannot return a user-bound
  transaction for this request.
- Strictly parses sanitized quote/status fixture shapes and rejects unknown fields,
  signable transaction data, mismatched mints, and mismatched amounts. It accepts and
  discards the documented non-transaction `revertMint`/`routePlan`, native-output, and
  platform-fee fields. Async responses require `revertMint`; sync responses require a
  nonempty `routePlan`. User-bound transaction, block-height, lookup-table, compute-budget,
  initialization-payer, and priority-fee response fields remain forbidden.
- Reports immutable read-only readiness for the exact REST/WebSocket hosts, official
  documentation gate, exact-output gate, and sanitized fixture validation.
- Refuses every automated DFlow opportunity before reservation and exposes no paired-agent execution method.
- Runs an offline smoke with no API key, wallet, user input, RPC, or network request.

## Offline Solana fixture validation

The checked-in unsigned transaction is generated from public fake keys and contains no
real user, key, quote, order, signature, or funding record. It is a txBet-owned hostile
mutation fixture, not a captured or approved production DFlow transaction.

The validator accepts only one reviewed fixture shape using the System, Compute Budget,
Associated Token Account, and classic SPL Token programs. It rejects Token-2022, unknown
programs, extra signers, unexpected writable accounts, token approvals, multisig-shaped
instructions, changed lookup tables, blockhash drift/expiry, mint/destination drift, and
USDC or explicit System transfer above the fixture policy. Its lamport evidence is named
`explicitLamportTransferAtomic`: it deliberately does not claim to include the transaction
fee or rent debited by Associated Token Account CPI. Total live SOL cost would require
current account state, fee calculation, and simulation, none of which this shadow module
performs. It returns hashes and bounded fixture evidence, never message bytes or a signing
method. No DFlow routing program is allowlisted because
the current official baseline does not establish one for this lane.

Passing fixture tests does not make a live route safe. It proves only that the offline
validator fails closed against its synthetic test contract.

## Promotion requirements

Automated promotion requires a refreshed official baseline that closes every discovery, immutable
mapping, delegated-user eligibility/KYC, expiry/revision, authoritative redemption, and exact-output
gate. A separately reviewed transaction contract must then prove exact byte identity,
wallet ownership, program/account/instruction allowlists, current block height, exact net
atomic deltas, successful simulation, submit-once persistence before broadcast, and
timeout reconciliation. Compensation and redemption need independent official contracts
and tests. Mocked or fixture success cannot promote the lane.

## Official references

- [DFlow documentation index](https://pond.dflow.net/llms.txt)
- [Production and developer endpoints](https://pond.dflow.net/get-started/endpoints)
- [`GET /order`](https://pond.dflow.net/resources/trading-api/order/order)
- [`GET /order-status`](https://pond.dflow.net/resources/trading-api/order/order-status)
- [API-key authentication](https://pond.dflow.net/resources/recipes/api-keys)
- [Signed HTTP responses](https://pond.dflow.net/resources/request-signing)
- [Privy Solana `signTransaction`](https://docs.privy.io/api-reference/wallets/solana/sign-transaction)
- [Solana `sendTransaction`](https://solana.com/docs/rpc/http/sendtransaction)
- [Frozen txBet baseline](./references/dflow-api-baseline.md)
