import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  loadExecutionWorkerEnv,
  loadMarketWorkerEnv,
  loadPublicEnv,
  loadWebEnv,
} from "@/server/config/env";

const FUTURE = "2099-01-01T00:00:00.000Z";
const HASH = `sha256:${"a".repeat(64)}`;
const KEY = Buffer.alloc(32, 7).toString("base64");

function assetPolicies(
  overrides: Record<string, unknown> = {},
): string {
  return JSON.stringify({
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
    ...overrides,
  });
}

const publicSource = {
  NEXT_PUBLIC_SITE_URL: "https://txbet.example",
  NEXT_PUBLIC_PRIVY_APP_ID: "privy-public-app",
};

const webSource = {
  ...publicSource,
  PRIVY_APP_ID: "privy-server-app",
  PRIVY_APP_SECRET: "privy-server-secret",
  PRIVY_VERIFICATION_KEY: "-----BEGIN PUBLIC KEY-----\nprivy-key\n-----END PUBLIC KEY-----",
  OPERATOR_EMAILS: " Boss@Example.com,ops@example.com,boss@example.com ",
  SUPABASE_WEB_DATABASE_URL: "postgresql://web@db.example/txbet",
};

const marketSource = {
  SUPABASE_MARKET_DATABASE_URL: "postgresql://market@db.example/txbet",
  TXLINE_BASE_URL: "https://txline.txodds.com",
  TXLINE_API_TOKEN: "txline-secret",
  TXLINE_WORLD_CUP_COMPETITION_IDS: "wc-2026,wc-2027",
  ASSET_VALUE_POLICIES_JSON: assetPolicies(),
  POLYMARKET_CLOB_URL: "https://clob.polymarket.com",
  POLYMARKET_MARKET_WS_URL:
    "wss://ws-subscriptions-clob.polymarket.com/ws/market",
  POLYMARKET_GAMMA_URL: "https://gamma-api.polymarket.com",
};

const executionSource = {
  PRIVY_APP_ID: "privy-server-app",
  PRIVY_APP_SECRET: "privy-server-secret",
  PRIVY_AUTHORIZATION_PRIVATE_KEY: "wallet-auth-private-key",
  PRIVY_KEY_QUORUM_ID: "quorum-1",
  PRIVY_POLYMARKET_POLICY_ID: "policy-poly-1",
  PRIVY_DFLOW_POLICY_ID: "policy-dflow-1",
  SUPABASE_EXECUTION_DATABASE_URL: "postgresql://execution@db.example/txbet",
  TXBET_ENVELOPE_ACTIVE_KEY_ID: "active-v1",
  TXBET_ENVELOPE_KEYRING_JSON: JSON.stringify({
    keys: [{ id: "active-v1", keyBase64: KEY }],
  }),
  ASSET_VALUE_POLICIES_JSON: assetPolicies(),
  POLYMARKET_CLOB_URL: "https://clob.polymarket.com",
  POLYMARKET_MARKET_WS_URL:
    "wss://ws-subscriptions-clob.polymarket.com/ws/market",
  POLYMARKET_USER_WS_URL:
    "wss://ws-subscriptions-clob.polymarket.com/ws/user",
  POLYMARKET_RELAYER_URL: "https://relayer-v2.polymarket.com/",
  POLYMARKET_CHAIN_ID: "137",
  POLYMARKET_COLLATERAL_ADDRESS:
    "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  POLYMARKET_CTF_ADDRESS: "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  POLYMARKET_EXCHANGE_ALLOWLIST: JSON.stringify([
    "0xE111180000d2663C0091e4f400237545B87B996B",
    "0xe2222d279d744050d28e00520010520000310F59",
  ]),
  POLYMARKET_RELAYER_API_KEY: "relayer-key",
  POLYMARKET_RELAYER_API_KEY_ADDRESS:
    "0x1111111111111111111111111111111111111111",
  POLYGON_RPC_URL: "https://polygon-rpc.example",
  DFLOW_API_BASE_URL: "https://quote-api.dflow.net",
  DFLOW_WS_URL: "wss://quote-api.dflow.net",
  DFLOW_API_KEY: "dflow-secret",
  SOLANA_RPC_URL: "https://solana-rpc.example",
  POLYGON_NATIVE_USD_UPPER_BOUND_MICROS: "10000000",
  SOLANA_NATIVE_USD_UPPER_BOUND_MICROS: "1000000000",
  POLYGON_NETWORK_COST_POLICY_VALID_UNTIL: FUTURE,
  SOLANA_NETWORK_COST_POLICY_VALID_UNTIL: FUTURE,
  CANARY_MAX_TOTAL_MICROS: "10000000",
};

