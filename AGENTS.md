# txBet contributor guidance

- Run `pnpm verify` before completion.
- Keep the engine deterministic and use integer microdollars for money.
- Fail closed on settlement, freshness, liquidity, and execution ambiguity.
- Do not add live-money execution without explicit authorization and adapter-level tests.
- Keep this repository standalone; do not copy another product's identity, secrets, or infrastructure.
- Preserve the permanent replay and simulated-execution disclosure in demo surfaces.
