import { Pool } from "pg";

import type { DbPool, DbPoolClient, DbQueryResult } from "./types";

export interface DatabasePoolOptions {
  readonly connectionString: string;
  readonly applicationName: "txbet-web" | "txbet-market" | "txbet-execution";
}

/** Creates one finite, role-specific Postgres pool for a single runtime. */
export function createDatabasePool(options: DatabasePoolOptions): DbPool {
  const pool = new Pool({
    connectionString: options.connectionString,
    application_name: options.applicationName,
    max: 8,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
    statement_timeout: 5_000,
    query_timeout: 7_500,
  });

  return Object.freeze({
    async connect(): Promise<DbPoolClient> {
      const client = await pool.connect();
      return {
        async query<Row extends object>(
          text: string,
          values: readonly unknown[] = [],
        ): Promise<DbQueryResult<Row>> {
          const result = await client.query(text, [...values]);
          return {
            rows: result.rows as Row[],
            rowCount: result.rowCount ?? 0,
          };
        },
        release(): void {
          client.release();
        },
      };
    },
  });
}
