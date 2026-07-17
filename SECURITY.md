# Security

## Secrets

- Keep TxLINE API tokens and future venue credentials in `.env`; never commit them.
- The TxLINE smoke command prints only counts and normalized action names.
- Do not paste guest JWTs, API tokens, wallet files, signatures, or raw authenticated responses into issues or demo videos.

## Execution

The bundled project performs simulated execution only. Any live venue adapter must:

- verify the account, network, market, outcome mapping, and settlement fingerprint;
- use bounded IOC-style orders where supported;
- recheck readiness immediately before submission;
- return partial and unknown states explicitly;
- reconcile every ambiguous result before new trades are allowed;
- activate the kill switch whenever filled quantities differ.
- reject non-finite, fractional, negative, overfilled, or otherwise invalid execution quantities.

Report private vulnerabilities directly to the repository owner rather than opening a public issue.

## Dependency audit

The 2026-07-17 production audit of the live-execution foundation found vulnerable
transitive `ws` and PostCSS releases. Root pnpm overrides pin their official patched
releases (`ws` 8.21.1 and PostCSS 8.5.19) until the Privy/Next.js dependency graphs adopt
them directly. Frozen install, typecheck, tests, and build must verify every override.

The same audit reports the moderate `uuid` buffer-bound advisory through legacy
MetaMask connector dependencies pulled by `@privy-io/react-auth`. Its official patched
release is a new major version, so txBet does not force that incompatible version through
third-party wallet code. The application must not call the affected buffer-output API;
upgrade the Privy connector graph when it publishes a compatible fix. This accepted
moderate advisory does not waive the rule that any critical/high production advisory
blocks live promotion.
