# Polymarket API Baseline

_Accessed: 2026-07-17 · Scope: Polygon mainnet, CLOB v2, deposit-wallet onboarding, and relayer v2_

This file freezes the official contract used by the txBet Polymarket adapter. Re-fetch every
linked source before live certification. If an endpoint, package, address, signature shape,
or order type changes, the adapter stays shadow-only until its fixtures and binding tests are
updated.

All checked-in fixtures derived from these pages must be sanitized. They may preserve the
official response shape, but must not contain a real user address, API key, order, trade,
signature, token balance, or funding record.

## Supported client and network

- TypeScript package: the current unified `@polymarket/client`, pinned exactly to
  `0.1.0-beta.16` while it remains beta.
- Runtime floor declared by that release: Node.js `>=24`.
- Wallet integration: the official `@polymarket/client/privy` `signerFrom` adapter.
- Relayer authentication: the unified client's `relayerApiKey` helper.

The legacy standalone `@polymarket/clob-client-v2`,
`@polymarket/builder-relayer-client`, and `@polymarket/builder-signing-sdk` dependency set
is not an approved txBet baseline. Its relayer dependency graph failed the production
high-severity audit, so the live adapter must not add or recommend it.

The unified beta currently declares an optional `@privy-io/node` peer range of `^0.15.0`,
while txBet uses the current `0.26.x` SDK. This mismatch is a live blocker until an
adapter-level compatibility suite proves the exact signer request/response and authorization
context against txBet's installed Privy version. A successful TypeScript build alone is not
proof. Any failed or unproved case quarantines Polymarket signing and keeps the lane
shadow-only.

## Fixed endpoints

- Chain: Polygon mainnet, chain ID `137`.
- CLOB REST: `https://clob.polymarket.com`.
- Gamma catalog: `https://gamma-api.polymarket.com`.
- Market WebSocket: `wss://ws-subscriptions-clob.polymarket.com/ws/market`.
- Authenticated user WebSocket: `wss://ws-subscriptions-clob.polymarket.com/ws/user`.
- Relayer: `https://relayer-v2.polymarket.com/`.

The two CLOB WebSocket paths are separate fixed endpoints. A bare
`wss://ws-subscriptions-clob.polymarket.com` value is not an executable configuration.

## Current Polygon contracts

| Purpose | Address |
|---|---|
| pUSD collateral proxy | `0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB` |
| Conditional Tokens Framework | `0x4D97DCd97eC945f40cF65F87097ACe5EA0476045` |
| CTF Exchange | `0xE111180000d2663C0091e4f400237545B87B996B` |
| Neg Risk CTF Exchange | `0xe2222d279d744050d28e00520010520000310F59` |
| Deposit Wallet Factory | `0x00000000000Fb5C9ADea0298D729A0CB3823Cc07` |

pUSD has six decimals and is the current CLOB trading collateral. Legacy Polygon USDC or
USDC.e assumptions must not be used as the CLOB v2 collateral binding. Wrapping or
unwrapping is a separate allowlisted on-chain operation and is not implicit in order entry.

## Deposit-wallet and signature binding

New integrations use signature type `3`, `POLY_1271`, with these distinct identities:

- `ownerSignerAddress`: the Privy embedded EOA (or an explicitly approved session signer)
  that owns the deposit wallet and produces the underlying owner signature.
- `orderSignerAddress`: the deterministic deposit wallet address placed in the CLOB order's
  `signer` field.
- `makerAddress` and `funderAddress`: the same deposit wallet address for the type-3 path.

The owner does not replace the order signer, maker, or funder in a type-3 order. The owner
produces the signature material that is wrapped with the documented ERC-7739 format; the
deposit wallet validates that wrapped signature through ERC-1271. txBet must independently
verify deposit-wallet ownership, all four bindings, signature type, and the final wrapped
signature before submission. Existing accounts with another officially reported signature
type require a separately tested binding; no type is guessed.

## Authentication and relayer

CLOB L2 requests use the user's API key, secret, and passphrase. The HMAC covers the exact
timestamp, method, request path, and serialized body, and the request carries the documented
`POLY_ADDRESS`, `POLY_SIGNATURE`, `POLY_TIMESTAMP`, `POLY_API_KEY`, and
`POLY_PASSPHRASE` headers. These per-user credentials are encrypted at rest.

Relayer v2 authentication is independent of CLOB authentication. The primary txBet relayer
configuration is:

```dotenv
POLYMARKET_RELAYER_API_KEY=
POLYMARKET_RELAYER_API_KEY_ADDRESS=
```

It maps to the `RELAYER_API_KEY` and `RELAYER_API_KEY_ADDRESS` headers. Builder HMAC
credentials remain an optional compatibility path only when the current relayer environment
requires and documents them; they are not a fallback for a failed relayer-key request, and
the two authentication modes are never mixed.

txBet's L2 signer matches the pinned unified SDK byte contract: decode the user secret as
base64/base64url, concatenate the decimal Unix-seconds timestamp, uppercase HTTP method,
exact request path, and the exact serialized body when one exists, then compute HMAC-SHA256.
The signature is URL-safe base64 with `=` padding preserved. No path, query, JSON key order,
or whitespace normalization is allowed after the artifact is hashed. The API key, secret,
passphrase, signature, and encrypted envelope are redacted from structured logs.

## Public catalog and book contract

The public scanner uses fixed-host endpoints only:

