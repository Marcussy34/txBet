# World Cup Platform Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the secure multi-user platform foundation for Google login, embedded wallets, profile ownership, user risk settings, time-limited automation grants, protected APIs, and Supabase roles/RLS.

**Architecture:** Privy is the identity and wallet provider. Next.js route handlers verify Privy access tokens and use a dedicated RLS-constrained Postgres connection. Railway workers use a different least-privilege connection. The browser never connects to Supabase directly and never receives server, signer, venue, RPC, or database credentials.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Zod, Privy React Auth and Node SDKs, `pg`, Supabase CLI/Postgres, Vitest, shadcn/ui, Tailwind, and lucide-react.

## Global Constraints

- Follow the master plan's constraints and preserve `/console` unchanged.
- Use `src/proxy.ts`; Next.js 16 has replaced the old middleware convention.
- Google is the only configured login method in phase one.
- Provision exactly one embedded EVM wallet and one embedded Solana wallet per profile.
- A profile is keyed by verified Privy DID. Email is display/contact data, not an ownership key.
- Wallet IDs and addresses are accepted only from verified Privy data.
- A grant expires within seven days and activates only after both wallet policies are verified server-side.
- No auth token, API credential, wallet secret, or signed payload enters local/session storage or application logs.
- Do not commit or push. Use the review checkpoints below.

---

## Task 1: Lock the Baseline and Install Foundation Dependencies

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Modify: `vitest.config.ts`
- Create: `playwright.config.ts`

- [ ] Run the untouched baseline and save no generated artifacts:

```bash
pnpm verify
git status --short
```

Expected: `pnpm verify` exits `0`; only the user's pre-existing changes are shown.

- [ ] Surgically add `/dist`, `/playwright-report`, `/test-results`, and `/supabase/.temp` to `.gitignore` before running new build/test tools. Do not reorder or rewrite existing ignore rules.

- [ ] Install the current official packages and lock their resolved versions:

```bash
pnpm add @privy-io/react-auth @privy-io/node pg resend server-only
pnpm add -D @types/pg @playwright/test @testing-library/react @testing-library/jest-dom jsdom supabase tsup
pnpm exec playwright install chromium
```

- [ ] Add these scripts without replacing existing scripts:

```json
{
  "scripts": {
    "build:workers": "tsup",
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "test:db": "supabase test db",
    "test:workers": "vitest run tests/workers",
    "test:e2e": "playwright test",
    "worker:market-data": "node dist/workers/market-data.js",
    "worker:execution": "node dist/workers/execution.js"
  }
}
```

- [ ] Change Vitest's include to `tests/**/*.test.{ts,tsx}` and keep the Node default. Tests that require a DOM must opt in with a per-file `@vitest-environment jsdom` annotation.

- [ ] Configure Playwright to start `pnpm dev`, use `http://127.0.0.1:3000`, retain traces only on failure, and forbid production credentials in its environment.

- [ ] Verify dependency integrity:

```bash
pnpm install --frozen-lockfile
pnpm audit --prod
pnpm typecheck
```

Expected: frozen install and typecheck pass. Record any audit advisory in `SECURITY.md`; a critical/high production advisory blocks this plan.

- [ ] Review checkpoint:

```bash
git diff -- package.json pnpm-lock.yaml vitest.config.ts playwright.config.ts
```

Do not commit.

## Task 2: Define and Test the Environment and Upstream-URL Contract

**Files:**

- Modify: `.env.example`
- Create: `src/server/config/env.ts`
- Create: `src/server/security/upstream-url.ts`
- Create: `src/server/security/redaction.ts`
- Create: `src/server/crypto/envelope.ts`
- Create: `src/server/crypto/keyring.ts`
- Create: `tests/server/env.test.ts`
- Create: `tests/server/upstream-url.test.ts`
- Create: `tests/server/redaction.test.ts`
- Create: `tests/server/envelope.test.ts`
- Create: `tests/server/keyring.test.ts`

