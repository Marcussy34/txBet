# Landing instrument program — design spec

_Date: 2026-07-17 · Status: approved by Marcus ("Full instrument program") · Supersedes nothing; extends the chapter grammar in brand.md/DESIGN.md._

## Intent

The five below-fold chapters keep their editorial serif voice but their instruments move
from wireframe to **Workstation-Dense**: event ledgers, ms rulers, venue timing rows,
gate slabs, live count-ups, and one shared motion language — the hero's light packet is
the courier through every chapter. Monochrome stays absolute; color stays semantic-only.
Motion: mount reveals are dramatic once; loops are short, restrained, pausable, and
fully static under reduced motion. The interlock remains the only enclosed panel.

## Shared system rules (all sections)

- **Chip**: bordered mono microtag — `border border-border bg-background/80 px-2 py-1
  font-mono text-[0.625rem] uppercase tracking-[0.12em]`. Data atoms live in chips or
  ledger rows, never as floating unboxed SVG text where HTML can do it.
- **Numbers**: JetBrains Mono, `tabular-nums`. Changing numbers flash toward their
  semantic color ≤300ms then settle to neutral. Count-ups ≤600ms, mount-only.
- **Keylines** 1px `border-border`; square nodes; no rounded shells except interlock
  panel (existing) and buttons.
- **Loops**: GSAP timeline per instrument, 3.2–4.5s active + 0.8–1.2s repeatDelay,
  `paused: true`, driven through the existing `connectLiveLoop` gating (visible +
  tab-focused + user pause button). Packet motion: transforms/opacity/strokeDash only.
- **Reduced motion**: instruments render their complete final state (all routes drawn,
  all checks resolved, densest readouts visible). Nothing depends on motion.
- **Hovers**: 100–150ms, `motion-safe:`, `@media (hover: hover)` semantics via Tailwind
  (`group-hover` fine); every interactive element keeps visible focus ring; hit targets
  ≥44px on touch.
- **No new hues.** success/warning/danger/signal tokens only, per brand.md.
- **Copy**: number-forward, verb-led, synthetic/replay disclosure stays visible per
  section footer (existing rails remain).
- **Anti-slop check before finishing** a section: no `transition-all`, no hex literals,
  no floating labels, no decorative color, no >2 non-gray hues visible at once.

## Architecture and ownership (enables parallel workers)

Phase 1 splits files with **zero visual change**; Phase 2 assigns exclusive ownership:

| Worker | Owns (exclusive writes) |
|---|---|
| §1 reaction tape | `src/components/landing/sections/system-intro.tsx`, `src/components/brand/graphics/event-edge-route.tsx`, `src/components/landing/motion/event-edge.ts` |
| §2 timing wall | `sections/tension.tsx`, `graphics/quote-window.tsx`, `motion/quote-window.ts` |
| §3 interlock | `sections/protocol.tsx`, `graphics/execution-protocol.tsx`, `motion/execution-protocol.ts` |
| §4 agent bank | `sections/agents.tsx`, `graphics/agent-telemetry.tsx`, `motion/agent-telemetry.ts` |
| §5 proof | `sections/proof.tsx` only (interactivity is React state + CSS; no orchestrator edits) |

**Read-only for every section worker**: `use-landing-motion.ts`, `motion/live-loop.ts`,
`motion/registry.ts`, `motion/beam-pulse.ts`, `beam-arcs.ts`, `shared.tsx`,
`txbet-landing.tsx`, `sections/brand-splash.tsx`, `sections/delivery.tsx`, brand.md,
DESIGN.md, tests. If a worker believes a shared file must change, it stops and reports
instead of editing.

Motion modules keep the contract `animate<X>(asset: SVGSVGElement): MotionCleanup`,
dispatched from the Phase-1 registry by existing `data-gsap-asset` keys. New data
attributes are namespaced per section (`data-gsap-ledger-*`, `data-gsap-venue-*`,
`data-gsap-gate-*`, `data-gsap-agent-*`, `data-proof-*`).

## §1 — Event in. Edge checked. (reaction tape)

Story: the tape is fed by a stream; one qualifying event lights the route; complements
pair; the cost gate decides.

- **Event ledger (new, left rail of the instrument, ~15rem)**: 6 mono rows of
  TxLINE-format events (`63:00 RED CARD · H2`, `61:12 CORNER`, `58:40 SUB`, …), each
  `time / label / market-family` chip row. Loop steps a highlight cursor down the rows;
  non-qualifying rows flick dim (opacity 0.4), the qualifying row locks bright and
  emits the packet into the route. Mobile: ledger collapses to a single-row strip above
  the route showing only the qualifying event.
