import type { DbPool, DbTransaction } from "./types";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface DatabasePools {
  readonly web: DbPool;
  readonly market: DbPool;
  readonly execution: DbPool;
}

async function inTransaction<T>(
  pool: DbPool,
  operation: (transaction: DbTransaction) => Promise<T>,
  initialize?: (transaction: DbTransaction) => Promise<void>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await initialize?.(client);
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    // Preserve the original failure even if the connection also rejects rollback.
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function createDatabaseContexts(pools: DatabasePools) {
  if (
    pools.web === pools.market ||
    pools.web === pools.execution ||
    pools.market === pools.execution
  ) {
    throw new Error("Web, market, and execution require distinct database pools");
  }

  return Object.freeze({
    withUserTransaction<T>(
      profileId: string,
      operation: (transaction: DbTransaction) => Promise<T>,
    ): Promise<T> {
      if (!UUID.test(profileId)) throw new Error("Profile ID must be a UUID");
      return inTransaction(pools.web, operation, async (transaction) => {
        // The third argument makes the RLS identity local to this transaction.
        await transaction.query(
          "select pg_catalog.set_config('request.profile_id', $1, true)",
          [profileId],
        );
      });
    },

    withMarketWorkerTransaction<T>(
      operation: (transaction: DbTransaction) => Promise<T>,
    ): Promise<T> {
      return inTransaction(pools.market, operation);
    },

    withExecutionWorkerTransaction<T>(
      operation: (transaction: DbTransaction) => Promise<T>,
    ): Promise<T> {
      return inTransaction(pools.execution, operation);
    },
  });
}