- [ ] Write failing tests proving:

  - web config requires `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `SUPABASE_WEB_DATABASE_URL`, and `NEXT_PUBLIC_SITE_URL`;
  - market-worker config requires its own `SUPABASE_MARKET_DATABASE_URL` and read-only feed credentials;
  - execution-worker config requires its own `SUPABASE_EXECUTION_DATABASE_URL`, `PRIVY_AUTHORIZATION_PRIVATE_KEY`, `PRIVY_KEY_QUORUM_ID`, policy IDs, encryption keyring, RPC URLs, and venue credentials;
  - every envelope key decodes to exactly 32 bytes, key IDs are unique, and the active ID exists;
  - `EXECUTION_MODE` accepts only `disabled`, `shadow`, `canary`, or `live`, controls new entries only, and defaults to `disabled`;
  - `RECOVERY_ACTION_MODE` accepts only `enabled` or `frozen` and defaults to `frozen`; it independently controls signing/submission for cancellation, compensation, and redemption of already persisted exposure;
  - `ASSET_VALUE_POLICIES_JSON` is visible only to market/execution loaders and contains a closed, versioned, expiring policy for every configured collateral asset; malformed bounds, unknown networks/assets, duplicate versions, or missing evidence hashes fail startup;
  - upstream URLs require `https:` or `wss:`, have no username/password, and match the exact configured host;
  - redaction removes authorization, cookie, HMAC, API-key, signed-payload, and private-key fields recursively.
  - AES-256-GCM envelope round trips across active and decrypt-only keys, always encrypts with the active key, rejects tampering/wrong AAD/unknown key, and never serializes plaintext.

```ts
it("rejects a credential-bearing upstream URL", () => {
  expect(() => assertAllowedUpstream(
    "https://secret@example.com/path",
    { protocols: ["https:"], hosts: ["example.com"] },
  )).toThrow(/credentials/i);
});
```

- [ ] Run the tests and confirm failure because the modules do not exist:

```bash
pnpm vitest run tests/server/env.test.ts tests/server/upstream-url.test.ts tests/server/redaction.test.ts
```

- [ ] Implement separate loaders so a web import cannot load execution-only secrets:

```ts
export function loadPublicEnv(source = process.env): PublicEnv;
export function loadWebEnv(source = process.env): WebEnv;
export function loadExecutionWorkerEnv(source = process.env): ExecutionWorkerEnv;
export function loadMarketWorkerEnv(source = process.env): MarketWorkerEnv;
```

Every function parses a freshly constructed object with Zod and returns an immutable value. Do not export a module-level parsed worker environment.

- [ ] Implement a generic `EncryptedEnvelopeV1` with random 96-bit IV, AES-256-GCM, key ID/version, and caller-supplied AAD. `EnvelopeKeyring` exposes one active encrypt key plus zero or more decrypt-only historical keys, selects decryption strictly by envelope key ID, and never tries every key. This single module encrypts venue credentials and replayable prepared/signed execution artifacts. It never logs plaintext, ciphertext, keys, or AAD containing personal data.

- [ ] Add these txBet-owned names to `.env.example`, with blank secret values:

```dotenv
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_PRIVY_APP_ID=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
PRIVY_AUTHORIZATION_PRIVATE_KEY=
PRIVY_KEY_QUORUM_ID=
PRIVY_POLYMARKET_POLICY_ID=
SUPABASE_WEB_DATABASE_URL=
SUPABASE_MARKET_DATABASE_URL=
SUPABASE_EXECUTION_DATABASE_URL=
SUPABASE_MIGRATION_DATABASE_URL=
TXBET_ENVELOPE_ACTIVE_KEY_ID=
TXBET_ENVELOPE_KEYRING_JSON=
TXLINE_BASE_URL=https://txline.txodds.com
TXLINE_API_TOKEN=
TXLINE_WORLD_CUP_COMPETITION_IDS=
ASSET_VALUE_POLICIES_JSON=
POLYMARKET_CLOB_URL=https://clob.polymarket.com
POLYMARKET_MARKET_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/market
POLYMARKET_USER_WS_URL=wss://ws-subscriptions-clob.polymarket.com/ws/user
POLYMARKET_GAMMA_URL=https://gamma-api.polymarket.com
POLYMARKET_RELAYER_URL=https://relayer-v2.polymarket.com/
POLYMARKET_CHAIN_ID=137
POLYMARKET_COLLATERAL_ADDRESS=0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB
POLYMARKET_CTF_ADDRESS=0x4D97DCd97eC945f40cF65F87097ACe5EA0476045
POLYMARKET_EXCHANGE_ALLOWLIST=["0xE111180000d2663C0091e4f400237545B87B996B","0xe2222d279d744050d28e00520010520000310F59"]
POLYMARKET_RELAYER_API_KEY=
POLYMARKET_RELAYER_API_KEY_ADDRESS=
POLYGON_RPC_URL=
DFLOW_API_BASE_URL=https://quote-api.dflow.net
DFLOW_WS_URL=wss://quote-api.dflow.net
DFLOW_API_KEY=
SOLANA_RPC_URL=
POLYGON_NATIVE_USD_UPPER_BOUND_MICROS=
SOLANA_NATIVE_USD_UPPER_BOUND_MICROS=
BSC_NATIVE_USD_UPPER_BOUND_MICROS=
BASE_NATIVE_USD_UPPER_BOUND_MICROS=
SX_NETWORK_NATIVE_USD_UPPER_BOUND_MICROS=
HYDROMANCER_NATIVE_USD_UPPER_BOUND_MICROS=
POLYGON_NETWORK_COST_POLICY_VALID_UNTIL=
SOLANA_NETWORK_COST_POLICY_VALID_UNTIL=
BSC_NETWORK_COST_POLICY_VALID_UNTIL=
BASE_NETWORK_COST_POLICY_VALID_UNTIL=
SX_NETWORK_COST_POLICY_VALID_UNTIL=
HYDROMANCER_NETWORK_COST_POLICY_VALID_UNTIL=
RESEND_API_KEY=
EMAIL_FROM=
OPERATOR_EMAILS=
EXECUTION_MODE=disabled
RECOVERY_ACTION_MODE=frozen
CANARY_MAX_TOTAL_MICROS=10000000
```

Do not add any Predictefy-prefixed name or value.

- [ ] Add `docs/runbooks/envelope-key-rotation.md`. Rotation first deploys a keyring
  containing the new active key and all old decrypt-only keys, then a crash-safe execution
  worker job re-encrypts one credential/artifact at a time with optimistic versioning and
  the same semantic AAD. An old key may be removed only after database checks prove zero
  dependent credentials, prepared/signed artifacts, pending/reconciling/cancel/
  compensation/redemption attempts, or unresolved `UNKNOWN` records. Tests cover a crash
  before/after rewrite, concurrent use, rollback to the old active key, and refusal to
  remove a still-referenced key.

- [ ] Make network clients call `assertAllowedUpstream` before attaching credentials. Tests must prove redirect following is disabled for credential-bearing fetches.

- [ ] Run the focused tests and typecheck:

```bash
pnpm vitest run tests/server/env.test.ts tests/server/upstream-url.test.ts tests/server/redaction.test.ts tests/server/envelope.test.ts tests/server/keyring.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint with `git diff --check`; do not commit.

