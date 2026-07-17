import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/polymarket/world-cup-shadow", () => ({
  readCachedPolymarketWorldCupShadowStatus: vi.fn(),
}));

import { GET } from "@/app/api/polymarket/world-cup-shadow/route";
import { readCachedPolymarketWorldCupShadowStatus } from "@/server/polymarket/world-cup-shadow";

describe("GET /api/polymarket/world-cup-shadow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only the read-only shadow status with no-store caching", async () => {
    vi.mocked(readCachedPolymarketWorldCupShadowStatus).mockResolvedValue({
      status: "unconfigured",
      venue: "polymarket",
      mode: "SHADOW_ONLY",
      executable: false,
      liveData: false,
      reason: "POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED",
    });

    const response = await GET();

    expect(readCachedPolymarketWorldCupShadowStatus).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "unconfigured",
      venue: "polymarket",
      mode: "SHADOW_ONLY",
      executable: false,
      liveData: false,
      reason: "POLYMARKET_WORLD_CUP_REVIEW_NOT_CONFIGURED",
    });
  });
});
