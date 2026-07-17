begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

select has_table('public', 'profiles', 'profiles exists');
select has_table('public', 'wallets', 'wallets exists');
select has_table('public', 'automation_grants', 'automation grants exist');
select has_table('public', 'venue_accounts', 'venue accounts exist');

insert into public.profiles (id, privy_did, verified_email)
values ('00000000-0000-4000-8000-000000000001', 'did:privy:test-one', 'one@example.test');

select throws_ok(
  $$insert into public.profiles (privy_did, verified_email) values ('did:privy:test-one', 'two@example.test')$$,
  '23505',
  null,
  'Privy DID is unique'
);

insert into public.wallets (
  id, profile_id, privy_wallet_id, chain, kind, address_bytes,
  address_canonical, checksum_display, checksum_verified_at, ownership_revision
) values (
  '10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'privy-wallet-evm-one',
  'evm',
  'embedded',
  decode('1111111111111111111111111111111111111111', 'hex'),
  '0x1111111111111111111111111111111111111111',
  '0x1111111111111111111111111111111111111111',
  now(),
  'ownership-v1'
);
select pass('valid EVM wallet round trips to canonical bytes');

select throws_ok(
  $$insert into public.wallets (
      profile_id, privy_wallet_id, chain, kind, address_bytes, address_canonical,
      checksum_display, checksum_verified_at, ownership_revision
    ) values (
      '00000000-0000-4000-8000-000000000001', 'duplicate-evm', 'evm', 'embedded',
      decode('2222222222222222222222222222222222222222', 'hex'),
      '0x2222222222222222222222222222222222222222',
      '0x2222222222222222222222222222222222222222', now(), 'ownership-v1'
    )$$,
  '23505',
  null,
  'one wallet exists per profile and chain'
);

select throws_ok(
  $$insert into public.wallets (
      profile_id, privy_wallet_id, chain, kind, address_bytes, address_canonical,
      checksum_display, checksum_verified_at, ownership_revision
    ) values (
      '00000000-0000-4000-8000-000000000001', 'bad-evm-case', 'evm', 'embedded',
      decode('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'hex'),
      '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', now(), 'ownership-v1'
    )$$,
  '23514',
  null,
  'EVM canonical address must be lowercase'
);

select is(
  encode(public.solana_base58_decode('So11111111111111111111111111111111111111112'), 'hex'),
  '069b8857feab8184fb687f634618c035dac439dc1aeb3b5598a0f00000000001',
  'Solana base58 decode is exact'
);
select is(
  public.solana_base58_encode(public.solana_base58_decode('So11111111111111111111111111111111111111112')),
  'So11111111111111111111111111111111111111112',
  'Solana address preserves exact case on round trip'
);

insert into public.wallets (
  id, profile_id, privy_wallet_id, chain, kind, address_bytes,
  address_canonical, ownership_revision
) values (
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000001',
  'privy-wallet-solana-one',
  'solana',
  'embedded',
  public.solana_base58_decode('So11111111111111111111111111111111111111112'),
  'So11111111111111111111111111111111111111112',
  'ownership-v1'
);
select pass('valid Solana wallet is accepted');

select throws_ok(
  $$insert into public.wallets (
      profile_id, privy_wallet_id, chain, kind, address_bytes, address_canonical,
      ownership_revision
    ) values (
      '00000000-0000-4000-8000-000000000001', 'cross-chain-format', 'solana', 'embedded',
      decode(repeat('00', 32), 'hex'), '0x1111111111111111111111111111111111111111',
      'ownership-v1'
    )$$,
  '23514',
  null,
  'cross-chain address formats are rejected'
);

select lives_ok(
  $$insert into public.automation_grants (
      id, profile_id, evm_wallet_id, solana_wallet_id, status, expires_at,
      maximum_per_order_micros, rolling_24h_micros
    ) values (
      '20000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'prepared', now() + interval '7 days', 100000000, 1000000000
    )$$,
  'a seven-day grant is accepted'
);
select throws_ok(
  $$insert into public.automation_grants (
      profile_id, evm_wallet_id, solana_wallet_id, status, expires_at,
      maximum_per_order_micros, rolling_24h_micros
    ) values (
      '00000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      'prepared', now() + interval '7 days 1 second', 1, 1
    )$$,
  '23514',
  null,
  'grant expiry cannot exceed seven days'
);

select throws_ok(
  $$insert into public.wallets (
      profile_id, privy_wallet_id, chain, kind, address_bytes, address_canonical,
      checksum_display, checksum_verified_at, ownership_revision
    ) values (
      '00000000-0000-4000-8000-000000000001', 'checksum-mismatch', 'evm', 'embedded',
      decode('3333333333333333333333333333333333333333', 'hex'),
      '0x3333333333333333333333333333333333333333',
      '0x4444444444444444444444444444444444444444', now(), 'ownership-v1'
    )$$,
  '23514',
  null,
  'checksum display must represent the same EVM bytes'
);

select col_is_pk('public', 'profiles', 'id', 'profile has a UUID primary key');
select col_is_pk('public', 'wallets', 'id', 'wallet has a UUID primary key');
select has_index('public', 'wallets', 'wallets_profile_id_idx', 'wallet profile foreign key is indexed');
select has_check('public', 'wallets', 'wallets_chain_address_check', 'chain-specific wallet address constraint exists');

select * from finish();
rollback;