## Task 3: Create Postgres Roles, Identity, Wallet, and Control Tables

**Files:**

- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607170001_extensions_roles_and_helpers.sql`
- Create: `supabase/migrations/202607170002_identity_and_controls.sql`
- Create: `supabase/tests/database/001_identity_constraints_test.sql`
- Create: `supabase/tests/database/002_identity_rls_test.sql`
- Create: `supabase/tests/database/003_control_constraints_test.sql`
- Create: `docs/runbooks/supabase-roles.md`

- [ ] Start local Supabase and write failing pgTAP tests for:

  - unique `profiles.privy_did`;
  - one wallet per `(profile_id, chain)` for `evm` and `solana`;
  - chain-discriminated address rules: EVM canonical lowercase bytes/hex plus separately verified checksum display; Solana exact case-sensitive base58 string/decoded 32 bytes with no lowercasing;
  - EVM checksum and Solana base58 round trips, case/collision rejection, and cross-chain format refusal;
  - seven-day maximum grant expiry;
  - immutable venue certification versions, optimistic current pointer, expiry, closed venue IDs, and denied runtime writes;
  - profile/wallet/account/venue/environment plus typed venue-or-market/action-scoped eligibility evidence, pre-I/O refresh generations/fences, optimistic current pointer, expiry, append-only writes, delayed-response refusal, and cross-profile RLS denial;
  - nonnegative integer monetary limits;
  - platform ceiling checks for $100/order and $1,000 rolling day;
  - append-only kill-switch events;
  - web users reading only their own rows;
  - web users unable to update wallet ownership, grant verification, audit, or kill-switch reset fields.

```bash
pnpm db:start
pnpm test:db
```

Expected: the new SQL tests fail because migrations are absent.

- [ ] In migration `0001`, enable `pgcrypto`; create no-login, no-inherit roles `txbet_owner` and `txbet_function_owner`, where only `txbet_function_owner` has `BYPASSRLS`; create no-login group roles `txbet_web`, `txbet_market_worker`, and `txbet_execution_worker`; revoke `CREATE` on schema `public` from `PUBLIC`; transfer schema `public` ownership to `txbet_owner` (or explicitly grant only that role `USAGE, CREATE`); and add a stable invoker-rights RLS helper owned by `txbet_owner`:

```sql
create or replace function public.request_profile_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.profile_id', true), '')::uuid
$$;
```

Set an explicit safe `search_path`, revoke public execution, and grant it only to the
three txBet roles. Runtime login roles are members only of their corresponding group and
are never members of either owner role. The migration login may `SET ROLE txbet_owner`
or `txbet_function_owner` only during migrations and is not used by web or workers.
`txbet_function_owner` owns no schema/table/sequence, has no schema `CREATE`, and receives
only the exact table/sequence privileges needed by its audited functions.

- [ ] In migration `0002`, create:

```text
profiles
wallets
automation_grants
automation_grant_venues
venue_accounts
venue_eligibility_evidence
venue_eligibility_refresh_claims
venue_eligibility_current
venue_certification_versions
venue_certification_current
strategies
risk_limits
risk_state
kill_switch_events
operator_state
operator_allowlists
runtime_control_state
```

Use UUID public identifiers, `bigint` microdollar columns, `timestamptz`, lowercase snake_case names, explicit check constraints, indexed foreign keys, and a `version bigint not null default 1` on mutable aggregates.

`venue_certification_versions` is immutable and binds a `LiveVenueId`, adapter/build hash,
official-baseline hash/access date, account/policy version, fixed host/chain/contract/program
allowlist hashes, exact-entry capability, adapter-contract-test evidence, shadow-soak
evidence, issuer/operator, issued time, and expiry. `venue_certification_current` is an
optimistic pointer. Empty tables mean no venue is certified. Only the audited operator
function may insert/promote a version; execution may read; web sees a safe readiness
projection. Strategy activation, reservation, and both final gates require the same
current unexpired version and exact adapter/config hashes.

`venue_eligibility_evidence` is append-only and keyed by the exact profile, wallet,
venue-account revision, venue, environment revision, scope kind, action, canonical
contract version, and venue market-binding revision (the last two are null only for a
venue-wide onboarding scope). Database checks reject invalid scope/action/null
combinations. It records eligible/denied/unknown, source/reason revision, observed/expiry
times, refresh generation/fence, and an evidence hash covering the complete tuple and
scope. Only execution may insert; web RLS sees the caller's safe status; market/other
profiles cannot read it. `venue_eligibility_refresh_claims` is a mutable exact-tuple/scope
row with database-assigned generation, monotonic fence token, owner, lease expiry, and
version. A worker must atomically increment/claim the generation **before** network I/O.
The response transaction appends `venue_eligibility_evidence` with a database-assigned
audit sequence, then advances `venue_eligibility_current` only when generation, fence,
owner, and unexpired lease still match. A delayed or lease-lost response remains audit
evidence but cannot become current.

Current-evidence queries follow the exact tuple/scope pointer first, then require that
pointed row to be `eligible` and unexpired. They never sort completed responses, fall back
to an older eligible row, or reuse another account's result. Add races for eligible ->
denied/unknown -> expired, delayed old eligible after newer denial, lease loss/takeover,
out-of-order source timestamps, and duplicate timestamps.

`runtime_control_state` is a singleton with deployment entry/recovery ceilings, execution
config hash, recovery-path health, observed/expiry times, and optimistic version. Only the
execution-worker role may heartbeat it; runtime modes fail closed when it is missing or
stale. It exists in migration `0002` so kernel migration `0004` reservation/marker
functions can reference it before product worker integration in migration `0007`.

- [ ] Keep `wallets` limited to Privy wallet identity, chain/kind, chain-correct public address representation, ownership revision, and timestamps. Store venue funder/proxy/deposit/account bindings as versioned `venue_accounts`, and store policy/version/grant state only in `automation_grants` plus `automation_grant_venues`. One venue or grant revision must never overwrite another on the shared embedded wallet. Do not create a private-key or raw-authorization-key column.

- [ ] Enable and force RLS on user-facing tables. A representative policy is:

```sql
create policy profiles_select_self on public.profiles
for select to txbet_web
using (id = public.request_profile_id());
```

Market-worker policies can write market/pricing tables after those migrations exist but cannot select user credential ciphertext, grants, execution attempts, fills, positions, or notifications. Execution-worker policies can read current market evidence and operate grants/execution/outbox but cannot rewrite append-only market evidence. Add append-only triggers to `kill_switch_events`.

- [ ] Revoke all table, sequence, and function privileges from `PUBLIC`. Set default
  privileges for objects created by `txbet_owner`, then grant explicit per-table and
  per-sequence operations to each runtime group. pgTAP impersonation tests must prove both
  intended access and denied cross-role access; RLS policies alone are not accepted as
  evidence that object privileges are wired. Ownership assertions require `txbet_owner`
  to own the application schema, every application table/sequence, and every
  invoker-rights function. Audited security-definer functions are the sole exception and
  must be owned by `txbet_function_owner`; no runtime or login role may own any object.

- [ ] Every later `SECURITY DEFINER` function is owned by `txbet_function_owner`, uses a fixed
  `SET search_path = pg_catalog, public`, schema-qualifies every object, validates the
  caller role and profile/worker authority internally, and has `EXECUTE` revoked from
  `PUBLIC` before an explicit grant to the minimum runtime role. Add a reusable pgTAP
  assertion that enumerates every security-definer function and fails for an unsafe owner,
  mutable search path, public execute privilege, missing caller check, or overbroad grant.
  Because user tables use `FORCE ROW LEVEL SECURITY`, the separate no-login
  `txbet_function_owner` is the only `BYPASSRLS` role. For every definer, pgTAP must also
  impersonate each allowed/denied caller and execute the function end to end, proving its
  internal profile/worker checks prevent cross-profile access despite the owner's bypass.

- [ ] Document how deploy operators create three separate login roles that inherit the no-login groups and place their web, market-data, and execution connection strings in the corresponding Vercel/Railway secret stores. The runbook must state that service-role and migration URLs never enter browser or normal worker configuration.

- [ ] Reset and run database tests:

```bash
pnpm db:reset
pnpm test:db
```

Expected: all identity/control pgTAP tests pass.

- [ ] Review checkpoint:

```bash
git diff --check
git diff -- supabase docs/runbooks/supabase-roles.md
```

Do not commit.

## Task 4: Add RLS-Constrained Database Contexts and Repositories

**Files:**

- Create: `src/server/db/client.ts`
- Create: `src/server/db/context.ts`
- Create: `src/server/db/types.ts`
- Create: `src/server/identity/repository.ts`
- Create: `src/server/risk/repository.ts`
- Create: `src/server/grants/repository.ts`
- Create: `tests/server/db-context.test.ts`
- Create: `tests/server/identity-repository.test.ts`
- Create: `tests/server/risk-repository.test.ts`
- Create: `tests/server/grant-repository.test.ts`

- [ ] Write failing tests with an injected `pg.Pool` proving:

  - `withUserTransaction` begins, sets `request.profile_id` transaction-locally, calls the callback, and commits;
  - error paths roll back and release the client;
  - `withMarketWorkerTransaction` and `withExecutionWorkerTransaction` use different pools and never set a user-selected role or profile;
  - repositories use parameterized queries and check `expectedVersion` for updates;
  - email changes do not merge identities;
  - wallet upsert is idempotent but rejects a wallet already owned by another profile.

```ts
export interface DbTransaction {
  query<T extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<T>>;
}