describe("environment isolation", () => {
  it("loads immutable public and web configuration with separate requirements", () => {
    const publicEnv = loadPublicEnv(publicSource);
    const webEnv = loadWebEnv(webSource);

    expect(publicEnv).toEqual(publicSource);
    expect(webEnv.PRIVY_APP_SECRET).toBe("privy-server-secret");
    expect(webEnv.PRIVY_VERIFICATION_KEY).toContain("BEGIN PUBLIC KEY");
    expect(webEnv.operatorEmails).toEqual([
      "boss@example.com",
      "ops@example.com",
    ]);
    expect(Object.isFrozen(publicEnv)).toBe(true);
    expect(Object.isFrozen(webEnv)).toBe(true);
    expect(() => loadWebEnv(publicSource)).toThrow(/PRIVY_APP_ID/i);
  });

  it("requires the server-side Privy verification key and operator allowlist", () => {
    for (const field of ["PRIVY_VERIFICATION_KEY", "OPERATOR_EMAILS"] as const) {
      expect(() =>
        loadWebEnv({ ...webSource, [field]: undefined }),
      ).toThrow(new RegExp(field, "i"));
    }
    expect(() =>
      loadWebEnv({ ...webSource, OPERATOR_EMAILS: "not-an-email" }),
    ).toThrow(/operator/i);
  });

  it("does not read execution-only keys while loading public config", () => {
    const accessed = new Set<string>();
    const source = new Proxy(
      { ...publicSource, PRIVY_AUTHORIZATION_PRIVATE_KEY: "must-not-be-read" },
      {
        get(target, property, receiver) {
          if (typeof property === "string") accessed.add(property);
          return Reflect.get(target, property, receiver);
        },
      },
    );

    loadPublicEnv(source);
    expect(accessed).not.toContain("PRIVY_AUTHORIZATION_PRIVATE_KEY");
  });

  it("requires the market worker's own database and read-only feed config", () => {
    const env = loadMarketWorkerEnv(marketSource);

    expect(env.competitionIds).toEqual(["wc-2026", "wc-2027"]);
    expect(env.assetValuePolicies).toHaveLength(2);
    expect(() =>
      loadMarketWorkerEnv({
        ...marketSource,
        SUPABASE_MARKET_DATABASE_URL: undefined,
      }),
    ).toThrow(/SUPABASE_MARKET_DATABASE_URL/i);
  });

  it("pins public market feeds to the current official Polymarket hosts", () => {
    expect(loadMarketWorkerEnv(marketSource).POLYMARKET_GAMMA_URL).toBe(
      "https://gamma-api.polymarket.com",
    );
    expect(() =>
      loadMarketWorkerEnv({
        ...marketSource,
        POLYMARKET_CLOB_URL: "https://lookalike.example",
      }),
    ).toThrow(/POLYMARKET_CLOB_URL/i);
  });
});

