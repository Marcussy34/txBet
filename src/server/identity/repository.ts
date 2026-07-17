import type { DbTransaction } from "@/server/db/types";

export interface ProfileRecord {
  readonly id: string;
  readonly privyDid: string;
  readonly verifiedEmail: string;
  readonly isOperator: boolean;
  readonly version: number;
}

export interface WalletRecord {
  readonly id: string;
  readonly profileId: string;
  readonly privyWalletId: string;
  readonly chain: "evm" | "solana";
  readonly address: string;
  readonly ownershipRevision: string;
  readonly version: number;
}

interface ProfileRow {
  readonly id: string;
  readonly privy_did: string;
  readonly verified_email: string;
  readonly is_operator: boolean;
  readonly version: string | number;
}

interface WalletRow {
  readonly id: string;
  readonly profile_id: string;
  readonly privy_wallet_id: string;
  readonly chain: "evm" | "solana";
  readonly address: string;
  readonly ownership_revision: string;
  readonly version: string | number;
}

function version(value: string | number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error("Database returned an invalid aggregate version");
  }
  return parsed;
}

function profile(row: ProfileRow): ProfileRecord {
  return Object.freeze({
    id: row.id,
    privyDid: row.privy_did,
    verifiedEmail: row.verified_email,
    isOperator: row.is_operator,
    version: version(row.version),
  });
}

function wallet(row: WalletRow): WalletRecord {
  return Object.freeze({
    id: row.id,
    profileId: row.profile_id,
    privyWalletId: row.privy_wallet_id,
    chain: row.chain,
    address: row.address,
    ownershipRevision: row.ownership_revision,
    version: version(row.version),
  });
}

export class WalletOwnershipConflictError extends Error {
  override readonly name = "WalletOwnershipConflictError";

  constructor() {
    super("Embedded wallet is already bound to another identity or chain");
  }
}

export function createIdentityRepository(transaction: DbTransaction) {
  return Object.freeze({
    async upsertProfile(input: {
      readonly privyDid: string;
      readonly verifiedEmail: string;
      readonly isOperator: boolean;
    }): Promise<ProfileRecord> {
      const result = await transaction.query<ProfileRow>(
        `insert into public.profiles (privy_did, verified_email, is_operator)
         values ($1, $2, $3)
         on conflict (privy_did) do update set
           verified_email = excluded.verified_email,
           is_operator = excluded.is_operator,
           version = case
             when profiles.verified_email is distinct from excluded.verified_email
               or profiles.is_operator is distinct from excluded.is_operator
             then profiles.version + 1 else profiles.version end,
           updated_at = pg_catalog.now()
         returning id, privy_did, verified_email, is_operator, version`,
        [input.privyDid, input.verifiedEmail, input.isOperator],
      );
      const row = result.rows[0];
      if (row === undefined) throw new Error("Profile upsert returned no row");
      return profile(row);
    },

    async upsertWallet(input: {
      readonly profileId: string;
      readonly privyWalletId: string;
      readonly chain: "evm" | "solana";
      readonly address: string;
      readonly ownershipRevision: string;
    }): Promise<WalletRecord> {
      const result = await transaction.query<WalletRow>(
        `insert into public.wallets
           (profile_id, privy_wallet_id, chain, address, ownership_revision)
         values ($1, $2, $3, $4, $5)
         on conflict (privy_wallet_id) do update set
           address = excluded.address,
           ownership_revision = excluded.ownership_revision,
           version = case
             when wallets.address is distinct from excluded.address
               or wallets.ownership_revision is distinct from excluded.ownership_revision
             then wallets.version + 1 else wallets.version end,
           updated_at = pg_catalog.now()
         where wallets.profile_id = excluded.profile_id
           and wallets.chain = excluded.chain
         returning id, profile_id, privy_wallet_id, chain, address,
           ownership_revision, version`,
        [
          input.profileId,
          input.privyWalletId,
          input.chain,
          input.address,
          input.ownershipRevision,
        ],
      );
      const row = result.rows[0];
      if (row === undefined) throw new WalletOwnershipConflictError();
      return wallet(row);
    },
  });
}
