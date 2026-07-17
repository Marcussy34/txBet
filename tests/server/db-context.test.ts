import { describe, expect, it } from "vitest";

import { createDatabaseContexts } from "@/server/db/context";
import type { DbPool, DbPoolClient, DbQueryResult } from "@/server/db/types";

function fakePool(label: string, events: string[]): DbPool {
  const client: DbPoolClient = {
    async query<Row extends object>(
      text: string,
      values?: readonly unknown[],
    ): Promise<DbQueryResult<Row>> {
      events.push(`${label}:${text}:${JSON.stringify(values ?? [])}`);
      return { rows: [] as Row[], rowCount: 0 };
    },
    release() {
      events.push(`${label}:release`);
    },
  };
  return {
    async connect() {
      events.push(`${label}:connect`);
      return client;
    },
  };
}

describe("database contexts", () => {
  it("sets the user profile transaction-locally and commits", async () => {
    const events: string[] = [];
    const contexts = createDatabaseContexts({
      web: fakePool("web", events),
      market: fakePool("market", events),
      execution: fakePool("execution", events),
    });

    const result = await contexts.withUserTransaction(
      "00000000-0000-4000-8000-000000000001",
      async (transaction) => {
        await transaction.query("select id from public.profiles where id = $1", [
          "00000000-0000-4000-8000-000000000001",
        ]);
        return "ok";
      },
    );

    expect(result).toBe("ok");
    expect(events).toEqual([
      "web:connect",
      "web:BEGIN:[]",
      'web:select pg_catalog.set_config(\'request.profile_id\', $1, true):["00000000-0000-4000-8000-000000000001"]',
      'web:select id from public.profiles where id = $1:["00000000-0000-4000-8000-000000000001"]',
      "web:COMMIT:[]",
      "web:release",
    ]);
  });

  it("rolls back and releases when the operation fails", async () => {
    const events: string[] = [];
    const contexts = createDatabaseContexts({
      web: fakePool("web", events),
      market: fakePool("market", events),
      execution: fakePool("execution", events),
    });

    await expect(
      contexts.withUserTransaction(
        "00000000-0000-4000-8000-000000000001",
        async () => {
          throw new Error("operation failed");
        },
      ),
    ).rejects.toThrow("operation failed");

    expect(events.at(-2)).toBe("web:ROLLBACK:[]");
    expect(events.at(-1)).toBe("web:release");
  });

  it("keeps market and execution workers on distinct pools without user context", async () => {
    const events: string[] = [];
    const contexts = createDatabaseContexts({
      web: fakePool("web", events),
      market: fakePool("market", events),
      execution: fakePool("execution", events),
    });

    await contexts.withMarketWorkerTransaction((transaction) =>
      transaction.query("select current_user"),
    );
    await contexts.withExecutionWorkerTransaction((transaction) =>
      transaction.query("select current_user"),
    );

    expect(events).toContain("market:select current_user:[]");
    expect(events).toContain("execution:select current_user:[]");
    expect(events.join("\n")).not.toContain("request.profile_id");
    expect(events.join("\n")).not.toMatch(/set\s+role/i);
  });

  it("refuses to reuse one pool for multiple trust boundaries", () => {
    const shared = fakePool("shared", []);
    expect(() =>
      createDatabaseContexts({ web: shared, market: shared, execution: shared }),
    ).toThrow("distinct database pools");
  });
});
