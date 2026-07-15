# Architecture

txBet keeps sports-event ingestion, settlement matching, economics, and execution state separate.

## Data path

1. `src/lib/txline/client.ts` authenticates and consumes the TxLINE score snapshot and SSE stream.
2. `normalizeTxLineEvent()` maps supported provider actions into the shared event contract and fails closed on unknown actions.
3. The trigger router activates one of six agent configurations.
4. The pipeline scopes every quote to the triggering fixture and the selected agent's allowed market families.
5. Approved venue adapters return normalized contracts and executable asks.
6. The settlement matcher compares every resolution field; display titles are not evidence.
7. The optimizer walks equal depth, estimates per-adapter fees, adds a safety buffer, and enforces capital, exposure, freshness, contract close time, and return limits.
8. The bundle executor records equal fills as `MATCHED`, unequal fills as `UNHEDGED`, and malformed fill data as `INVALID`; residual or invalid execution data activates the kill switch.

## Why binary-only in v1

Two outcomes are complementary only when they exhaust the same proposition. “Argentina wins” and “Spain wins” do not cover a draw. Regulation-only, extra-time, qualification, and whole-number total contracts can also resolve differently. v1 therefore accepts only explicit YES/NO pairs with identical settlement fingerprints and fixed payouts.

## Live execution boundary

`VenueAdapter` includes preflight, IOC placement, and reconciliation, but the repository ships no live-money implementation. A future orchestrator must write bundle and leg intents before submission, recheck readiness immediately before each irreversible call, reconcile unknown results, cancel outstanding orders on event revisions, and block new trades whenever residual exposure exists.
