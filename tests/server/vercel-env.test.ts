import { Buffer } from "node:buffer";
import { generateKeyPairSync } from "node:crypto";

import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  loadVercelCronEnv,
  loadVercelDflowCanaryEnv,
  loadVercelExecutionEnv,
  loadVercelWebEnv,
} from "@/server/config/env";

const FUTURE = "2099-01-01T00:00:00.000Z";
const HASH = `sha256:${"a".repeat(64)}`;
const KEY = Buffer.alloc(32, 7).toString("base64");
const PRIVY_AUTHORIZATION_KEY = generateKeyPairSync("ec", {
  namedCurve: "prime256v1",
}).privateKey.export({ format: "der", type: "pkcs8" }).toString("base64");
const OUTCOME_MINT = new PublicKey(Uint8Array.from({ length: 32 }, () => 7)).toBase58();
const PROGRAM_ID = new PublicKey(Uint8Array.from({ length: 32 }, () => 8)).toBase58();

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

const dflowCanary = {
  ...web,
  PRIVY_AUTHORIZATION_PRIVATE_KEY: PRIVY_AUTHORIZATION_KEY,
  PRIVY_KEY_QUORUM_ID: "quorum-1",
  PRIVY_DFLOW_POLICY_ID: "policy-dflow-1",
  DFLOW_API_BASE_URL: "https://quote-api.dflow.net",
  DFLOW_API_KEY: "dflow-key",
  DFLOW_WORLD_CUP_BINDINGS_JSON: JSON.stringify({
    schemaVersion: "txbet-dflow-world-cup-bindings-v1",
    bindings: [{
      id: "world-cup-winner-argentina-yes",
      competition: "fifa-world-cup",
      edition: 2026,
      title: "Will Argentina win the 2026 FIFA World Cup?",
      outcome: "YES",
      marketKey: "kalshi-world-cup-winner-argentina",
      outcomeMint: OUTCOME_MINT,
      evidenceUrl: "https://example.test/review/argentina",
      evidenceHash: HASH,
      reviewedAtMs: 1_700_000_000_000,
      validUntilMs: 4_000_000_000_000,
    }],
  }),
  DFLOW_PROGRAM_ALLOWLIST_JSON: JSON.stringify([PROGRAM_ID]),
  DFLOW_LIVE_SLIPPAGE_BPS: "50",
  DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS: "100",
  DFLOW_MAX_PRIORITY_FEE_LAMPORTS: "100000",
  DFLOW_MAX_INIT_COST_LAMPORTS: "3000000",
  DFLOW_BASE_FEE_LAMPORTS: "5000",
  SOLANA_RPC_URL: "https://solana-rpc.example/mainnet?api-key=private",
  SOLANA_NATIVE_USD_UPPER_BOUND_MICROS: "1000000000",
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

  it("loads only the reviewed World Cup DFlow canary boundary", () => {
    const env = loadVercelDflowCanaryEnv(dflowCanary);

    expect(env.DFLOW_LIVE_SLIPPAGE_BPS).toBe(50);
    expect(env.dflowProgramAllowlist).toEqual([PROGRAM_ID]);
    expect(env.dflowWorldCupBindings.bindings[0]?.outcomeMint).toBe(OUTCOME_MINT);
    expect(env).not.toHaveProperty("DFLOW_WORLD_CUP_BINDINGS_JSON");
    expect(env).not.toHaveProperty("DFLOW_PROGRAM_ALLOWLIST_JSON");
    expect(Object.isFrozen(env)).toBe(true);
  });

  it("rejects an invalid signer key, duplicate programs, and inverted DFlow slippage", () => {
    expect(() => loadVercelDflowCanaryEnv({
      ...dflowCanary,
      PRIVY_AUTHORIZATION_PRIVATE_KEY: "not-a-pkcs8-key",
    })).toThrow(/PKCS8|private key/i);
    expect(() => loadVercelDflowCanaryEnv({
      ...dflowCanary,
      DFLOW_PROGRAM_ALLOWLIST_JSON: JSON.stringify([PROGRAM_ID, PROGRAM_ID]),
    })).toThrow(/unique/i);
    expect(() => loadVercelDflowCanaryEnv({
      ...dflowCanary,
      DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS: "49",
    })).toThrow(/slippage/i);
  });

  it("loads the cron wakeup with only Blob and cron credentials", () => {
    expect(loadVercelCronEnv({
      BLOB_READ_WRITE_TOKEN: web.BLOB_READ_WRITE_TOKEN,
      CRON_SECRET: execution.CRON_SECRET,
    })).toEqual({
      BLOB_READ_WRITE_TOKEN: web.BLOB_READ_WRITE_TOKEN,
      CRON_SECRET: execution.CRON_SECRET,
    });
  });

  it("requires private Blob and cron credentials", () => {
    expect(() =>
      loadVercelWebEnv({ ...web, BLOB_READ_WRITE_TOKEN: undefined }),
    ).toThrow(/BLOB_READ_WRITE_TOKEN/i);
    expect(() =>
      loadVercelExecutionEnv({ ...execution, CRON_SECRET: "short" }),
    ).toThrow(/CRON_SECRET/i);
    expect(() =>
      loadVercelCronEnv({
        BLOB_READ_WRITE_TOKEN: web.BLOB_READ_WRITE_TOKEN,
        CRON_SECRET: "short",
      }),
    ).toThrow(/CRON_SECRET/i);
  });
});
