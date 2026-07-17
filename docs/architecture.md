# Architecture

txBet keeps sports-event ingestion, settlement matching, economics, and execution state separate.

## Data path

1. `src/lib/txline/client.ts` authenticates and consumes the TxLINE score snapshot and SSE stream.
2. `src/server/txline/world-cup-status.ts` exposes a bounded score-snapshot status to the browser. One four-second abort deadline covers guest auth and snapshot consumption; public reads use a one-second single-flight cache. Only confirmed observations at most 30 seconds old can be labeled `LIVE_UNVERIFIED`, and REST never implies Solana proof validation.
3. `normalizeTxLineEvent()` maps supported provider actions into the shared event contract and fails closed on unknown actions.
4. The trigger router activates one of six agent configurations.
5. The pipeline scopes every quote to the triggering fixture and the selected agent's allowed market families.
6. Approved venue adapters return normalized contracts and executable asks.
7. The settlement matcher compares every resolution field; display titles are not evidence.
8. The optimizer walks equal depth, estimates per-adapter fees, adds a safety buffer, and enforces capital, exposure, freshness, contract close time, and return limits.
9. The bundle executor records equal fills as `MATCHED`, unequal fills as `UNHEDGED`, and malformed fill data as `INVALID`; residual or invalid execution data activates the kill switch.

The quick MVP adds a separate read-only Polymarket path. Exactly one leg is an
official public CLOB book bound to a reviewed, pinned Gamma market identity. The
other leg is a pre-reviewed, integrity-hashed normalized quote. The shared World Cup
scanner always returns `SHADOW_ONLY`; fees, asset value, network cost, and live
execution authorization remain explicit blockers. Blank review configuration
causes zero public network reads. M1 reports `PINNED_IDENTITY_LIVE_BOOK`, not a
claim that Gamma currentness was re-walked on that request.

## Why binary-only in v1

Two outcomes are complementary only when they exhaust the same proposition. “Argentina wins” and “Spain wins” do not cover a draw. Regulation-only, extra-time, qualification, and whole-number total contracts can also resolve differently. v1 therefore accepts only explicit YES/NO pairs with identical settlement fingerprints and fixed payouts.

## Live execution boundary

The repository contains isolated live-money contracts, gates, and venue-adapter
building blocks, but the quick MVP registers no mutation route and exposes no
approve, sign, submit, cancel, or settle action. `EXECUTION_MODE` defaults to
`disabled`. Several canary blockers remain open and are tracked in
[`currentstate.md`](../currentstate.md).

A later orchestrator must write bundle and leg intents before submission,
recheck readiness immediately before each irreversible call, reconcile unknown
results, cancel outstanding orders on event revisions, and block new trades
whenever residual exposure exists. No module is promoted merely because its
unit tests pass; adapter-level tests, database persistence, shadow soak, and an
independent security review are required first.
