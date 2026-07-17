begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.profiles (id, privy_did, verified_email) values
  ('00000000-0000-4000-8000-000000000011', 'did:privy:rls-one', 'rls-one@example.test'),
  ('00000000-0000-4000-8000-000000000012', 'did:privy:rls-two', 'rls-two@example.test');

insert into public.wallets (
  id, profile_id, privy_wallet_id, chain, kind, address_bytes, address_canonical,
  checksum_display, checksum_verified_at, ownership_revision
) values
  ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000011',
   'rls-wallet-one', 'evm', 'embedded', decode('1111111111111111111111111111111111111111', 'hex'),
   '0x1111111111111111111111111111111111111111', '0x1111111111111111111111111111111111111111', now(), 'v1'),
  ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000012',
   'rls-wallet-two', 'evm', 'embedded', decode('2222222222222222222222222222222222222222', 'hex'),
   '0x2222222222222222222222222222222222222222', '0x2222222222222222222222222222222222222222', now(), 'v1');

insert into public.kill_switch_events (profile_id, scope_kind, scope_key, state, reason, evidence_hash)
values ('00000000-0000-4000-8000-000000000011', 'profile', 'self', 'active', 'test', repeat('a', 64));

set local role txbet_web;
set local "request.profile_id" = '00000000-0000-4000-8000-000000000011';

select results_eq(
  $$select id from public.profiles order by id$$,
  $$values ('00000000-0000-4000-8000-000000000011'::uuid)$$,
  'web role reads only its profile'
);
select results_eq(
  $$select profile_id from public.wallets order by profile_id$$,
  $$values ('00000000-0000-4000-8000-000000000011'::uuid)$$,
  'web role reads only its wallets'
);
select is(public.request_profile_id(), '00000000-0000-4000-8000-000000000011'::uuid, 'RLS helper returns transaction context');
select throws_ok(
  $$update public.wallets set ownership_revision = 'hijacked' where id = '10000000-0000-4000-8000-000000000011'$$,
  '42501', null, 'web cannot update wallet ownership'
);
select throws_ok(
  $$update public.kill_switch_events set state = 'reset' where profile_id = '00000000-0000-4000-8000-000000000011'$$,
  '42501', null, 'web cannot reset kill-switch audit rows'
);
select throws_ok(
  $$select * from public.venue_certification_versions$$,
  '42501', null, 'web cannot read certification internals'
);
select lives_ok(
  $$select * from public.venue_certification_readiness$$,
  'web can read the safe certification readiness projection'
);

reset role;
set local role txbet_market_worker;
select throws_ok(
  $$select * from public.profiles$$,
  '42501', null, 'market worker cannot read profiles'
);
select throws_ok(
  $$select * from public.automation_grants$$,
  '42501', null, 'market worker cannot read grants'
);

reset role;
select is(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles has RLS enabled'
);
select is(
  (select relforcerowsecurity from pg_class where oid = 'public.profiles'::regclass),
  true,
  'profiles forces RLS for its owner'
);

select * from finish();
rollback;