export function withUserTransaction<T>(
  profileId: string,
  operation: (transaction: DbTransaction) => Promise<T>,
): Promise<T>;
```

- [ ] Run the focused tests and confirm they fail.

- [ ] Implement one pool per runtime. Set finite connection and statement timeouts. Every transaction must be short; repository callbacks may not receive an upstream client.

- [ ] Implement identity, risk, and grant repositories with explicit selected columns. Do not use `select *` at API boundaries.

- [ ] Add keyset pagination helpers for chronological user lists; do not use large-offset pagination.

- [ ] Run:

```bash
pnpm vitest run tests/server/db-context.test.ts tests/server/identity-repository.test.ts tests/server/risk-repository.test.ts tests/server/grant-repository.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint with `git diff --check`; do not commit.

## Task 5: Verify Privy Sessions and Synchronize Embedded Wallet Ownership

**Files:**

- Modify: `src/app/layout.tsx`
- Create: `src/app/providers.tsx`
- Create: `src/components/providers/privy-provider.tsx`
- Create: `src/components/auth/google-sign-in-button.tsx`
- Create: `src/server/auth/privy.ts`
- Create: `src/server/auth/session.ts`
- Create: `src/server/auth/identity.ts`
- Create: `src/server/auth/types.ts`
- Create: `src/app/api/session/route.ts`
- Create: `src/app/sign-in/page.tsx`
- Create: `tests/auth/privy.test.ts`
- Create: `tests/auth/session.test.ts`
- Create: `tests/auth/identity.test.ts`
- Create: `tests/api/session.test.ts`

