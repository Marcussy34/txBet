# DFlow shadow-readiness runbook

This runbook checks only an offline, sanitized shadow contract. It does not establish
market eligibility, funding readiness, or permission to trade.

## Run the smoke

Use Node 24 and the repository's pinned pnpm version:

```bash
pnpm install --frozen-lockfile
pnpm dflow:smoke
```

The command accepts no arguments. Do not provide a wallet, public key, API key,
transaction, RPC URL, market, or mint. It reads
`tests/fixtures/dflow/order-response.json`, verifies the exact reviewed REST/WebSocket
hosts, and parses the fixture without making a network request.

A healthy result has all of these fields:

```json
{
  "ok": true,
  "venue": "kalshi-dflow",
  "shadowOnly": true,
  "liveReady": false,
  "blockingReasons": [
    "DFLOW_OFFICIAL_DISCOVERY_UNAVAILABLE",
    "DFLOW_OUTPUT_NOT_EXACT"
  ]
}
```

`ok: true` means only that the offline schema and endpoint constants match the frozen
shadow baseline. `liveReady` must remain `false`.

## Run the contract gate

```bash
pnpm vitest run tests/execution/dflow
pnpm typecheck
pnpm lint
git diff --check
```

The architecture test must find no DFlow Privy import, signer module, Solana connection,
simulation call, transaction send, broadcast, or live-adapter module. Transaction mutation
tests must reject unknown programs, Token-2022, signer/account drift, changed lookup
tables, expiry, and excess outflow.

## Failure response

- If the smoke rejects a fixture, do not weaken the schema. Compare the fixture with the
  current official DFlow contract and refresh the baseline first.
- If an official endpoint or response changes, keep the lane shadow-only and record the
  new access date and source in `docs/references/dflow-api-baseline.md`.
- If a signing, RPC-write, broadcast, reservation, compensation, or redemption surface
  appears, disable/remove it and rerun the no-live-surface gate.
- Treat `explicitLamportTransferAtomic` as the direct System transfer in the synthetic
  fixture only. It excludes fees and ATA-creation rent and is never a total SOL-cost claim.
- Never use historical prediction-market pages, another repository, or fixture data to
  infer a live market/mint mapping or user eligibility.

Live promotion requires a separate approved design, current official sources, adapter-level
tests, and independent review. This runbook cannot authorize promotion.
