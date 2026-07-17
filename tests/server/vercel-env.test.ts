import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  loadVercelExecutionEnv,
  loadVercelWebEnv,
} from "@/server/config/env";

const FUTURE = "2099-01-01T00:00:00.000Z";
const HASH = `sha256:${"a".repeat(64)}`;
const KEY = Buffer.alloc(32, 7).toString("base64");

const web = {
  NEXT_PUBLIC_SITE_URL: "https://txbet.example",
  NEXT_PUBLIC_PRIVY_APP_ID: "privy-public-app",
  PRIVY_APP_ID: "privy-server-app",
  PRIVY_APP_SECRET: "privy-server-secret",
  PRIVY_VERIFICATION_KEY: "-----BEGIN PUBLIC KEY-----\nkey\n-----END PUBLIC KEY-----",
  OPERATOR_EMAILS: "trader@example.com",
  BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_test",
};

const execution = {
  ...web,
  CRON_SECRET: "cron-secret-at-least-32-characters-long",
  PRIVY_AUTHORIZATION_PRIVATE_KEY: "wallet-auth-private-key",
  PRIVY_KEY_QUORUM_ID: "quorum-1",
  PRIVY_POLYMARKET_POLICY_ID: "policy-poly-1",
  PRIVY_DFLOW_POLICY_ID: "policy-dflow-shadow-only",
  TXBET_ENVELOPE_ACTIVE_KEY_ID: "active-v1",
  TXBET_ENVELOPE_KEYRING_JSON: JSON.stringify({
    keys: [{ id: "active-v1", keyBase64: KEY }],
  }),
  ASSET_VALUE_POLICIES_JSON: JSON.stringify({
    schemaVersion: "asset-value-policies-v1",
    policies: [
      {
        network: "polygon",
        asset: "pUSD",
        policyVersion: 1,
        lowerBoundMicros: "990000",
        upperBoundMicros: "1010000",
        evidenceHash: HASH,
        validUntil: FUTURE,
      },
      {
        network: "solana",
        asset: "USDC",
        policyVersion: 1,
        lowerBoundMicros: "990000",
        upperBoundMicros: "1010000",
        evidenceHash: HASH,
        validUntil: FUTURE,
      },
    ],
  }),
  POLYMARKET_CLOB_URL: "https://clob.polymarket.com",
  POLYMARKET_MARKET_WS_URL: "wss://ws-subscriptions-clob.polymarket.com/ws/market",
  POLYMARKET_USER_WS_URL: "wss://ws-subscriptions-clob.polymarket.com/ws/user",
  POLYMARKET_RELAYER_URL: "https://relayer-v2.polymarket.com/",
  POLYMARKET_CHAIN_ID: "137",
  POLYMARKET_COLLATERAL_ADDRESS: "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  POLYMARKET_CTF_ADDRESS: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  POLYMARKET_EXCHANGE_ALLOWLIST: JSON.stringify([
    "0xE111180000d2663C0091e4f400237545B87B996B",
    "0xe2222d279d744050d28e00520010520000310F59",
  ]),
  POLYMARKET_RELAYER_API_KEY: "relayer-key",
  POLYMARKET_RELAYER_API_KEY_ADDRESS: "0x1111111111111111111111111111111111111111",
  POLYGON_RPC_URL: "https://polygon-rpc.example",
  DFLOW_API_BASE_URL: "https://quote-api.dflow.net",
  DFLOW_WS_URL: "wss://quote-api.dflow.net",
  DFLOW_API_KEY: "dflow-key",
  SOLANA_RPC_URL: "https://solana-rpc.example",
  POLYGON_NATIVE_USD_UPPER_BOUND_MICROS: "10000000",
  SOLANA_NATIVE_USD_UPPER_BOUND_MICROS: "1000000000",
  POLYGON_NETWORK_COST_POLICY_VALID_UNTIL: FUTURE,
  SOLANA_NETWORK_COST_POLICY_VALID_UNTIL: FUTURE,
  CANARY_MAX_TOTAL_MICROS: "10000000",
};

describe("Vercel-only MVP configuration", () => {
  it("loads web auth and Blob state without any Supabase variable", () => {
    const env = loadVercelWebEnv(web);

    expect(env.operatorEmails).toEqual(["trader@example.com"]);
    expect(env.BLOB_READ_WRITE_TOKEN).toBe("vercel_blob_rw_test");
    expect(env).not.toHaveProperty("SUPABASE_WEB_DATABASE_URL");
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("loads the serverless execution boundary without a database URL", () => {
    const env = loadVercelExecutionEnv(execution);

    expect(env.EXECUTION_MODE).toBe("disabled");
    expect(env.RECOVERY_ACTION_MODE).toBe("frozen");
    expect(env.CRON_SECRET).toBe(execution.CRON_SECRET);
    expect(env).not.toHaveProperty("SUPABASE_EXECUTION_DATABASE_URL");
  });

  it("requires private Blob and cron credentials", () => {
    expect(() =>
      loadVercelWebEnv({ ...web, BLOB_READ_WRITE_TOKEN: undefined }),
    ).toThrow(/BLOB_READ_WRITE_TOKEN/i);
    expect(() =>
      loadVercelExecutionEnv({ ...execution, CRON_SECRET: "short" }),
    ).toThrow(/CRON_SECRET/i);
  });
});