- [ ] Re-fetch Privy's embedded-wallet, automatic-wallet-creation, login-modal, and
  server-verification docs and record `Accessed: 2026-07-17` in `docs/architecture.md`. Use
  the current SDK method names below; a changed method stops implementation for a baseline
  refresh.

- [ ] Write failing tests for invalid/expired tokens, absent verified Google email, duplicate DID, wallet provisioning idempotency, wallet ownership conflict, and exactly one EVM plus one Solana embedded wallet.

- [ ] Define the SDK-independent boundary:

```ts
export interface PrivyIdentityClient {
  verifyAccessToken(token: string): Promise<VerifiedPrivyClaims>;
  getUser(privyDid: string): Promise<PrivyUserSnapshot>;
  ensureEmbeddedWallets(privyDid: string): Promise<{
    evm: PrivyWalletSnapshot;
    solana: PrivyWalletSnapshot;
  }>;
}

export function requireSession(request: Request): Promise<VerifiedSession>;
export function requireOperatorSession(request: Request): Promise<VerifiedSession>;
```

- [ ] Configure `PrivyProvider` with
  `embeddedWallets.ethereum.createOnLogin: "all-users"` and
  `embeddedWallets.solana.createOnLogin: "all-users"`. Trigger the Privy modal with
  `useLogin().login({ loginMethods: ["google"] })`; do not use the direct
  `useLoginWithOAuth` flow because Privy's automatic wallet-creation configuration does not
  apply to that custom flow. Keep the provider client-only and expose only
  `NEXT_PUBLIC_PRIVY_APP_ID`.

