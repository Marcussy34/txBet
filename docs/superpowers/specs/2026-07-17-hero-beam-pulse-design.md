# Hero beam event pulse — design

_Date: 2026-07-17 · Status: direction approved by Marcus ("Event pulse through the gate")_

## Context

The landing `BrandSplash` resolves its silver beam once on load, then sits static.
Marcus wants a restrained looping light effect after load that conveys fast execution.
`brand.md` previously said the beam must "never pulse, loop"; Marcus explicitly approved
amending that rule for this design. Everything stays monochrome — no color, no neon.

## Concept

The beam becomes a live conduit. On a randomized low-frequency loop, one bright light
packet fires down the beam fast, vanishes behind the identity (the existing corridor
mask already occludes the middle of the beam so nothing crosses text), the lockup blooms
softly as the packet "passes through the gate", and the packet re-emerges below the copy,
decelerates, and lands with a faint tick. Tiny electric micro-arcs crackle at emission
and re-emergence. It replays the product story: event in → through the system → fill out.

## Loop storyboard (one cycle, times from cycle start)

```
0.00s  charge      2–3 micro-arcs flicker near the beam top (~0.18s, canvas)
0.10s  fire        packet travels y −8% → 38% of splash, 0.42s, power2.in (accelerating)
                   packet visually vanishes into the mask ≈ 0.32s in
0.42s  gate bloom  radial glow behind lockup: opacity 0→0.35→0, scale 0.97→1.03, 0.5s
0.62s  re-emerge   packet travels y 62% → 104%, 0.5s, power2.out (decelerating)
1.05s  landing     bottom-rail tick: 1px line, width 24→64px, opacity 0→0.5→0, 0.35s
                   1–2 micro-arcs at the emergence point
1.40s  idle        next cycle scheduled at +random(2.6s, 4.6s)
```

First cycle fires ~1.5s after mount (after the existing splash springs settle), then loops.

## Elements

| Element | Placement | Notes |
|---|---|---|
| Pulse packet | inside `[data-gsap-beam]` (masked) | ~2px × ~120px vertical streak, transparent→white→transparent gradient, `translate3d` only |
| Arc canvas | inside `[data-gsap-beam]` (masked) | covers beam corridor width × full height; mask auto-occludes arcs near text |
| Gate bloom | behind the lockup (outside mask) | pre-rendered radial-gradient div, animate opacity/scale only; renders *behind* mark + wordmark; no CSS filter on text |
| Landing tick | bottom rail area inside beam container | 1px horizontal line, opacity/scaleX |

All new nodes are `aria-hidden="true"`, `pointer-events-none`, and visually empty in
server HTML, so SSR output and `landing-ssr.test.ts` stay valid.

## Micro-arcs (canvas)

Midpoint-displacement polylines: 2–3 recursion levels, 1–2 short branches, jittered per
burst. Monochrome white, line width 0.75–1.5px, slight `shadowBlur` (4–6) for glow,
alpha decays over ~150–220ms. rAF runs **only during a burst window**, canvas cleared and
rAF stopped between bursts. DPR-aware, capped at 2.

## Lifecycle and accessibility

- Registered inside `setupLandingMotion` so the existing native `prefers-reduced-motion`
  listener fully disables/enables it (reduced motion ⇒ effect never initializes).
- Pauses when the splash scrolls out of view (ScrollTrigger, same pattern as
  `connectLiveLoop`) and when the tab is hidden (`visibilitychange`).
- Inherits the existing scroll-scrub beam fade (elements live inside the beam container).
- No visible pause control on the hero: the opening surface stays free of controls per
  brand grammar; each active burst is ~1.4s (< 5s WCAG 2.2.2 threshold) with long idle
  gaps, and reduced-motion removes it entirely. Documented in DESIGN.md.
- Randomized scheduling uses `gsap.delayedCall`; cleanup kills timelines, delayed calls,
  ScrollTrigger, listeners, and clears the canvas.

## Performance budget

Transforms + opacity only (no layout properties, no animated box-shadow/filters on DOM).
Glows are pre-rendered gradients animated via opacity. Main thread idle between cycles.
Target 60fps on a mid-tier laptop; no long tasks from the loop.

## Code architecture

- `src/components/landing/beam-arcs.ts` — new, self-contained canvas arc renderer
  (`createBeamArcs(canvas)` → `{ burst(yFraction), destroy() }`). No React, no GSAP.
- `src/components/landing/use-landing-motion.ts` — new `animateBeamPulse(root)` returning
  `MotionCleanup`, invoked from `setupLandingMotion`; owns the GSAP timeline, scheduling,
  visibility gating. ASCII storyboard comment + named `BEAM_PULSE_TIMING` constants.
- `src/components/landing/txbet-landing.tsx` — `BrandSplash` gains the pulse/canvas/tick
  nodes inside the beam container and the bloom node behind the lockup, all inert hooks
  tagged with `data-gsap-*` attributes matching the existing convention.

## Doc amendments (same change)

- `brand.md` motion rule: beam still resolves once; after resolve, one restrained
  monochrome event pulse may traverse at low randomized frequency; must never cross text,
  never strobe, never add color; pauses off-screen/hidden; absent under reduced motion.
- `DESIGN.md` motion bullet: describe the hero event pulse and the no-control rationale.

## Acceptance criteria

1. After load, pulses loop with randomized 2.6–4.6s idle gaps; monochrome only.
2. Zero layout shift; server HTML visually unchanged before hydration.
3. `prefers-reduced-motion: reduce` ⇒ no pulse, no arcs, no bloom, no canvas work.
4. Tab hidden or splash off-viewport ⇒ loop paused (no rAF, no timeline progress).
5. `pnpm verify` (lint, typecheck, vitest incl. landing-ssr, build) passes.
6. `brand.md` + `DESIGN.md` updated consistently with the shipped behavior.
