# Argentina vs Switzerland case-study report — design

Date: 2026-07-17. Status: approved (Approach A, standalone report first).

## Goal

A standalone, honest, real-data case study of the 2026 World Cup quarterfinal
(Argentina 3–1 Switzerland aet, 2026-07-11) showing: the match timeline, how
Polymarket and Kalshi priced it, measurable mispricing windows, and what the
txBet agent would have shadow-executed. Output is a local HTML report; in-app
integration (replay artifact / landing section) is decided after we see the data.

## Data sources

1. **Polymarket (public, no creds)** — Gamma event `fifwc-arg-che-2026-07-11`;
   CLOB `prices-history` per outcome token at finest fidelity.
2. **Kalshi (public, no creds)** — event `KXWCGAME-26JUL11ARGSUI`
   ("Regulation Time Moneyline", settled); 1-minute candlesticks per market.
   Also check for an advance/qualify market.
3. **TxLINE (free World Cup tier, mainnet service level 12)** — on-chain
   subscribe with a user-funded burner wallet (~0.02 SOL), token activation,
   then `/api/scores/historical/{fixtureId}` for exact event timestamps.
   Private key lives in shell env only; never on disk, logs, or git.

## Analysis

- Align venue price series to TxLINE event timestamps.
- Reprice lag per goal; cross-venue divergence; exact-complement windows after
  real venue fees (reuse app fee constants).
- Retrospective shadow-execution simulation, explicitly labeled as such, with
  P&L to settlement. No real-money implication anywhere.
- Key settlement-identity story: Kalshi moneyline settles on regulation time
  (TIE won at 1–1); advance-style markets settled Argentina — the exact
  contract-identity gate txBet enforces.

## Honesty constraints

- Venue history is minute-bucketed; lag windows are reported at that
  resolution, not tick-level. If no clean window exists, the report says so.
- All simulated fills are labeled retrospective SHADOW_ONLY analysis.

## Out of scope (this pass)

- Feeding data into the app pipeline or landing page.
- Any TxLINE `validateStat` on-chain proof integration (M2).