- [ ] Implement `POST /api/session` to:

  1. require a bearer token;
  2. verify it server-side with the current Node SDK entrypoint
     `privy.utils().auth().verifyAuthToken(token)`;
  3. fetch current Privy user/wallet data;
  4. upsert the profile and two wallet records transactionally;
  5. return the safe `VerifiedSession` projection.

Do not accept DID, email, wallet ID, address, or operator status from the request JSON.

- [ ] Derive operator status by exact normalized email membership in server-only `OPERATOR_EMAILS`, then require recent Privy authentication for operator mutations in the product plan.

- [ ] Run focused tests, typecheck, and an SSR regression:

```bash
pnpm vitest run tests/auth tests/api/session.test.ts tests/landing-ssr.test.ts
pnpm typecheck
```

Expected: all pass and the public landing page still server-renders.

- [ ] Review checkpoint; do not commit.

## Task 6: Implement Exact Risk Settings and Platform Ceilings

**Files:**

- Create: `src/server/risk/schema.ts`
- Create: `src/server/risk/policy.ts`
- Create: `src/server/risk/service.ts`
- Create: `src/server/strategies/schema.ts`
- Create: `src/server/strategies/repository.ts`
- Create: `src/server/strategies/service.ts`
- Create: `src/contracts/platform.ts`
- Create: `src/contracts/venues.ts`
- Create: `src/app/api/settings/route.ts`
- Create: `src/app/api/strategies/route.ts`
- Create: `tests/risk/schema.test.ts`
- Create: `tests/risk/policy.test.ts`
- Create: `tests/risk/service.test.ts`
- Create: `tests/strategies/service.test.ts`
- Create: `tests/contracts/venues.test.ts`
- Create: `tests/api/settings.test.ts`
- Create: `tests/api/strategies.test.ts`

- [ ] Write failing tests for decimal conversion, excess precision, negative values, platform caps, optimistic conflicts, both default profit floors, every approved venue ID, unknown venue refusal, and activation refusal for an uncertified/not-ready venue.

```ts
export interface RiskLimitsInput {
  maxOrderUsd: string;
  rolling24hUsd: string;
  strategyBudgetUsd: string;
  totalCapitalUsd: string;
  emergencyLossUsd: string;
  emergencyLossBps: number;
  maxContractExposureUsd: string;
  maxFixtureExposureUsd: string;
  maxTeamExposureUsd: string;
  maxVenueExposureUsd: string;
  maxAggregateExposureUsd: string;
  minNetReturnBps: number;
  minNetProfitUsd: string;
}
```

- [ ] Implement exact decimal-string parsing. Reject exponent notation and more than six decimal places. Convert only to integer microdollars.

- [ ] Enforce:

```text
maxOrderMicros <= 100_000_000
rolling24hMicros <= 1_000_000_000
minNetReturnBps >= 100
minNetProfitMicros >= 100_000
emergencyLossMicros <= 5_000_000
emergencyLossBps <= 500
each concentration limit <= maxAggregateExposureMicros <= totalCapitalMicros
```

User settings may be stricter, never looser. The bundle-dependent emergency-loss calculation happens in the execution kernel as the minimum of the user's absolute cap, the user's relative cap, 5% of bundle notional, and $5.

- [ ] Implement authenticated `GET` and `PUT /api/settings`. The PUT body includes `expectedVersion`; a mismatch returns `409` without overwriting a newer value.

- [ ] Define the closed approved venue registry once and use it in strategy, grant,
  onboarding, notification, execution, database-check, and UI schemas:

```ts
export const LIVE_VENUE_IDS = [
  "polymarket",
  "kalshi-dflow",
  "opinion",
  "predict-fun",
  "limitless",
  "sx-bet",
  "hydromancer",
] as const;

export type LiveVenueId = (typeof LIVE_VENUE_IDS)[number];
```

Migration `0002` accepts exactly this union in venue-bearing tables. Initially only the
phase-one lanes have implementation/certification records; listing an approved ID does
not make it executable.

- [ ] Implement one World Cup strategy shape:

```ts
export interface WorldCupStrategyInput {
  enabled: boolean;
  venueIds: readonly LiveVenueId[];
  marketScope: "all-verified-world-cup";
  riskLimitsVersion: number;
  expectedVersion: number;
}
```

