export type DbRow = Readonly<Record<string, unknown>>;

export interface DbQueryResult<Row extends object = DbRow> {
  readonly rows: readonly Row[];
  readonly rowCount: number;
}

/** Narrow query surface prevents repositories from owning or releasing clients. */
export interface DbTransaction {
  query<Row extends object = DbRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<DbQueryResult<Row>>;
}

export interface DbPoolClient extends DbTransaction {
  release(): void;
}

export interface DbPool {
  connect(): Promise<DbPoolClient>;
}
