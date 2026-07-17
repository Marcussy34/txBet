begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

select has_table('public', 'venue_certification_versions', 'certification versions exist');
select has_table('public', 'venue_eligibility_evidence', 'eligibility evidence exists');
select has_table('public', 'venue_eligibility_refresh_claims', 'eligibility refresh claims exist');
select has_table('public', 'venue_eligibility_current', 'eligibility current pointers exist');
select has_table('public', 'runtime_control_state', 'runtime controls exist before execution migrations');

insert into public.profiles (id, privy_did, verified_email)
values ('00000000-0000-4000-8000-000000000021', 'did:privy:control', 'control@example.test');
insert into public.wallets (
  id, profile_id, privy_wallet_id, chain, kind, address_bytes, address_canonical,
  checksum_display, checksum_verified_at, ownership_revision
) values (
  '10000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000021',
  'control-wallet', 'evm', 'embedded', decode('1111111111111111111111111111111111111111', 'hex'),
  '0x1111111111111111111111111111111111111111', '0x1111111111111111111111111111111111111111', now(), 'v1'
);
insert into public.venue_accounts (
  id, profile_id, wallet_id, venue_id, account_revision, environment_revision,
  account_identifier, state
) values (
  '30000000-0000-4000-8000-000000000021', '00000000-0000-4000-8000-000000000021',
  '10000000-0000-4000-8000-000000000021', 'polymarket', 'account-v1', 'prod-v1',
  'safe-account-id', 'ready'
);

select throws_ok(
  $$insert into public.risk_limits (profile_id, maximum_per_order_micros, rolling_24h_micros)
    values ('00000000-0000-4000-8000-000000000021', -1, 1)$$,
  '23514', null, 'negative monetary limits are rejected'
);
select throws_ok(
  $$insert into public.risk_limits (profile_id, maximum_per_order_micros, rolling_24h_micros)
    values ('00000000-0000-4000-8000-000000000021', 100000001, 1000000000)$$,
  '23514', null, '$100 per-order platform ceiling is enforced'
);
select throws_ok(
  $$insert into public.risk_limits (profile_id, maximum_per_order_micros, rolling_24h_micros)
    values ('00000000-0000-4000-8000-000000000021', 100000000, 1000000001)$$,
  '23514', null, '$1,000 rolling-day platform ceiling is enforced'
);

insert into public.venue_certification_versions (
  id, venue_id, certification_version, adapter_build_hash, official_baseline_hash,
  official_baseline_accessed_at, account_policy_version, host_allowlist_hash,
  chain_allowlist_hash, contract_allowlist_hash, program_allowlist_hash,
  exact_entry_capability, contract_test_evidence_hash, shadow_soak_evidence_hash,
  issued_by, issued_at, expires_at
) values (
  '40000000-0000-4000-8000-000000000021', 'polymarket', 1, repeat('a', 64), repeat('b', 64),
  current_date, 'policy-v1', repeat('c', 64), repeat('d', 64), repeat('e', 64), repeat('f', 64),
  true, repeat('1', 64), repeat('2', 64), 'operator@example.test', now(), now() + interval '1 day'
);
select throws_ok(
  $$update public.venue_certification_versions set adapter_build_hash = repeat('9', 64)
    where id = '40000000-0000-4000-8000-000000000021'$$,
  '55000', null, 'certification versions are immutable'
);
select throws_ok(
  $$insert into public.venue_certification_versions (
      venue_id, certification_version, adapter_build_hash, official_baseline_hash,
      official_baseline_accessed_at, account_policy_version, host_allowlist_hash,
      chain_allowlist_hash, contract_allowlist_hash, program_allowlist_hash,
      exact_entry_capability, contract_test_evidence_hash, shadow_soak_evidence_hash,
      issued_by, issued_at, expires_at
    ) values (
      'rain', 1, repeat('a',64), repeat('b',64), current_date, 'v1', repeat('c',64),
      repeat('d',64), repeat('e',64), repeat('f',64), true, repeat('1',64), repeat('2',64),
      'operator', now(), now() + interval '1 day'
    )$$,
  '22P02', null, 'unknown venue IDs are rejected'
);

