# txBet hackathon pitch deck — design

Date: 2026-07-17
Status: approved by user; revised three times on request
(v2: match-centric "live, real, executable"; v3: agent-fleet framing;
v4: single smart-agent framing per user's official one-liner/description —
"the smart agent that reads the match before the market does", TxODDS
Solana-anchored data, signals ledger replaces fleet roster, plays = early
entry / mispricing / active trade, arbitrage as "the lock", VAR stand-down,
"one match in, dozens of markets out")

## Purpose

A 6-slide PowerPoint (.pptx) for a ~60-second hackathon-judge pitch that hands
off into the live console demo. Editable in PowerPoint/Keynote; built with
python-pptx. 16:9, faithful to the app's "Carbon Zero" design system
(src/app/globals.css + landing components): monochrome carbon (#060606 bg,
#F8F8F8 ink, #A4A4A4 muted, #2A2A2A hairlines), color strictly semantic
(success #63D18F / warning #E5AC4C / danger #FF6E74), Instrument Serif
two-tone display headlines (white/muted), Inter body, JetBrains Mono tracked
uppercase micro-labels, hairline ledger rows, measurement-rail hero motif,
and the real TxBetMark logo (rendered from src/components/brand/txbet-brand.tsx).

## Narrative (v3 — agent fleet, match spine, upside-leaning)

A fleet of six event-specialist trading agents (the app's real AgentIds:
goal-reaction, red-card, penalty-var, injury, corner-pressure,
dangerous-free-kick) reads one live TxLINE feed and shops every venue for the
best-value position — value entry vs TxLINE demarginalized fair odds,
trend/momentum riding inside the ~1-minute reprice window, best-payout
ranking across outcomes, and complement arbitrage as the lock. Spine: the
real Argentina 3–1 Switzerland WC26 quarterfinal replayed on recorded
Polymarket & Kalshi books.

1. **Hero** — "The match moves. / Agents strike first." Match-clock rail
   (real TxLINE shocks) + agent-wakes rail. Footer: LIVE · REAL · EXECUTABLE.
2. **The fleet** — "Six agents. / One match feed." Roster ledger: code,
   agent, trigger, what it did this match (A01 woke 4×, A02 at 02:32Z,
   A03 held the fleet, A04–A06 standby).
3. **The plays** — "Event in. / Best value out." Three real plays: trend
   ride (draw $0.19→$0.51 in 60s, MARKED), value entry (draw $0.50 vs fair
   $0.517, SETTLED $1.00 · 2.0×), best payout (rank all → ARG $0.34→$0.52,
   MARKED). Honesty labels: MARKED = exit into the move; SETTLED = paid.
4. **The lock** — "Books disagree? / Take both sides." The four complement
   fills blotter, +$3.61 per 100-contract pairs after worst-case fees.
5. **The hold** — "No edge. / No trade." A03 PENALTY-VAR holds the fleet
   through the VAR whipsaw ($0.53→$0.16→$0.38); verdict
   FLEET HELD — AMBIGUOUS_OFFICIATING_EVIDENCE.
6. **Demo handoff** — "The tape is ready." Console card showing the fleet on
   the tape; editable deploy-URL placeholder.

Every slide footer carries the shadow-replay disclosure. Speaker notes hold
the 60-second talk track.

## Data sources

- Case-study numbers: output/arg-sui-case-study/case-study.json
  (events, reprice_lags incl. TxLINE fair odds, gap_peaks, fills, refusal)
- Agent IDs: src/core/types.ts
- Landing copy voice: src/components/landing/sections/*.tsx

## Build & QA

- Deck: output/pitch/txBet-pitch.pptx · script: output/pitch/build_deck.py
- Fonts required at ~/Library/Fonts (installed 2026-07-17): Inter,
  JetBrains Mono, Instrument Serif
- Visual QA: LibreOffice headless pptx→pdf + PyMuPDF rasterization
  (PowerPoint AppleScript export is unreliable — see tasks/lessons.md)
