# txBet brand

Status: active

txBet is an event-triggered arbitrage orchestrator. The identity visualizes two venue legs converging on one settlement diamond and closing on an orange execution rail.

## Naming

- Product: `txBet`
- Repository and package slug: `txbet`
- Tagline: “The match event wakes the agent. Settlement math decides.”
- Operating rule: “No edge, no trade.”

Keep txBet standalone. Do not inherit another product's name, marks, secrets, or infrastructure.

## Palette — Split Signal

| Role | OKLCH | Hex seed | Meaning |
|---|---|---|---|
| Night pitch | `oklch(0.115 0.014 175)` | `#0B1110` | Primary background |
| Chalk | `oklch(0.955 0.018 94)` | `#F8F4E8` | Facts and primary text |
| Feed cyan | `oklch(0.82 0.13 197)` | `#66DDE7` | TxLINE input and YES leg |
| Locked mint | `oklch(0.86 0.19 130)` | `#B8F15A` | Matched state and NO leg |
| Event orange | `oklch(0.765 0.19 55)` | `#FF8A45` | Match shock, caution, and execution rail |

Orange never means profit. Mint is reserved for conditions that are actually matched or passed.

## Typography

- Display: Barlow Condensed, weights 600–700
- Body: Manrope Variable
- Data: IBM Plex Mono, weights 400–500

Fonts are installed locally through Fontsource. The app does not depend on a runtime font CDN.

## Mark

The mark contains:

1. a cyan incoming YES rail;
2. a mint incoming NO rail;
3. a chalk decision diamond;
4. an orange settlement/execution rail.

Keep clear space equal to one quarter of the mark width. Do not add balls, trophies, FIFA marks, national crests, or real venue logos.

## Product icon rule

Use the custom txBet mark, agent glyphs, and status glyphs for product concepts. Lucide is limited to familiar utility controls such as play, pause, reset, and step.

## Voice

Write like a risk-aware trading operator: direct, numerical, and explicit about state. Prefer “candidate,” “matched after both fills,” and “older quote.” Avoid “free money,” “risk-free,” or “guaranteed” before the bundle is fully matched.