- **Route graphic**: strokes 3→3.5px main / 2.5px counter-rail; nodes become 12–14px
  squares/diamonds with attached chip labels (HTML chips positioned over the SVG or SVG
  `<text>` inside bordered rects — worker's call, but boxed); the capture zone gets a
  hatched-edge shaded band; the cost gate is redrawn as **two vertical gate slabs**
  (Split-Window Gate echo) that the packet passes between.
- **Packet**: a bright dash (strokeDash segment or small rect) travels event→split→
  YES/NO rails→pair diamond→gate each loop, with a 1px trailing fade. Same easing
  family as the hero pulse (power2.in on approach, power2.out on settle).
- **Metrics ledger (right)**: rows gain `tabular-nums` count-up on loop fire, a
  60×16 sparkline (SVG polyline, drawn once) under "after costs", and a row flash
  toward success ≤300ms. Bottom "exact pair matched" rail: the StatusGlyph pings once
  per loop.

## §2 — One event. Many clocks. (timing wall)

Story: one truth, staggered venue clocks, a brief capture window.

- Kill the empty side cells: the instrument spans the full 1500px field with dense
  edge-to-edge keylines.
- **ms ruler**: horizontal top rail 0→3,000ms with ticks every 250ms (labels at 0 /
  800 / 1,500 / 3,000), mono 11px.
- **Venue rows (new, 4)**: `V01–V04 / SYNTHETIC`, each a thin timing bar that fills
  left→right and snaps at its repricing time (V01 ~620ms … V04 ~2,600ms). Row readout
  right-aligned counts up to its snap time; rows snapping inside the capture band get a
  success chip `IN WINDOW`, later rows get warning `LATE`. Mobile: 3 rows, tighter.
- **Capture band**: vertical column ~600–1,100ms across ruler + all rows: 4% foreground
  fill, hatched 1px edges, `CAPTURE / 800ms` flag anchored to the ruler (boxed chip, not
  floating). The existing two-line convergence chart compresses to a ~9rem-tall strip
  above the venue rows (thicker strokes per §1 rules), converging inside the band.
- **Metric row** (0ms / 800ms / 3,000ms) stays anchored beneath, values count-up per
  loop with the same flash discipline. Footer disclosure rail unchanged.

## §3 — Speed finds it. Rules decide it. (interlock + refusal)

Story: four gates; speed passes only what the rules allow — and sometimes they refuse.

- **Gate slabs**: the four checks become four pairs of vertical slabs on the rail
  (direct Split-Window Gate quotation). A check passing = slabs part (translateX ±,
  150ms ease-out) as the packet passes; its readout chip beneath fills:
  `RED CARD / 63:00`, `TERMS EXACT`, `DEPTH 2×$40`, `.952 < 1.000`.
- **Refusal variant**: every 4th loop, gate 04 stays shut — packet decelerates, stops,
  drops to a lower exit rail labeled `NO TRADE / edge consumed` (warning tone), status
  readout flips to `guard refused / 04`. Serif stage cards below reflect state: passing
  loop highlights all four; refusal loop leaves Guard dimmed with a warning chip.
- **Left column** (under the copy): compact live protocol ledger — 4 rows
  (`01 WAKE … 04 GUARD`) with state glyphs synced to the loop (pass sweep, or refuse on
  the 4th) — fills the current dead space; hidden on mobile (panel's own labels
  suffice).
- Existing pause control, synthetic footer, mobile vertical graphic keep their roles;
  mobile graphic gains the same slab/refusal states in vertical form.

## §4 — Pick the match signal. (agent bank)

Story: six armed operators sharing one engine.

- **One instrument bank**: a continuous baseline grid runs behind all six cards (shared
  background layer in the section, cards sit on it borderless-bottom so the row reads
  as one bank). Cards keep 4/5 telemetry tiles.
- **Scan cursor**: per-card thin vertical cursor sweeps the trace on a slow loop
  (staggered card-to-card ~0.4s so the bank shimmers), event dot pings when the cursor
  crosses the trigger point. In-view draw stays once; the sweep is the loop.
- **Hover / focus (hover-capable devices)**: border brightens to `foreground/35`
  (exists), glyph chip inverts (bg-foreground text-background, 150ms), trace redraws
  fast (280ms), and a **microdata row reveals** in the card footer: `WINDOW 800MS ·
  COMPLEMENTS 4 · GATE SHARED` (per-agent values). Touch: microdata always visible.
- **State chip** per card footer: `ARMED / DETERMINISTIC` (mono, muted). Cards remain
  non-link articles (arming happens in console; do not add fake CTAs).

## §5 — No edge. No trade. (decision evidence)

Story: four deterministic windows, inspectable; refusal is evidence.

- **Window tabs**: segmented control above the report — `W1 MATCHED / W2 NO TRADE /
  W3 NO TRADE / W4 UNHEDGED` (real `<button>`s, roving focus, aria-selected). Switching
  swaps the report card AND the six-gate checklist outcomes:
  - W1: all six PASS (current data: $4.80, 5.03% captured, 800ms route).
  - W2: gates 01–04 PASS, 05 FAIL warning (`after-cost bundle above payout`), big tile
    "No trade" (existing 3,000ms missed content).
  - W3: gates 01–03 PASS, 04 FAIL warning (`depth unequal`), "No trade".
  - W4: all PASS but fill state `UNHEDGED / one leg filled` danger tile `-$0.40`,
    matching the summary tile row (danger `1`).
- **Gate sweep**: on tab switch, checklist rows re-resolve top-to-bottom with a 40ms
  stagger (CSS transitions + transition-delay, `motion-safe:` only); FAIL rows use
  warning (W2/W3) or danger (W4) with a one-line reason under the gate text.
- **Count-ups**: `$4.80` and `5.03%` count up once on first reveal (≤600ms,
  tabular-nums, gated by `useReducedMotion` from motion/react). Tab switches are
  instant swaps (150ms cross-fade max), not re-counted.
- Summary tile row (matched/no-trade/unhedged counts) highlights the tile matching the
  active window. Disclosure footer text unchanged. All data remains the existing
  synthetic values — no new claims.

## Verification bar (every phase)

`pnpm verify` green (lint, typecheck, vitest incl. landing-ssr, build); server HTML
visually identical pre-hydration; no console errors; loops pause off-screen/hidden;
reduced-motion fully static; mobile 375px no overflow; anti-slop scan clean.

## Doc updates

brand.md chapter-grammar + DESIGN.md motion bullets get a short amendment for: venue
timing rows, interlock refusal variant, proof window tabs, agent scan cursors.
**Reserved for the orchestrator (Fable) after Phase 2 review — workers do not edit
brand.md/DESIGN.md.**