The strategy always means exact complementary arbitrage across all verified World Cup families; it cannot enable directional trading. Activation requires two distinct approved venues, current risk settings, current server-side venue certification, ready venue accounts, and an active verified automation grant whose per-venue scopes cover both selected venues and bind the current strategy/venue spend ceilings. An approved-but-uncertified venue is selectable only as disabled UI metadata and is rejected by the activation service and database function. Deactivation is immediate and idempotent. Create the phase-one pair as a disabled default strategy during first session synchronization.

- [ ] Implement authenticated `GET` and `PUT /api/strategies` with optimistic versioning. The service ignores no unknown venue/family field; Zod rejects unexpected keys.

- [ ] Run:

```bash
pnpm vitest run tests/risk tests/strategies tests/api/settings.test.ts tests/api/strategies.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 7: Implement the Two-Wallet Automation Grant Lifecycle

**Files:**

- Create: `src/server/grants/types.ts`
- Create: `src/server/grants/privy-policy.ts`
- Create: `src/server/grants/service.ts`
- Create: `src/app/api/grants/route.ts`
- Create: `src/app/api/grants/prepare/route.ts`
- Create: `src/app/api/grants/[grantId]/confirm/route.ts`
- Create: `src/app/api/grants/[grantId]/revoke/route.ts`
- Create: `src/app/api/grants/[grantId]/confirm-revocation/route.ts`
- Create: `tests/grants/policy.test.ts`
- Create: `tests/grants/service.test.ts`
- Create: `tests/api/grants.test.ts`

- [ ] Re-fetch Privy's signer/policy/revocation docs. Write failing tests for expiry over seven days, missing wallet, wrong signer/quorum, wrong policy, partial confirmation, expired grant, duplicate confirm, and revoke failure.

- [ ] Lock the service boundary:

```ts
export interface PrivyPolicyClient {
  createGrantInstructions(input: GrantPolicyInput): Promise<PreparedWalletGrant[]>;
  inspectWalletGrant(walletId: string): Promise<ObservedWalletGrant>;
}

export function prepareAutomationGrant(input: {
  profileId: string;
  expiresAt: Date;
  expectedRiskVersion: number;
  venues: readonly {
    venueId: LiveVenueId;
    policyId: string;
    policyVersion: string;
    maxSpendMicros: Micros;
  }[];
}): Promise<PreparedAutomationGrant>;