- `GET /markets/keyset` on Gamma, with `after_cursor`, page size at most `100`, and cursor
  exhaustion before a scan can be marked complete;
- `GET /book?token_id=...`, `GET /tick-size?token_id=...`, and
  `GET /neg-risk?token_id=...` on the CLOB host.

Every payload is parsed before normalization. Decimal strings remain strings until exact
integer/rational conversion, and a title never supplies missing settlement semantics. A
partial keyset scan cannot tombstone unseen contracts. Token, tick, negative-risk flag,
revision, freshness, and book-level evidence must all agree before the scanner emits even a
shadow candidate.

## Single-order cancellation contract

The current single-order cancellation request is `DELETE https://clob.polymarket.com/order`
with the exact JSON body `{"orderID":"..."}` and the five CLOB L2 headers. Its response has
`canceled: string[]` and `not_canceled: Record<string, string>`. txBet persists the immutable
DELETE artifact and submit-start marker before one network attempt. A cancellation ACK is
not proof that no fill raced the cancel; timeout, malformed response, `not_canceled`, or a
contradictory response becomes `UNKNOWN` and is resolved only by authoritative REST and
balance reconciliation. The request is never retried blindly.

## FOK order construction and exact-share gate

The unified client's market BUY request uses `amount` as desired USD notional. The adapter
must also set the user's all-in `maxSpend`, `maxPrice`, and `orderType: OrderType.FOK`.
`maxSpend` includes fees and `maxPrice` bounds every accepted execution price. txBet uses
the SDK's prepare/sign/post workflow instead of the one-shot `placeMarketOrder` helper so it
can persist and independently validate the immutable draft before any signature or submit.

The unified SDK draft exposes bigint `offeredAmount` and `requestedAmount`; the signed wire
order exposes decimal-string `makerAmount` and `takerAmount`. Adapter tests must prove those
four atomic values, fee treatment, pUSD scale, and order type exactly for every supported
`amount`/`maxSpend`/`maxPrice` and rounding case. The adapter re-derives them from the
immutable intent before signing and again before posting.

**txBet inference:** a dollar-denominated BUY request cannot guarantee an exact share
quantity across all allowed prices. Direct Polymarket FOK BUY is therefore shadow-only for
txBet's equal-share kernel;
`amount`, `maxSpend`, `maxPrice`, and a full-fill result do not change that conclusion. No
legacy `createOrder` + `postOrder(FOK)` workaround or unchecked one-shot helper may bypass
the exact-share requirement.

**txBet candidate design:** the only current candidate exact-share entry path is pre-split
complete-set inventory:

1. Before an opportunity is armed, use the unified SDK's reviewed
   `prepareSplitMarketPosition`/`splitMarketPosition` workflow to convert an exact atomic
   pUSD amount into the same exact number of both complementary outcome tokens.
2. Reserve that already-finalized complete set for one bundle. Inventory preparation is not
   part of concurrent two-leg dispatch and cannot be reused by another attempt.
3. To acquire the desired outcome, prepare a market **SELL** of exactly `shares` of the
   undesired outcome, with `orderType: FOK` and a bound `minPrice`. The unified SDK's SELL
   shape is share-denominated, unlike BUY.
4. A full FOK sell leaves exactly the reserved desired-outcome shares. A killed order leaves
   the complete set unchanged, so it can be released or merged back through the separately
   persisted and reconciled `prepareMergeMarketPosition`/`mergeMarketPosition` workflow.

This is a candidate, not a live-ready path. Promotion requires adapter and inventory tests
for exact split/merge atomic amounts, finality/reorgs, exclusive reservation, pUSD and gas
costs, sell-side fees/rounding, book depth at `minPrice`, failed/killed/unknown sell states,
merge recovery, and crash-safe reconciliation. Direct FOK BUY remains shadow-only even if
those candidate-path tests pass.

FOK means immediate all-or-nothing execution, but a FOK label alone does not prove the net
outcome-token quantity. txBet still binds fee rounding, all allowed execution prices, and
authoritative fill/balance deltas.

## Official sources

- [Trading quickstart](https://docs.polymarket.com/trading/quickstart)
- [Create an order](https://docs.polymarket.com/trading/orders/create)
- [Unified TypeScript SDK](https://docs.polymarket.com/dev-tooling/typescript)
- [Authentication](https://docs.polymarket.com/api-reference/authentication)
- [Deposit wallets](https://docs.polymarket.com/trading/deposit-wallets)
- [pUSD collateral](https://docs.polymarket.com/concepts/pusd)
- [Polygon contracts](https://docs.polymarket.com/resources/contracts)
- [Gasless relayer client](https://docs.polymarket.com/trading/gasless)
- [Relayer submit API](https://docs.polymarket.com/api-reference/relayer/submit-a-transaction)
- [WebSocket overview](https://docs.polymarket.com/market-data/websocket/overview)
- [Authenticated user channel](https://docs.polymarket.com/market-data/websocket/user-channel)
- [Fetching markets with Gamma](https://docs.polymarket.com/market-data/fetching-markets)
- [Keyset market listing](https://docs.polymarket.com/api-reference/markets/list-markets-keyset-pagination)
- [Public client methods](https://docs.polymarket.com/trading/clients/public)
- [Order book](https://docs.polymarket.com/trading/orderbook)
- [Negative-risk markets](https://docs.polymarket.com/advanced/neg-risk)
- [Cancel a single order](https://docs.polymarket.com/api-reference/trade/cancel-single-order)
