import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/txline/world-cup-status", () => ({
  readCachedWorldCupStatus: vi.fn(),
}));

import { GET } from "@/app/api/world-cup/route";
import { readCachedWorldCupStatus } from "@/server/txline/world-cup-status";

describe("GET /api/world-cup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns credential-safe status with no-store caching", async () => {
    vi.mocked(readCachedWorldCupStatus).mockResolvedValue({
      status: "unconfigured",
      provenance: "deterministic-replay",
      verification: "REPLAY_NOT_LIVE",
      reason: "TXLINE_MVP_NOT_CONFIGURED",
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "unconfigured",
      provenance: "deterministic-replay",
      verification: "REPLAY_NOT_LIVE",
      reason: "TXLINE_MVP_NOT_CONFIGURED",
    });
  });
});