describe("execution worker configuration", () => {
  it("defaults entry and recovery modes to their fail-closed values", () => {
    const env = loadExecutionWorkerEnv(executionSource);

    expect(env.EXECUTION_MODE).toBe("disabled");
    expect(env.RECOVERY_ACTION_MODE).toBe("frozen");
    expect(env.envelopeKeyring.activeKeyId).toBe("active-v1");
    expect(env.envelopeKeyring.keys[0].keyBytes).toHaveLength(32);
    expect(Object.isFrozen(env)).toBe(true);
    expect(Object.isFrozen(env.envelopeKeyring.keys)).toBe(true);
  });

  it("accepts only the closed entry and recovery modes", () => {
    for (const mode of ["disabled", "shadow", "canary", "live"]) {
      expect(
        loadExecutionWorkerEnv({ ...executionSource, EXECUTION_MODE: mode })
          .EXECUTION_MODE,
      ).toBe(mode);
    }
    expect(() =>
      loadExecutionWorkerEnv({ ...executionSource, EXECUTION_MODE: "paper" }),
    ).toThrow(/EXECUTION_MODE/i);
    expect(() =>
      loadExecutionWorkerEnv({
        ...executionSource,
        RECOVERY_ACTION_MODE: "enabled-for-entry",
      }),
    ).toThrow(/RECOVERY_ACTION_MODE/i);
    expect(
      loadExecutionWorkerEnv({
        ...executionSource,
        RECOVERY_ACTION_MODE: "enabled",
      }).RECOVERY_ACTION_MODE,
    ).toBe("enabled");
  });

  it("requires every execution authority, database, venue, RPC, and cost-policy field", () => {
    const requiredFields = [
      "PRIVY_APP_ID",
      "PRIVY_APP_SECRET",
      "PRIVY_AUTHORIZATION_PRIVATE_KEY",
      "PRIVY_KEY_QUORUM_ID",
      "PRIVY_POLYMARKET_POLICY_ID",
      "PRIVY_DFLOW_POLICY_ID",
      "SUPABASE_EXECUTION_DATABASE_URL",
      "TXBET_ENVELOPE_ACTIVE_KEY_ID",
      "TXBET_ENVELOPE_KEYRING_JSON",
      "ASSET_VALUE_POLICIES_JSON",
      "POLYMARKET_CLOB_URL",
      "POLYMARKET_MARKET_WS_URL",
      "POLYMARKET_USER_WS_URL",
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
      "POLYGON_NATIVE_USD_UPPER_BOUND_MICROS",
      "SOLANA_NATIVE_USD_UPPER_BOUND_MICROS",
      "POLYGON_NETWORK_COST_POLICY_VALID_UNTIL",
      "SOLANA_NETWORK_COST_POLICY_VALID_UNTIL",
      "CANARY_MAX_TOTAL_MICROS",
    ] as const;

    for (const field of requiredFields) {
      expect(
        () =>
          loadExecutionWorkerEnv({
            ...executionSource,
            [field]: undefined,
          }),
        field,
      ).toThrow(new RegExp(field, "i"));
    }
  });

  it("requires the current pUSD, CTF, exchange, chain, websocket, and relayer bindings", () => {
    const env = loadExecutionWorkerEnv(executionSource);
    expect(env.POLYMARKET_CHAIN_ID).toBe(137);
    expect(env.POLYMARKET_COLLATERAL_ADDRESS).toBe(
      "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
    );
    expect(env.POLYMARKET_RELAYER_URL).toBe(
      "https://relayer-v2.polymarket.com/",
    );

    for (const mutation of [
      { POLYMARKET_CHAIN_ID: "1" },
      { POLYMARKET_COLLATERAL_ADDRESS: "0x1111111111111111111111111111111111111111" },
      { POLYMARKET_RELAYER_URL: "https://legacy-relayer.example" },
      { DFLOW_API_BASE_URL: "https://b.quote-api.dflow.net" },
    ]) {
      expect(() =>
        loadExecutionWorkerEnv({ ...executionSource, ...mutation }),
      ).toThrow();
    }
  });

  it("caps the deployment canary ceiling at the immutable $10 platform ceiling", () => {
    expect(loadExecutionWorkerEnv(executionSource).CANARY_MAX_TOTAL_MICROS).toBe(
      10_000_000,
    );
    expect(() =>
      loadExecutionWorkerEnv({
        ...executionSource,
        CANARY_MAX_TOTAL_MICROS: "10000001",
      }),
    ).toThrow(/CANARY_MAX_TOTAL_MICROS/i);
  });

  it("rejects malformed, duplicate, or inactive envelope keys", () => {
    const withKeyring = (value: unknown, active = "active-v1") => ({
      ...executionSource,
      TXBET_ENVELOPE_ACTIVE_KEY_ID: active,
      TXBET_ENVELOPE_KEYRING_JSON: JSON.stringify(value),
    });

    expect(() =>
      loadExecutionWorkerEnv(
        withKeyring({ keys: [{ id: "active-v1", keyBase64: "AA==" }] }),
      ),
    ).toThrow(/32 bytes/i);
    expect(() =>
      loadExecutionWorkerEnv(
        withKeyring({
          keys: [
            { id: "active-v1", keyBase64: KEY },
            { id: "active-v1", keyBase64: KEY },
          ],
        }),
      ),
    ).toThrow(/unique/i);
    expect(() =>
      loadExecutionWorkerEnv(
        withKeyring({ keys: [{ id: "old-v1", keyBase64: KEY }] }),
      ),
    ).toThrow(/active/i);
  });
});