select throws_ok(
  $$insert into public.venue_eligibility_evidence (
      profile_id, wallet_id, venue_account_id, venue_id, account_revision,
      environment_revision, scope_kind, action, canonical_contract_version_id,
      venue_market_binding_revision, status, source_revision, reason_revision,
      observed_at, expires_at, refresh_generation, refresh_fence, evidence_hash
    ) values (
      '00000000-0000-4000-8000-000000000021', '10000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000021', 'polymarket', 'account-v1', 'prod-v1',
      'venue', 'onboarding', gen_random_uuid(), 'market-v1', 'eligible', 'source-v1',
      'reason-v1', now(), now() + interval '1 minute', 1, 1, repeat('a',64)
    )$$,
  '23514', null, 'venue-wide evidence cannot carry market bindings'
);

set local role txbet_execution_worker;
select throws_ok(
  $$insert into public.venue_certification_versions (
      venue_id, certification_version, adapter_build_hash, official_baseline_hash,
      official_baseline_accessed_at, account_policy_version, host_allowlist_hash,
      chain_allowlist_hash, contract_allowlist_hash, program_allowlist_hash,
      exact_entry_capability, contract_test_evidence_hash, shadow_soak_evidence_hash,
      issued_by, issued_at, expires_at
    ) values (
      'polymarket', 2, repeat('a',64), repeat('b',64), current_date, 'v2', repeat('c',64),
      repeat('d',64), repeat('e',64), repeat('f',64), true, repeat('1',64), repeat('2',64),
      'worker', now(), now() + interval '1 day'
    )$$,
  '42501', null, 'runtime worker cannot write certification versions directly'
);

select lives_ok(
  $$select * from public.claim_venue_eligibility_refresh(
      '00000000-0000-4000-8000-000000000021',
      '10000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000021',
      'polymarket', 'account-v1', 'prod-v1', 'market', 'entry',
      '50000000-0000-4000-8000-000000000021', 'binding-v1', 'worker-one', 1
    )$$,
  'execution worker claims a generation and fence before I/O'
);
reset role;

select is(
  (select generation from public.venue_eligibility_refresh_claims
    where profile_id = '00000000-0000-4000-8000-000000000021'),
  1::bigint,
  'first refresh claim receives generation one'
);
select pg_sleep(0.01);

set local role txbet_execution_worker;
select lives_ok(
  $$select * from public.claim_venue_eligibility_refresh(
      '00000000-0000-4000-8000-000000000021',
      '10000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000021',
      'polymarket', 'account-v1', 'prod-v1', 'market', 'entry',
      '50000000-0000-4000-8000-000000000021', 'binding-v1', 'worker-two', 60000
    )$$,
  'expired refresh lease can be taken over with a higher fence'
);
select is(
  public.complete_venue_eligibility_refresh(
    (select id from public.venue_eligibility_refresh_claims where profile_id = '00000000-0000-4000-8000-000000000021'),
    2, 2, 'worker-two', 'denied', 'source-v2', 'reason-v2', now(), now() + interval '1 minute', repeat('b',64)
  ),
  true,
  'winning completion advances the current pointer'
);
select is(
  public.complete_venue_eligibility_refresh(
    (select id from public.venue_eligibility_refresh_claims where profile_id = '00000000-0000-4000-8000-000000000021'),
    1, 1, 'worker-one', 'eligible', 'source-v1', 'reason-v1', now() - interval '1 minute', now() + interval '1 minute', repeat('c',64)
  ),
  false,
  'delayed old completion is audit-only and cannot advance the pointer'
);
reset role;

select is(
  (select e.status::text
   from public.venue_eligibility_current c
   join public.venue_eligibility_evidence e on e.audit_sequence = c.evidence_audit_sequence),
  'denied',
  'current lookup follows the optimistic pointer rather than newest source time'
);
select is(
  (select count(*) from public.venue_eligibility_evidence),
  2::bigint,
  'both winning and delayed evidence remain append-only audit records'
);

insert into public.kill_switch_events (profile_id, scope_kind, scope_key, state, reason, evidence_hash)
values ('00000000-0000-4000-8000-000000000021', 'profile', 'self', 'active', 'test', repeat('d',64));
select throws_ok(
  $$delete from public.kill_switch_events where profile_id = '00000000-0000-4000-8000-000000000021'$$,
  '55000', null, 'kill-switch events are append-only'
);

select has_index('public', 'venue_accounts', 'venue_accounts_profile_id_idx', 'venue account profile foreign key is indexed');
select has_index('public', 'venue_eligibility_evidence', 'venue_eligibility_evidence_profile_id_idx', 'eligibility profile foreign key is indexed');

select * from finish();
rollback;
