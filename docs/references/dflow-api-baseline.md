# DFlow API Baseline

_Accessed: 2026-07-17 · Scope: current DFlow Trading API and Kalshi-through-DFlow shadow evidence_

This baseline is intentionally fail-closed. The current official Trading API is sufficient
to implement fixed-host, production-shaped quote/status parsing, but the current official
Metadata API publishes market/outcome-mint fields only against a developer server. It does
not provide the production catalog, immutable binding, and delegated-user eligibility/KYC
contracts needed to authorize Kalshi-through-DFlow live execution. The lane therefore
remains shadow-only: it cannot reserve funds, request a signature, or broadcast a transaction.

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

## Developer-only Metadata API

The official Metadata API OpenAPI document currently advertises only
`https://dev-prediction-markets-api.dflow.net`. It defines discovery endpoints including
`/api/v1/events`, `/api/v1/markets`, `/api/v1/market/{market_id}`, and
`/api/v1/market/by-mint/{mint_address}`. Its market account schema exposes `marketLedger`,
`yesMint`, `noMint`, and `isInitialized`, so txBet records official market/mint discovery as
`developer-only` rather than unavailable.

That schema does not advertise a production Metadata API server, an immutable catalog
revision or expiry, or a production authorization contract for those bindings. Developer
metadata can support sanitized shadow evidence, but it cannot identify a live executable
market. The stable `DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE` reason means executable production
discovery is unavailable; it does not claim that the developer metadata schema is absent.

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

## Missing production prediction-market authority

The official developer Metadata API supplies a market-to-mint schema, but no reviewed
official source currently supplies its production equivalent, immutable revision/expiry
semantics, or delegated-user eligibility/KYC contract. The previously referenced narrative
pages currently return 404:

- `https://pond.dflow.net/prediction-markets/prediction-market-data-model`
- `https://pond.dflow.net/prediction-markets/sports-markets`
- `https://pond.dflow.net/build/prediction-markets/kyc`

Those old pages and the former prediction-markets host are quarantined historical evidence,
not an integration contract. txBet must not infer production routes, immutable bindings,
eligibility, or redemption instructions from them or from Predictefy. Until DFlow publishes
the missing production contracts, no DFlow market binding is executable and no live adapter
is registered.

## Shadow-only acceptance

The current phase may implement and test:

- exact fixed-host schemas for `/order` and `/order-status`;
- exact developer Metadata API schemas and sanitized market/mint fixtures;
- fixture-only, non-user quote parsing with no production profile probe or market binding;
- full offline decoding and hostile-mutation tests over sanitized transaction fixtures;
- read-only Solana and DFlow reconciliation parsers.

It must not create an executable opportunity, reserve a user's balance, call Privy signing,
or broadcast. Mock success, fixture success, or a `closed` status cannot promote the lane.

## Official sources

- [DFlow documentation index](https://pond.dflow.net/llms.txt)
- [Metadata API OpenAPI](https://pond.dflow.net/resources/metadata-api/openapi.json)
- [Production and developer endpoints](https://pond.dflow.net/get-started/endpoints)
- [`GET /order`](https://pond.dflow.net/resources/trading-api/order/order)
- [`GET /order-status`](https://pond.dflow.net/resources/trading-api/order/order-status)
- [API-key authentication](https://pond.dflow.net/resources/recipes/api-keys)
- [WebSocket overview](https://pond.dflow.net/resources/trading-api/websockets/overview)
- [Privy wallet recipe](https://pond.dflow.net/resources/recipes/wallets/privy)
