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