export function confirmAutomationGrant(
  profileId: string,
  grantId: string,
): Promise<AutomationGrant>;
```

The grant service resolves `LiveVenueId` through an exhaustive venue-policy registry.
Missing implementation, policy configuration, certification, embedded wallet, chain, or
fixed onboarding/trading action allowlist is a typed refusal; there is no generic default
policy. User venue-account readiness is deliberately **not** required to prepare/confirm a
grant, because the fixed onboarding job needs that grant to deploy/discover accounts and
set allowances. Account readiness remains mandatory for strategy activation, reservation,
and both final gates. Tests cover a clean first user, a replacement venue, all seven IDs,
and proof that phase-two IDs cannot activate before their own plan registers/certifies the
exact policy and completes onboarding. `kalshi-dflow` is a recognized shadow/reporting ID
but has no policy configuration, onboarding mutation, or grant-confirmation action while
its official-documentation gate is closed; selecting it returns `NO_LIVE_ADAPTER` before
any Solana signer authority is requested.

- [ ] Persist `PREPARED` plus normalized `automation_grant_venues` before returning fixed wallet-specific confirmation actions. The browser executes those exact actions through Privy's user-authorized embedded-wallet flow, then calls confirm. Activate only when server-side inspection shows the selected venue policies on the required EVM/Solana wallets contain the exact expected signer/quorum, spend ceilings, allowed chains/contracts/programs, policy versions, and expiry.

- [ ] A new venue is never added to an active grant. Adding or widening a venue requires explicit user consent through a replacement/renewed grant. After the new wallet authority is confirmed, mark it `SUPERSESSION_PENDING`, pause affected strategies, and return only fixed user-authorized actions that remove the exact superseded txBet authority from each wallet. Server inspection must then prove the new expected authority exists and every old/unexpected txBet signer/policy is absent before one transaction marks the old grant `SUPERSEDED` and the new grant `ACTIVE`. Failure or Privy unavailability keeps both the pause and pending state; the execution worker resumes verification without inventing actions. Revoking one venue pauses every strategy that depends on it without expanding any other venue's authority.

- [ ] Both final gates enumerate the wallet's observed txBet authorities and require an
  exact set match to the one active grant. A stale, overlapping, or unexpected signer/
  policy fails closed even if the new grant itself is valid. Tests cover crash after new
  confirmation, partial old-scope removal, duplicate confirmation, removal timeout, worker
  recovery, and atomic database supersession.

- [ ] `POST .../revoke` first pauses the user and persists `REVOCATION_PENDING`, then returns fixed descriptors for removing the exact txBet signer from both wallets through Privy's current user-authorized client flow. `POST .../confirm-revocation` inspects both wallets server-side and persists `REVOKED` only when neither authority remains. If either authority remains or Privy is unavailable, retain `REVOCATION_PENDING` and the pause; the execution worker verifies it until grant expiry or confirmed removal. Vercel never receives the authorization private key.

- [ ] Ensure no route accepts arbitrary contracts, programs, methods, calldata, transaction bytes, or spend values. Venue plans provide fixed policy allowlists.

- [ ] Run:

```bash
pnpm vitest run tests/grants tests/api/grants.test.ts
pnpm typecheck
```

Expected: all pass.

- [ ] Review checkpoint; do not commit.

## Task 8: Add Protected Dashboard Shell and Central HTTP Guards

**Files:**

- Create: `src/server/http/guards.ts`
- Create: `src/server/http/responses.ts`
- Create: `src/server/security/headers.ts`
- Create: `src/proxy.ts`
- Modify: `next.config.ts`
- Create: `src/app/(authenticated)/dashboard/layout.tsx`
- Create: `src/app/(authenticated)/dashboard/page.tsx`
- Create: `src/app/(authenticated)/dashboard/settings/page.tsx`
- Create: `src/components/dashboard/live-dashboard.tsx`
- Create: `src/components/dashboard/risk-settings-form.tsx`
- Create: `src/components/dashboard/strategy-settings-form.tsx`
- Create: `src/components/dashboard/automation-grant-card.tsx`
- Create: `src/components/dashboard/wallet-readiness-card.tsx`
- Create: `tests/server/http-guards.test.ts`
- Create: `tests/security/headers.test.ts`
- Create: `tests/security/proxy.test.ts`
- Create: `e2e/onboarding.spec.ts`
- Create: `e2e/settings-and-grant.spec.ts`

- [ ] Write failing tests proving every mutation requires bearer auth, a JSON content type, an exact same-origin `Origin`, a Zod-valid body, an idempotency key where applicable, and ownership. Because txBet does not use cookies for API auth, reject cookie-only authentication.

- [ ] Add a nonce-based CSP path in `src/proxy.ts`, plus HSTS, `nosniff`, `DENY`, strict referrer, restrictive permissions, and `Cross-Origin-Opener-Policy: same-origin-allow-popups`.

- [ ] Keep CSP in report-only mode for local/staging Privy onboarding. `src/server/security/headers.ts` must contain explicit official Privy/txBet origins, no wildcard source, no `unsafe-eval`, and no user-controlled origin. The product plan promotes the tested policy to enforcement before canary.

- [ ] Implement the authenticated layout and shadcn/Tailwind forms. Show wallet public addresses, readiness, risk limits, grant expiry/status, and a permanent warning that live automation may use real funds. Do not add generic transaction controls.

- [ ] Ensure `src/proxy.ts` navigation checks are UX only; every route handler still calls `requireSession` or `requireOperatorSession`.

- [ ] Run:

```bash
pnpm vitest run tests/server/http-guards.test.ts tests/security tests/landing-ssr.test.ts
pnpm exec playwright test --grep "onboarding|settings|grant"
pnpm build
```

Expected: unit tests, E2E flows with mocked Privy, and production build pass.

- [ ] Review checkpoint, including the user's existing landing changes; do not modify those files and do not commit.

## Task 9: Document and Verify the Foundation

**Files:**

- Modify: `docs/architecture.md`
- Create: `docs/live-execution.md`
- Create: `docs/runbooks/grant-revocation.md`
- Modify: `SECURITY.md`
- Modify: `README.md`

- [ ] Document the Privy identity boundary, RLS roles, two-wallet lifecycle, grant states, environment ownership, and the absence of generic signing endpoints.

- [ ] Document a grant-revocation drill: activate in a development Privy app, revoke, verify both wallets, verify user pause, and inspect the audit row without exposing credentials.

- [ ] Run the full foundation gate:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:db
pnpm exec playwright test --grep "onboarding|settings|grant"
pnpm build
pnpm audit --prod
git diff --check
```

Expected: every command exits `0`; no critical/high production advisory remains.

- [ ] Search for forbidden platform patterns:

```bash
rg -n "localStorage|sessionStorage|dangerouslySetInnerHTML|SUPABASE_.*URL|PRIVY_AUTHORIZATION_PRIVATE_KEY|generic.*sign|sendTransaction" src
```

Expected: no auth/secret storage, unsafe HTML, client database secret, worker signer secret in client code, or generic signing API. Legitimate fixed server-side SDK calls must be manually reviewed.

- [ ] Review `git status --short` and the focused diff. Do not commit or push.
