import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  TEST_SERVER_BLOCKED_ENV_NAMES,
  sanitizeTestServerEnvironment,
} from "@/server/security/test-environment";

describe("Playwright server environment", () => {
  it("clears every current credential, worker authority, RPC URL, and envelope keyring", () => {
    const secretNames = [
      "NEXT_PUBLIC_PRIVY_APP_ID",
      "PRIVY_APP_SECRET",
      "PRIVY_AUTHORIZATION_PRIVATE_KEY",
      "PRIVY_KEY_QUORUM_ID",
      "PRIVY_POLYMARKET_POLICY_ID",
      "PRIVY_DFLOW_POLICY_ID",
      "BLOB_READ_WRITE_TOKEN",
      "CRON_SECRET",
      "SUPABASE_WEB_DATABASE_URL",
      "SUPABASE_MARKET_DATABASE_URL",
      "SUPABASE_EXECUTION_DATABASE_URL",
      "SUPABASE_MIGRATION_DATABASE_URL",
      "TXBET_ENVELOPE_ACTIVE_KEY_ID",
      "TXBET_ENVELOPE_KEYRING_JSON",
      "TXLINE_API_TOKEN",
      "ASSET_VALUE_POLICIES_JSON",
      "POLYMARKET_CLOB_URL",
      "POLYMARKET_MARKET_WS_URL",
      "POLYMARKET_USER_WS_URL",
      "POLYMARKET_GAMMA_URL",
      "POLYMARKET_WORLD_CUP_SHADOW_REVIEW_JSON",
      "POLYMARKET_RELAYER_URL",
      "POLYMARKET_CHAIN_ID",
      "POLYMARKET_COLLATERAL_ADDRESS",
      "POLYMARKET_CTF_ADDRESS",
      "POLYMARKET_EXCHANGE_ALLOWLIST",
      "POLYMARKET_RELAYER_API_KEY",
      "POLYMARKET_RELAYER_API_KEY_ADDRESS",
      "POLYGON_RPC_URL",
      "DFLOW_API_BASE_URL",
      "DFLOW_WS_URL",
      "DFLOW_API_KEY",
      "SOLANA_RPC_URL",
      "RESEND_API_KEY",
    ] as const;
    const source = Object.fromEntries([
      ...secretNames.map((name) => [name, `production-${name}`]),
      ["PATH", "/safe/bin"],
      ["EXECUTION_MODE", "live"],
      ["RECOVERY_ACTION_MODE", "enabled"],
    ]);

    const sanitized = sanitizeTestServerEnvironment(source);

    for (const name of secretNames) {
      expect(TEST_SERVER_BLOCKED_ENV_NAMES).toContain(name);
      expect(sanitized[name]).toBe("");
    }
    expect(sanitized.PATH).toBe("/safe/bin");
    expect(sanitized.EXECUTION_MODE).toBe("disabled");
    expect(sanitized.RECOVERY_ACTION_MODE).toBe("frozen");
  });

  it("does not copy undefined values or mutate the source", () => {
    const source = {
      PATH: "/safe/bin",
      OPTIONAL_VALUE: undefined,
      PRIVY_APP_SECRET: "secret",
    };

    const sanitized = sanitizeTestServerEnvironment(source);

    expect(sanitized).not.toHaveProperty("OPTIONAL_VALUE");
    expect(source.PRIVY_APP_SECRET).toBe("secret");
  });

  it("fails closed when the environment template adds a server setting", () => {
    const template = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const templateNames = template
      .split("\n")
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=/)?.[1])
      .filter((name): name is string => name !== undefined);
    const safeOrForced = new Set([
      "NEXT_PUBLIC_SITE_URL",
      "EXECUTION_MODE",
      "RECOVERY_ACTION_MODE",
    ]);

    expect(templateNames.length).toBeGreaterThan(0);
    for (const name of templateNames) {
      if (safeOrForced.has(name)) continue;
      expect(TEST_SERVER_BLOCKED_ENV_NAMES, name).toContain(name);
    }
  });
});