describe("asset value policy validation", () => {
  it("rejects malformed bounds and missing evidence", () => {
    const malformed = JSON.parse(assetPolicies()) as {
      policies: Array<Record<string, unknown>>;
    };
    malformed.policies[0].lowerBoundMicros = "2000000";
    malformed.policies[0].upperBoundMicros = "1000000";
    malformed.policies[1].evidenceHash = "";

    expect(() =>
      loadMarketWorkerEnv({
        ...marketSource,
        ASSET_VALUE_POLICIES_JSON: JSON.stringify(malformed),
      }),
    ).toThrow(/asset value policies/i);
  });

  it("rejects unknown assets, duplicate versions, and missing configured collateral", () => {
    const unknown = JSON.parse(assetPolicies()) as {
      policies: Array<Record<string, unknown>>;
    };
    unknown.policies[0].asset = "DAI";
    expect(() =>
      loadMarketWorkerEnv({
        ...marketSource,
        ASSET_VALUE_POLICIES_JSON: JSON.stringify(unknown),
      }),
    ).toThrow(/asset value policies/i);

    const duplicate = JSON.parse(assetPolicies()) as {
      policies: Array<Record<string, unknown>>;
    };
    duplicate.policies.push({ ...duplicate.policies[0] });
    expect(() =>
      loadMarketWorkerEnv({
        ...marketSource,
        ASSET_VALUE_POLICIES_JSON: JSON.stringify(duplicate),
      }),
    ).toThrow(/asset value policies/i);

    const missing = JSON.parse(assetPolicies()) as {
      policies: Array<Record<string, unknown>>;
    };
    missing.policies = missing.policies.filter(
      (policy) => policy.network !== "solana",
    );
    expect(() =>
      loadMarketWorkerEnv({
        ...marketSource,
        ASSET_VALUE_POLICIES_JSON: JSON.stringify(missing),
      }),
    ).toThrow(/configured collateral/i);
  });

  it("requires strict future ISO timestamps for asset and network-cost policies", () => {
    for (const invalid of ["01/01/2099", "2099-01-01", "2099-01-01 00:00:00Z"]) {
      const policies = JSON.parse(assetPolicies()) as {
        policies: Array<Record<string, unknown>>;
      };
      policies.policies[0].validUntil = invalid;
      expect(() =>
        loadMarketWorkerEnv({
          ...marketSource,
          ASSET_VALUE_POLICIES_JSON: JSON.stringify(policies),
        }),
      ).toThrow(/asset value policies/i);
    }

    const expired = JSON.parse(assetPolicies()) as {
      policies: Array<Record<string, unknown>>;
    };
    expired.policies[0].validUntil = "2020-01-01T00:00:00.000Z";
    expect(() =>
      loadMarketWorkerEnv({
        ...marketSource,
        ASSET_VALUE_POLICIES_JSON: JSON.stringify(expired),
      }),
    ).toThrow(/asset value policies/i);

    expect(() =>
      loadExecutionWorkerEnv({
        ...executionSource,
        POLYGON_NETWORK_COST_POLICY_VALID_UNTIL: "01/01/2099",
      }),
    ).toThrow(/POLYGON_NETWORK_COST_POLICY_VALID_UNTIL/i);
  });
});
