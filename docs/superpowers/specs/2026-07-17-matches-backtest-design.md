# /matches — real past-match backtest with per-agent PnL

Date: 2026-07-17. Status: approved (route: /matches, optimal fills, $100/agent, all 6 agents).

## Goal

A new `/matches` route that mirrors the console's agent presentation but runs the
six agents over the REAL Argentina vs Switzerland quarterfinal (TxLINE fixture
18222446, 2026-07-11) and shows per-agent backtested PnL from a $100 bankroll.
Profit-forward presentation; a single compact "BACKTEST" badge plus a
methodology footnote carry the simulation disclosure (required by the M1
honest-boundary gate — never removed, never expanded into hedging copy).

## Data artifact

- `scripts/build-arg-sui-windows.mjs` (offline, never at runtime): reads
  `output/arg-sui-case-study/raw/` (TxLINE scores timeline, Kalshi universe
  candles, Polymarket histories) and emits
  `src/fixtures/matches/arg-sui-2026-07-11.ts`.
- Artifact contents: fixture metadata + provenance; per-agent BacktestWindows
  from real events (goals 01:10:19Z / 02:28:19Z, VAR 02:31:08Z, red card
  02:32:48Z, ET goals, corner-pressure windows computed from the 10 real corner
  timestamps, free kicks in danger possession, injury/substitutions); real
  quotes per window; settlement outcomes (draw in regulation; Argentina
  advances).
- Fill basis (optimal, labeled once in methodology): Kalshi legs at the shock
  window volume-weighted mean with real per-contract fee 0.07×p(1−p) mapped to
  FeeModel flat-per-share; Polymarket legs at printed mid with 0.04–0.07×p(1−p)
  worst-case fee. Quote quantities capped by real per-minute traded volume.

## Core

- `src/core/match-backtest.ts`: wraps existing `runBacktest`/pipeline unchanged.
  Per agent: chronological windows, $100 bankroll (`allocatedCapitalMicros`),
  sizing capped by free capital, capital locked until settlement, settled
  against known outcomes. Report: deployed, trades, refusals by reason, locked
  profit, settled PnL, ending capital. Micros-exact.

## UI

- `src/app/matches/page.tsx` + `src/components/matches/*` (new files only;
  `txbet-console.tsx` untouched — parallel session owns it).
- Match picker → match header with real score/event timeline → agent roster
  grid: per-agent card with triggers fired, windows, trades, reason-code chips
  (refusals framed as capital protected), and `$100 → $X` headline PnL.
  Per-window trace table with gate outcomes and economics.
- Compact `BACKTEST` badge near the headline numbers; methodology footnote with
  fill basis, fees, provenance. Carbon Zero styling, shadcn components.

## Tests

- Window-builder units (corner-pressure detection, event mapping, quote
  snapshots), capital-ledger units (locking, sequencing, refusal preserves
  capital, settlement math), route SSR test (renders, badge present, golden
  per-agent report numbers).
- `pnpm verify` stays green.

## Out of scope

- Live data in this route; M2 catalog; console edits; real-money implication;
  ET-period markets beyond the Advance family.
