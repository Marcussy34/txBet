# DFlow API Baseline

_Accessed: 2026-07-17 · Scope: current DFlow Trading API and Kalshi-through-DFlow shadow evidence_

This baseline is intentionally fail-closed. The current official Trading API is sufficient
to implement fixed-host, production-shaped quote/status parsing, but the current official
documentation does not provide the prediction-market discovery and delegated-user
eligibility/KYC contracts needed to authorize Kalshi-through-DFlow live execution. The lane
therefore remains shadow-only: it cannot reserve funds, request a signature, or broadcast a
transaction.

All checked-in fixtures must be sanitized and generated with public fake keys. They must not
contain a real wallet, API key, quote, order, transaction signature, or funding record.

## Current endpoints and authentication

| Environment | REST | WebSocket |
|---|---|---|
| Production | `https://quote-api.dflow.net` | `wss://quote-api.dflow.net` |
| Developer | `https://dev-quote-api.dflow.net` | `wss://dev-quote-api.dflow.net` |

Production requests carry `x-api-key` only after the exact HTTPS host has been validated.
The production WebSocket host serves named stream paths such as `/quote-stream`,
`/book-stream`, and `/priority-fees/stream`; a client must bind the reviewed path as well as
the host.

`https://b.quote-api.dflow.net` is not the current documented production endpoint and must
not be configured. The former `https://a.prediction-markets-api.dflow.net` host is also not
an approved txBet endpoint.

## `GET /order`

The current OpenAPI contract is `GET https://quote-api.dflow.net/order`.

- `amount` is a scaled integer **input amount**. The request is exact-input.
- `predictionMarketSlippageBps` affects the minimum outcome-token amount that the
  prediction order must produce; it is not an exact-output parameter.
- The response exposes expected output and `otherAmountThreshold`, a minimum output after
  fees. It does not expose a documented finite maximum output equal to a requested hedge.
- A base64 transaction is returned only when the request includes `userPublicKey`.
- `lastValidBlockHeight` bounds transaction validity when a transaction is returned.

**txBet conclusion:** because the live kernel requires an exact equal-share hedge, the
current minimum-only output contract cannot certify a DFlow leg for live entry. A future
promotion requires a refreshed official exact-output or finite-upper-bound contract and
independent decoding proving that minimum and maximum net outcome both equal the authorized
quantity.

## `GET /order-status`

The current OpenAPI contract is `GET https://quote-api.dflow.net/order-status`, keyed by a
base58 transaction `signature` and optional `lastValidBlockHeight`. Documented status values
are `pending`, `expired`, `failed`, `open`, `pendingClose`, and `closed`.

The response also carries total `inAmount`, total `outAmount`, and optional fills/reverts.
`closed` alone is not proof of a complete fill. Reconciliation must inspect fills, reverts,
atomic deltas, balances, and Solana confirmation. A 404, 500, malformed response, or
unavailable read remains unknown.

## Missing prediction-market authority

The official DFlow documentation index at `https://pond.dflow.net/llms.txt` currently lists
the Trading API but no prediction-market catalog, Kalshi market-to-mint mapping, or
delegated-user eligibility/KYC reference. The previously referenced pages now return 404:

- `https://pond.dflow.net/prediction-markets/prediction-market-data-model`
- `https://pond.dflow.net/prediction-markets/sports-markets`
- `https://pond.dflow.net/build/prediction-markets/kyc`

Those old pages and the former prediction-markets host are quarantined historical evidence,
not an integration contract. txBet must not infer routes, market bindings, eligibility, or
redemption instructions from them or from Predictefy. Until DFlow publishes a current
official replacement, no DFlow market binding is executable and no live adapter is
registered.

## Shadow-only acceptance

The current phase may implement and test:

- exact fixed-host schemas for `/order` and `/order-status`;
- fixture-only, non-user quote parsing with no production profile probe or market binding;
- full offline decoding and hostile-mutation tests over sanitized transaction fixtures;
- read-only Solana and DFlow reconciliation parsers.

It must not create an executable opportunity, reserve a user's balance, call Privy signing,
or broadcast. Mock success, fixture success, or a `closed` status cannot promote the lane.

## Official sources

- [DFlow documentation index](https://pond.dflow.net/llms.txt)
- [Production and developer endpoints](https://pond.dflow.net/get-started/endpoints)
- [`GET /order`](https://pond.dflow.net/resources/trading-api/order/order)
- [`GET /order-status`](https://pond.dflow.net/resources/trading-api/order/order-status)
- [API-key authentication](https://pond.dflow.net/resources/recipes/api-keys)
- [WebSocket overview](https://pond.dflow.net/resources/trading-api/websockets/overview)
- [Privy wallet recipe](https://pond.dflow.net/resources/recipes/wallets/privy)
