import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/config/env", () => ({
  loadVercelCronEnv: vi.fn(),
}));
vi.mock("@/server/execution/vercel-cron", () => ({
  runVercelCronCycle: vi.fn(),
}));

import { GET, runtime } from "@/app/api/cron/execution/route";
import { loadVercelCronEnv } from "@/server/config/env";
import { runVercelCronCycle } from "@/server/execution/vercel-cron";

const SECRET = "cron-secret-at-least-32-characters-long";

function request(authorization?: string): Request {
  return new Request("https://txbet.example/api/cron/execution", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

describe("Vercel execution cron route", () => {
  beforeEach(() => {
    vi.mocked(loadVercelCronEnv).mockReturnValue({
      BLOB_READ_WRITE_TOKEN: "blob-token",
      CRON_SECRET: SECRET,
    });
    vi.mocked(runVercelCronCycle).mockResolvedValue({
      schemaVersion: "txbet-vercel-cycle-v1",
      observedAtMs: 1,
      profilesDiscovered: 0,
      profilesProcessed: 0,
      profilesDeferred: 0,
      failedProfiles: 0,
      disabledProfiles: 0,
      activeProfiles: 0,
      shadowProfiles: 0,
      canaryRequestedProfiles: 0,
      polymarketShadowStatus: "not-run",
      liveSubmissions: 0,
      dflowMutations: 0,
      pairedExecution: false,
    });
  });

  it("uses the Node runtime and rejects a missing or incorrect bearer secret", async () => {
    expect(runtime).toBe("nodejs");
    for (const authorization of [undefined, "Bearer wrong-secret"]) {
      const response = await GET(request(authorization));
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: { code: "UNAUTHORIZED_CRON" },
      });
    }
    expect(runVercelCronCycle).not.toHaveBeenCalled();
  });

  it("runs the fail-closed cycle for Vercel's bearer secret", async () => {
    const response = await GET(request(`Bearer ${SECRET}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      cycle: { pairedExecution: false, liveSubmissions: 0 },
    });
    expect(runVercelCronCycle).toHaveBeenCalledTimes(1);
  });
});
