import { describe, expect, it, vi } from "vitest";

import { createAutomationGrantRepository } from "@/server/grants/repository";
import type { DbTransaction } from "@/server/db/types";

describe("automation grant repository", () => {
  it("checks profile ownership and expected version in one state transition", async () => {
    const query = vi.fn(async (...args: [text: string, values?: readonly unknown[]]) => {
      void args;
      return {
        rows: [{
          id: "00000000-0000-4000-8000-000000000101",
          profile_id: "00000000-0000-4000-8000-000000000001",
          status: "REVOCATION_PENDING",
          expires_at: "2026-07-20T00:00:00.000Z",
          version: "3",
        }],
        rowCount: 1,
      };
    });
    const repository = createAutomationGrantRepository({ query } as DbTransaction);

    await repository.compareAndSetStatus({
      profileId: "00000000-0000-4000-8000-000000000001",
      grantId: "00000000-0000-4000-8000-000000000101",
      expectedVersion: 2,
      nextStatus: "REVOCATION_PENDING",
    });

    const [sql, values] = query.mock.calls[0] ?? [];
    expect(sql).toContain("id = $1");
    expect(sql).toContain("profile_id = $2");
    expect(sql).toContain("version = $3");
    expect(sql).not.toMatch(/select\s+\*/i);
    expect(values?.slice(0, 4)).toEqual([
      "00000000-0000-4000-8000-000000000101",
      "00000000-0000-4000-8000-000000000001",
      2,
      "REVOCATION_PENDING",
    ]);
  });

  it("returns null instead of overwriting a newer grant", async () => {
    const repository = createAutomationGrantRepository({
      query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
    } as DbTransaction);

    await expect(
      repository.compareAndSetStatus({
        profileId: "00000000-0000-4000-8000-000000000001",
        grantId: "00000000-0000-4000-8000-000000000101",
        expectedVersion: 2,
        nextStatus: "REVOKED",
      }),
    ).resolves.toBeNull();
  });

  it("uses bounded keyset pagination instead of offsets", async () => {
    const query = vi.fn(async (...args: [text: string, values?: readonly unknown[]]) => {
      void args;
      return { rows: [], rowCount: 0 };
    });
    const repository = createAutomationGrantRepository({ query } as DbTransaction);

    await repository.listForProfile({
      profileId: "00000000-0000-4000-8000-000000000001",
      limit: 25,
      before: {
        createdAt: "2026-07-17T00:00:00.000Z",
        id: "00000000-0000-4000-8000-000000000101",
      },
    });

    const [sql] = query.mock.calls[0] ?? [];
    expect(sql).toContain("(created_at, id) < ($2::timestamptz, $3::uuid)");
    expect(sql).not.toMatch(/\boffset\b/i);
  });
});
