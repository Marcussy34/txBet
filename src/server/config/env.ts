import { Buffer } from "node:buffer";
import { createPrivateKey } from "node:crypto";

import { PublicKey } from "@solana/web3.js";
import { getAddress } from "viem";
import { z } from "zod";

import {
  parseDflowWorldCupBindings,
  type DflowWorldCupBindings,
} from "@/execution/venues/dflow/live-binding";
import { parseOperatorEmails } from "@/server/auth/privy-session";

type EnvSource = Readonly<Record<string, string | undefined>>;

const requiredString = z.string().trim().min(1);
const httpsUrl = requiredString.refine((value) => {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "Must be an HTTPS URL");
const databaseUrl = requiredString.refine((value) => {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "postgres:" || protocol === "postgresql:";
  } catch {
    return false;
  }
}, "Must be a PostgreSQL URL");
const futureTimestamp = z.iso.datetime({ offset: true }).refine((value) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now();
}, "Must be a future ISO timestamp");
const positiveIntegerString = requiredString.refine((value) => {
  if (!/^[1-9][0-9]*$/.test(value)) return false;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0;
}, "Must be a positive safe integer");
const canaryCeiling = positiveIntegerString
  .transform(Number)
  .refine((value) => value <= 10_000_000, "Cannot exceed the $10 platform canary ceiling");
const checksumAddress = requiredString.refine((value) => {
  try {
    return /^0x[a-fA-F0-9]{40}$/.test(value) && getAddress(value) === value;
  } catch {
    return false;
  }
}, "Must be a checksummed EVM address");

const POLYMARKET_EXCHANGES = [
  "0xE111180000d2663C0091e4f400237545B87B996B",
  "0xe2222d279d744050d28e00520010520000310F59",
] as const;
const polymarketExchangeAllowlist = requiredString.refine((value) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      Array.isArray(parsed) &&
      parsed.length === POLYMARKET_EXCHANGES.length &&
      POLYMARKET_EXCHANGES.every((address) => parsed.includes(address))
    );
  } catch {
    return false;
  }
}, "Must contain the exact current Polymarket exchange allowlist");

const publicSchema = z.strictObject({
  NEXT_PUBLIC_SITE_URL: httpsUrl,
  NEXT_PUBLIC_PRIVY_APP_ID: requiredString,
});

const webSchema = z.strictObject({
  NEXT_PUBLIC_SITE_URL: httpsUrl,
  NEXT_PUBLIC_PRIVY_APP_ID: requiredString,
  PRIVY_APP_ID: requiredString,
  PRIVY_APP_SECRET: requiredString,
  PRIVY_VERIFICATION_KEY: requiredString,
  OPERATOR_EMAILS: requiredString,
  SUPABASE_WEB_DATABASE_URL: databaseUrl,
});

const vercelWebSchema = webSchema
  .omit({ SUPABASE_WEB_DATABASE_URL: true })
  .extend({
    BLOB_READ_WRITE_TOKEN: requiredString,
  });

const vercelCronSchema = z.strictObject({
  BLOB_READ_WRITE_TOKEN: requiredString,
  CRON_SECRET: z.string().min(32),
});

const canonicalNonnegativeIntegerString = requiredString.regex(/^(0|[1-9][0-9]*)$/);
const unsigned16String = canonicalNonnegativeIntegerString
  .transform(Number)
  .refine((value) => Number.isSafeInteger(value) && value <= 65_535, {
    message: "Must be an unsigned 16-bit integer",
  });
const privyAuthorizationPrivateKey = requiredString.refine((value) => {
  try {
    const bytes = Buffer.from(value, "base64");
    if (bytes.byteLength === 0 || bytes.toString("base64") !== value) return false;
    const key = createPrivateKey({ key: bytes, format: "der", type: "pkcs8" });
    return key.asymmetricKeyType === "ec" && key.asymmetricKeyDetails?.namedCurve === "prime256v1";
  } catch {
    return false;
  }
}, "Must be a canonical base64 PKCS8 P-256 private key");

const vercelDflowCanarySchema = vercelWebSchema.extend({
  PRIVY_AUTHORIZATION_PRIVATE_KEY: privyAuthorizationPrivateKey,
  PRIVY_KEY_QUORUM_ID: requiredString.max(256),
  PRIVY_DFLOW_POLICY_ID: requiredString.max(256),
  DFLOW_API_BASE_URL: z.literal("https://quote-api.dflow.net"),
  DFLOW_API_KEY: requiredString,
  DFLOW_WORLD_CUP_BINDINGS_JSON: requiredString,
  DFLOW_PROGRAM_ALLOWLIST_JSON: requiredString,
  DFLOW_LIVE_SLIPPAGE_BPS: unsigned16String,
  DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS: unsigned16String,
  DFLOW_MAX_PRIORITY_FEE_LAMPORTS: canonicalNonnegativeIntegerString,
  DFLOW_MAX_INIT_COST_LAMPORTS: canonicalNonnegativeIntegerString,
  DFLOW_BASE_FEE_LAMPORTS: canonicalNonnegativeIntegerString,
  SOLANA_RPC_URL: httpsUrl,
  SOLANA_NATIVE_USD_UPPER_BOUND_MICROS: positiveIntegerString,
  SOLANA_NETWORK_COST_POLICY_VALID_UNTIL: futureTimestamp,
  CANARY_MAX_TOTAL_MICROS: canaryCeiling,
});

const marketSchema = z.strictObject({
  SUPABASE_MARKET_DATABASE_URL: databaseUrl,
  TXLINE_BASE_URL: httpsUrl,
  TXLINE_API_TOKEN: requiredString,
  TXLINE_WORLD_CUP_COMPETITION_IDS: requiredString,
  ASSET_VALUE_POLICIES_JSON: requiredString,
  POLYMARKET_CLOB_URL: z.literal("https://clob.polymarket.com"),
  POLYMARKET_MARKET_WS_URL: z.literal(
    "wss://ws-subscriptions-clob.polymarket.com/ws/market",
  ),
  POLYMARKET_GAMMA_URL: z.literal("https://gamma-api.polymarket.com"),
});

const executionSchema = z.strictObject({
  PRIVY_APP_ID: requiredString,
  PRIVY_APP_SECRET: requiredString,
  PRIVY_AUTHORIZATION_PRIVATE_KEY: requiredString,
  PRIVY_KEY_QUORUM_ID: requiredString,
  PRIVY_POLYMARKET_POLICY_ID: requiredString,
  PRIVY_DFLOW_POLICY_ID: requiredString,
  SUPABASE_EXECUTION_DATABASE_URL: databaseUrl,
  TXBET_ENVELOPE_ACTIVE_KEY_ID: requiredString,
  TXBET_ENVELOPE_KEYRING_JSON: requiredString,
  ASSET_VALUE_POLICIES_JSON: requiredString,
  POLYMARKET_CLOB_URL: z.literal("https://clob.polymarket.com"),
  POLYMARKET_MARKET_WS_URL: z.literal(
    "wss://ws-subscriptions-clob.polymarket.com/ws/market",
  ),
  POLYMARKET_USER_WS_URL: z.literal(
    "wss://ws-subscriptions-clob.polymarket.com/ws/user",
  ),
  POLYMARKET_RELAYER_URL: z.literal("https://relayer-v2.polymarket.com/"),
  POLYMARKET_CHAIN_ID: z.literal("137").transform(() => 137 as const),
  POLYMARKET_COLLATERAL_ADDRESS: z.literal(
    "0xC011a7E12a19f7B1f670d46F03B03f3342E82DFB",
  ),
  POLYMARKET_CTF_ADDRESS: z.literal(
    "0x4D97DCd97eC945f40cF65F87097ACe5EA0476045",
  ),
  POLYMARKET_EXCHANGE_ALLOWLIST: polymarketExchangeAllowlist,
  POLYMARKET_RELAYER_API_KEY: requiredString,
  POLYMARKET_RELAYER_API_KEY_ADDRESS: checksumAddress,
  POLYGON_RPC_URL: httpsUrl,
  DFLOW_API_BASE_URL: z.literal("https://quote-api.dflow.net"),
  DFLOW_WS_URL: z.literal("wss://quote-api.dflow.net"),
  DFLOW_API_KEY: requiredString,
  SOLANA_RPC_URL: httpsUrl,
  POLYGON_NATIVE_USD_UPPER_BOUND_MICROS: positiveIntegerString,
  SOLANA_NATIVE_USD_UPPER_BOUND_MICROS: positiveIntegerString,
  POLYGON_NETWORK_COST_POLICY_VALID_UNTIL: futureTimestamp,
  SOLANA_NETWORK_COST_POLICY_VALID_UNTIL: futureTimestamp,
  CANARY_MAX_TOTAL_MICROS: canaryCeiling,
  EXECUTION_MODE: z
    .enum(["disabled", "shadow", "canary", "live"])
    .default("disabled"),
  RECOVERY_ACTION_MODE: z.enum(["enabled", "frozen"]).default("frozen"),
});

const vercelExecutionSchema = executionSchema
  .omit({ SUPABASE_EXECUTION_DATABASE_URL: true })
  .extend({
    BLOB_READ_WRITE_TOKEN: requiredString,
    CRON_SECRET: z.string().min(32),
  });

const envelopeKeySchema = z.strictObject({
  id: requiredString.regex(/^[A-Za-z0-9._:-]{1,128}$/),
  keyBase64: requiredString,
});
const envelopeKeyringSchema = z.strictObject({
  keys: z.array(envelopeKeySchema).min(1),
});

const networkSchema = z.enum([
  "polygon",
  "solana",
  "bsc",
  "base",
  "sx",
  "hydromancer",
]);
const assetSchema = z.enum(["pUSD", "USDC", "USDT"]);
const allowedCollateral = new Set([
  "polygon:pUSD",
  "polygon:USDC",
  "solana:USDC",
  "bsc:USDT",
  "base:USDC",
  "sx:USDC",
  "hydromancer:USDC",
]);
const requiredFoundationCollateral = ["polygon:pUSD", "solana:USDC"] as const;
const microsSchema = requiredString
  .regex(/^(0|[1-9][0-9]*)$/)
  .transform((value, context) => {
    const amount = Number(value);
    if (!Number.isSafeInteger(amount)) {
      context.addIssue({
        code: "custom",
        message: "Microdollar bound exceeds the safe integer range",
      });
      return z.NEVER;
    }
    return amount;
  });

const assetValuePolicySchema = z
  .strictObject({
    network: networkSchema,
    asset: assetSchema,
    policyVersion: z.number().int().positive(),
    lowerBoundMicros: microsSchema,
    upperBoundMicros: microsSchema,
    evidenceHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    validUntil: futureTimestamp,
  })
  .superRefine((policy, context) => {
    if (!allowedCollateral.has(`${policy.network}:${policy.asset}`)) {
      context.addIssue({
        code: "custom",
        message: "Unknown network and collateral asset combination",
      });
    }
    if (policy.lowerBoundMicros > policy.upperBoundMicros) {
      context.addIssue({
        code: "custom",
        message: "Lower asset value bound cannot exceed the upper bound",
      });
    }
  });

const assetValuePolicySetSchema = z
  .strictObject({
    schemaVersion: z.literal("asset-value-policies-v1"),
    policies: z.array(assetValuePolicySchema).min(1),
  })
  .superRefine((value, context) => {
    const versions = new Set<string>();
    const collateral = new Set<string>();

    value.policies.forEach((policy, index) => {
      const collateralKey = `${policy.network}:${policy.asset}`;
      const versionKey = `${collateralKey}:${policy.policyVersion}`;
      if (versions.has(versionKey)) {
        context.addIssue({
          code: "custom",
          path: ["policies", index],
          message: "Asset policy versions must be unique",
        });
      }
      versions.add(versionKey);
      collateral.add(collateralKey);
    });

    for (const required of requiredFoundationCollateral) {
      if (!collateral.has(required)) {
        context.addIssue({
          code: "custom",
          path: ["policies"],
          message: `Missing configured collateral policy: ${required}`,
        });
      }
    }
  });

export type PublicEnv = Readonly<z.infer<typeof publicSchema>>;
export type WebEnv = Readonly<
  Omit<z.infer<typeof webSchema>, "OPERATOR_EMAILS"> & {
    operatorEmails: readonly string[];
  }
>;
export type VercelWebEnv = Readonly<
  Omit<z.infer<typeof vercelWebSchema>, "OPERATOR_EMAILS"> & {
    operatorEmails: readonly string[];
  }
>;
export type VercelCronEnv = Readonly<z.infer<typeof vercelCronSchema>>;
export type VercelDflowCanaryEnv = Readonly<
  Omit<
    z.infer<typeof vercelDflowCanarySchema>,
    "OPERATOR_EMAILS" | "DFLOW_WORLD_CUP_BINDINGS_JSON" | "DFLOW_PROGRAM_ALLOWLIST_JSON"
  > & {
    readonly operatorEmails: readonly string[];
    readonly dflowWorldCupBindings: DflowWorldCupBindings;
    readonly dflowProgramAllowlist: readonly string[];
  }
>;
export type AssetValuePolicy = Readonly<
  z.infer<typeof assetValuePolicySchema>
>;

export interface ParsedEnvelopeKeyring {
  readonly activeKeyId: string;
  readonly keys: readonly Readonly<{
    id: string;
    keyBytes: readonly number[];
  }>[];
}

export type MarketWorkerEnv = Readonly<
  Omit<z.infer<typeof marketSchema>, "ASSET_VALUE_POLICIES_JSON" | "TXLINE_WORLD_CUP_COMPETITION_IDS"> & {
    competitionIds: readonly string[];
    assetValuePolicies: readonly AssetValuePolicy[];
  }
>;

export type ExecutionWorkerEnv = Readonly<
  Omit<z.infer<typeof executionSchema>, "ASSET_VALUE_POLICIES_JSON" | "TXBET_ENVELOPE_KEYRING_JSON"> & {
    envelopeKeyring: ParsedEnvelopeKeyring;
    assetValuePolicies: readonly AssetValuePolicy[];
  }
>;
export type VercelExecutionEnv = Readonly<
  Omit<
    z.infer<typeof vercelExecutionSchema>,
    "ASSET_VALUE_POLICIES_JSON" | "TXBET_ENVELOPE_KEYRING_JSON"
  > & {
    envelopeKeyring: ParsedEnvelopeKeyring;
    assetValuePolicies: readonly AssetValuePolicy[];
  }
>;

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${label} must contain valid JSON`);
  }
}

function parseAssetValuePolicies(value: string): readonly AssetValuePolicy[] {
  const parsed = assetValuePolicySetSchema.safeParse(
    parseJson(value, "ASSET_VALUE_POLICIES_JSON"),
  );
  if (!parsed.success) {
    throw new Error(`Invalid asset value policies: ${parsed.error.message}`);
  }

  return Object.freeze(
    parsed.data.policies.map((policy) => Object.freeze({ ...policy })),
  );
}

function decodeBase64Key(value: string): readonly number[] {
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Envelope key must use canonical base64 encoding");
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value || bytes.byteLength !== 32) {
    throw new Error("Every envelope key must decode to exactly 32 bytes");
  }
  return Object.freeze([...bytes]);
}

function parseEnvelopeKeyring(value: string, activeKeyId: string): ParsedEnvelopeKeyring {
  const parsed = envelopeKeyringSchema.parse(
    parseJson(value, "TXBET_ENVELOPE_KEYRING_JSON"),
  );
  const ids = new Set<string>();
  const keys = parsed.keys.map((entry) => {
    if (ids.has(entry.id)) {
      throw new Error("Envelope key IDs must be unique");
    }
    ids.add(entry.id);
    return Object.freeze({
      id: entry.id,
      keyBytes: decodeBase64Key(entry.keyBase64),
    });
  });
  if (!ids.has(activeKeyId)) {
    throw new Error("The active envelope key ID is missing from the keyring");
  }

  return Object.freeze({
    activeKeyId,
    keys: Object.freeze(keys),
  });
}

function parseCompetitionIds(value: string): readonly string[] {
  const ids = value.split(",").map((entry) => entry.trim());
  if (ids.some((entry) => entry.length === 0) || new Set(ids).size !== ids.length) {
    throw new Error("World Cup competition IDs must be non-empty and unique");
  }
  return Object.freeze(ids);
}

export function loadPublicEnv(source: EnvSource = process.env): PublicEnv {
  return Object.freeze(
    publicSchema.parse({
      NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
      NEXT_PUBLIC_PRIVY_APP_ID: source.NEXT_PUBLIC_PRIVY_APP_ID,
    }),
  );
}

export function loadWebEnv(source: EnvSource = process.env): WebEnv {
  const raw = webSchema.parse({
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_PRIVY_APP_ID: source.NEXT_PUBLIC_PRIVY_APP_ID,
    PRIVY_APP_ID: source.PRIVY_APP_ID,
    PRIVY_APP_SECRET: source.PRIVY_APP_SECRET,
    PRIVY_VERIFICATION_KEY: source.PRIVY_VERIFICATION_KEY,
    OPERATOR_EMAILS: source.OPERATOR_EMAILS,
    SUPABASE_WEB_DATABASE_URL: source.SUPABASE_WEB_DATABASE_URL,
  });
  const { OPERATOR_EMAILS, ...safeRaw } = raw;

  return Object.freeze({
    ...safeRaw,
    operatorEmails: parseOperatorEmails(OPERATOR_EMAILS),
  });
}

/** Next.js/Vercel MVP auth configuration with private Blob state and no SQL dependency. */
export function loadVercelWebEnv(
  source: EnvSource = process.env,
): VercelWebEnv {
  const raw = vercelWebSchema.parse({
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_PRIVY_APP_ID: source.NEXT_PUBLIC_PRIVY_APP_ID,
    PRIVY_APP_ID: source.PRIVY_APP_ID,
    PRIVY_APP_SECRET: source.PRIVY_APP_SECRET,
    PRIVY_VERIFICATION_KEY: source.PRIVY_VERIFICATION_KEY,
    OPERATOR_EMAILS: source.OPERATOR_EMAILS,
    BLOB_READ_WRITE_TOKEN: source.BLOB_READ_WRITE_TOKEN,
  });
  const { OPERATOR_EMAILS, ...safeRaw } = raw;
  return Object.freeze({
    ...safeRaw,
    operatorEmails: parseOperatorEmails(OPERATOR_EMAILS),
  });
}

/** Minimal Vercel Cron boundary; unrelated execution secrets are not loaded. */
export function loadVercelCronEnv(
  source: EnvSource = process.env,
): VercelCronEnv {
  return Object.freeze(vercelCronSchema.parse({
    BLOB_READ_WRITE_TOKEN: source.BLOB_READ_WRITE_TOKEN,
    CRON_SECRET: source.CRON_SECRET,
  }));
}

/** Live DFlow canary configuration is isolated from Cron and the deferred SQL worker. */
export function loadVercelDflowCanaryEnv(
  source: EnvSource = process.env,
): VercelDflowCanaryEnv {
  const raw = vercelDflowCanarySchema.parse({
    NEXT_PUBLIC_SITE_URL: source.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_PRIVY_APP_ID: source.NEXT_PUBLIC_PRIVY_APP_ID,
    PRIVY_APP_ID: source.PRIVY_APP_ID,
    PRIVY_APP_SECRET: source.PRIVY_APP_SECRET,
    PRIVY_VERIFICATION_KEY: source.PRIVY_VERIFICATION_KEY,
    OPERATOR_EMAILS: source.OPERATOR_EMAILS,
    BLOB_READ_WRITE_TOKEN: source.BLOB_READ_WRITE_TOKEN,
    PRIVY_AUTHORIZATION_PRIVATE_KEY: source.PRIVY_AUTHORIZATION_PRIVATE_KEY,
    PRIVY_KEY_QUORUM_ID: source.PRIVY_KEY_QUORUM_ID,
    PRIVY_DFLOW_POLICY_ID: source.PRIVY_DFLOW_POLICY_ID,
    DFLOW_API_BASE_URL: source.DFLOW_API_BASE_URL,
    DFLOW_API_KEY: source.DFLOW_API_KEY,
    DFLOW_WORLD_CUP_BINDINGS_JSON: source.DFLOW_WORLD_CUP_BINDINGS_JSON,
    DFLOW_PROGRAM_ALLOWLIST_JSON: source.DFLOW_PROGRAM_ALLOWLIST_JSON,
    DFLOW_LIVE_SLIPPAGE_BPS: source.DFLOW_LIVE_SLIPPAGE_BPS,
    DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS:
      source.DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS,
    DFLOW_MAX_PRIORITY_FEE_LAMPORTS: source.DFLOW_MAX_PRIORITY_FEE_LAMPORTS,
    DFLOW_MAX_INIT_COST_LAMPORTS: source.DFLOW_MAX_INIT_COST_LAMPORTS,
    DFLOW_BASE_FEE_LAMPORTS: source.DFLOW_BASE_FEE_LAMPORTS,
    SOLANA_RPC_URL: source.SOLANA_RPC_URL,
    SOLANA_NATIVE_USD_UPPER_BOUND_MICROS:
      source.SOLANA_NATIVE_USD_UPPER_BOUND_MICROS,
    SOLANA_NETWORK_COST_POLICY_VALID_UNTIL:
      source.SOLANA_NETWORK_COST_POLICY_VALID_UNTIL,
    CANARY_MAX_TOTAL_MICROS: source.CANARY_MAX_TOTAL_MICROS,
  });
  if (
    raw.DFLOW_LIVE_PREDICTION_MARKET_SLIPPAGE_BPS <
    raw.DFLOW_LIVE_SLIPPAGE_BPS
  ) {
    throw new Error("DFlow prediction-market slippage cannot be below routing slippage");
  }

  const dflowWorldCupBindings = parseDflowWorldCupBindings(
    raw.DFLOW_WORLD_CUP_BINDINGS_JSON,
  );
  const dflowProgramAllowlist = parseSolanaProgramAllowlist(
    raw.DFLOW_PROGRAM_ALLOWLIST_JSON,
  );
  const {
    OPERATOR_EMAILS,
    DFLOW_WORLD_CUP_BINDINGS_JSON: _bindings,
    DFLOW_PROGRAM_ALLOWLIST_JSON: _programs,
    ...safeRaw
  } = raw;
  void _bindings;
  void _programs;
  return Object.freeze({
    ...safeRaw,
    operatorEmails: parseOperatorEmails(OPERATOR_EMAILS),
    dflowWorldCupBindings,
    dflowProgramAllowlist,
  });
}

function parseSolanaProgramAllowlist(value: string): readonly string[] {
  const parsed = parseJson(value, "DFLOW_PROGRAM_ALLOWLIST_JSON");
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 64) {
    throw new Error("DFlow program allowlist must be a bounded non-empty JSON array");
  }
  const programs = parsed.map((entry) => {
    if (typeof entry !== "string") throw new Error("DFlow program allowlist is malformed");
    try {
      const key = new PublicKey(entry);
      if (key.toBase58() !== entry) throw new Error("not canonical");
      return entry;
    } catch (error) {
      throw new Error("DFlow program allowlist contains an invalid Solana address", {
        cause: error,
      });
    }
  });
  if (new Set(programs).size !== programs.length) {
    throw new Error("DFlow program allowlist entries must be unique");
  }
  return Object.freeze([...programs].sort());
}

export function loadMarketWorkerEnv(
  source: EnvSource = process.env,
): MarketWorkerEnv {
  const raw = marketSchema.parse({
    SUPABASE_MARKET_DATABASE_URL: source.SUPABASE_MARKET_DATABASE_URL,
    TXLINE_BASE_URL: source.TXLINE_BASE_URL,
    TXLINE_API_TOKEN: source.TXLINE_API_TOKEN,
    TXLINE_WORLD_CUP_COMPETITION_IDS: source.TXLINE_WORLD_CUP_COMPETITION_IDS,
    ASSET_VALUE_POLICIES_JSON: source.ASSET_VALUE_POLICIES_JSON,
    POLYMARKET_CLOB_URL: source.POLYMARKET_CLOB_URL,
    POLYMARKET_MARKET_WS_URL: source.POLYMARKET_MARKET_WS_URL,
    POLYMARKET_GAMMA_URL: source.POLYMARKET_GAMMA_URL,
  });
  const {
    ASSET_VALUE_POLICIES_JSON,
    TXLINE_WORLD_CUP_COMPETITION_IDS,
    ...safeRaw
  } = raw;

  return Object.freeze({
    ...safeRaw,
    competitionIds: parseCompetitionIds(TXLINE_WORLD_CUP_COMPETITION_IDS),
    assetValuePolicies: parseAssetValuePolicies(ASSET_VALUE_POLICIES_JSON),
  });
}

export function loadExecutionWorkerEnv(
  source: EnvSource = process.env,
): ExecutionWorkerEnv {
  const raw = executionSchema.parse({
    PRIVY_APP_ID: source.PRIVY_APP_ID,
    PRIVY_APP_SECRET: source.PRIVY_APP_SECRET,
    PRIVY_AUTHORIZATION_PRIVATE_KEY: source.PRIVY_AUTHORIZATION_PRIVATE_KEY,
    PRIVY_KEY_QUORUM_ID: source.PRIVY_KEY_QUORUM_ID,
    PRIVY_POLYMARKET_POLICY_ID: source.PRIVY_POLYMARKET_POLICY_ID,
    PRIVY_DFLOW_POLICY_ID: source.PRIVY_DFLOW_POLICY_ID,
    SUPABASE_EXECUTION_DATABASE_URL: source.SUPABASE_EXECUTION_DATABASE_URL,
    TXBET_ENVELOPE_ACTIVE_KEY_ID: source.TXBET_ENVELOPE_ACTIVE_KEY_ID,
    TXBET_ENVELOPE_KEYRING_JSON: source.TXBET_ENVELOPE_KEYRING_JSON,
    ASSET_VALUE_POLICIES_JSON: source.ASSET_VALUE_POLICIES_JSON,
    POLYMARKET_CLOB_URL: source.POLYMARKET_CLOB_URL,
    POLYMARKET_MARKET_WS_URL: source.POLYMARKET_MARKET_WS_URL,
    POLYMARKET_USER_WS_URL: source.POLYMARKET_USER_WS_URL,
    POLYMARKET_RELAYER_URL: source.POLYMARKET_RELAYER_URL,
    POLYMARKET_CHAIN_ID: source.POLYMARKET_CHAIN_ID,
    POLYMARKET_COLLATERAL_ADDRESS: source.POLYMARKET_COLLATERAL_ADDRESS,
    POLYMARKET_CTF_ADDRESS: source.POLYMARKET_CTF_ADDRESS,
    POLYMARKET_EXCHANGE_ALLOWLIST: source.POLYMARKET_EXCHANGE_ALLOWLIST,
    POLYMARKET_RELAYER_API_KEY: source.POLYMARKET_RELAYER_API_KEY,
    POLYMARKET_RELAYER_API_KEY_ADDRESS:
      source.POLYMARKET_RELAYER_API_KEY_ADDRESS,
    POLYGON_RPC_URL: source.POLYGON_RPC_URL,
    DFLOW_API_BASE_URL: source.DFLOW_API_BASE_URL,
    DFLOW_WS_URL: source.DFLOW_WS_URL,
    DFLOW_API_KEY: source.DFLOW_API_KEY,
    SOLANA_RPC_URL: source.SOLANA_RPC_URL,
    POLYGON_NATIVE_USD_UPPER_BOUND_MICROS:
      source.POLYGON_NATIVE_USD_UPPER_BOUND_MICROS,
    SOLANA_NATIVE_USD_UPPER_BOUND_MICROS:
      source.SOLANA_NATIVE_USD_UPPER_BOUND_MICROS,
    POLYGON_NETWORK_COST_POLICY_VALID_UNTIL:
      source.POLYGON_NETWORK_COST_POLICY_VALID_UNTIL,
    SOLANA_NETWORK_COST_POLICY_VALID_UNTIL:
      source.SOLANA_NETWORK_COST_POLICY_VALID_UNTIL,
    CANARY_MAX_TOTAL_MICROS: source.CANARY_MAX_TOTAL_MICROS,
    EXECUTION_MODE: source.EXECUTION_MODE,
    RECOVERY_ACTION_MODE: source.RECOVERY_ACTION_MODE,
  });
  const {
    ASSET_VALUE_POLICIES_JSON,
    TXBET_ENVELOPE_KEYRING_JSON,
    ...safeRaw
  } = raw;

  return Object.freeze({
    ...safeRaw,
    envelopeKeyring: parseEnvelopeKeyring(
      TXBET_ENVELOPE_KEYRING_JSON,
      raw.TXBET_ENVELOPE_ACTIVE_KEY_ID,
    ),
    assetValuePolicies: parseAssetValuePolicies(ASSET_VALUE_POLICIES_JSON),
  });
}

/** Single-deployment Vercel execution configuration. Blob replaces the MVP SQL journal. */
export function loadVercelExecutionEnv(
  source: EnvSource = process.env,
): VercelExecutionEnv {
  const raw = vercelExecutionSchema.parse({
    PRIVY_APP_ID: source.PRIVY_APP_ID,
    PRIVY_APP_SECRET: source.PRIVY_APP_SECRET,
    PRIVY_AUTHORIZATION_PRIVATE_KEY: source.PRIVY_AUTHORIZATION_PRIVATE_KEY,
    PRIVY_KEY_QUORUM_ID: source.PRIVY_KEY_QUORUM_ID,
    PRIVY_POLYMARKET_POLICY_ID: source.PRIVY_POLYMARKET_POLICY_ID,
    PRIVY_DFLOW_POLICY_ID: source.PRIVY_DFLOW_POLICY_ID,
    TXBET_ENVELOPE_ACTIVE_KEY_ID: source.TXBET_ENVELOPE_ACTIVE_KEY_ID,
    TXBET_ENVELOPE_KEYRING_JSON: source.TXBET_ENVELOPE_KEYRING_JSON,
    ASSET_VALUE_POLICIES_JSON: source.ASSET_VALUE_POLICIES_JSON,
    POLYMARKET_CLOB_URL: source.POLYMARKET_CLOB_URL,
    POLYMARKET_MARKET_WS_URL: source.POLYMARKET_MARKET_WS_URL,
    POLYMARKET_USER_WS_URL: source.POLYMARKET_USER_WS_URL,
    POLYMARKET_RELAYER_URL: source.POLYMARKET_RELAYER_URL,
    POLYMARKET_CHAIN_ID: source.POLYMARKET_CHAIN_ID,
    POLYMARKET_COLLATERAL_ADDRESS: source.POLYMARKET_COLLATERAL_ADDRESS,
    POLYMARKET_CTF_ADDRESS: source.POLYMARKET_CTF_ADDRESS,
    POLYMARKET_EXCHANGE_ALLOWLIST: source.POLYMARKET_EXCHANGE_ALLOWLIST,
    POLYMARKET_RELAYER_API_KEY: source.POLYMARKET_RELAYER_API_KEY,
    POLYMARKET_RELAYER_API_KEY_ADDRESS:
      source.POLYMARKET_RELAYER_API_KEY_ADDRESS,
    POLYGON_RPC_URL: source.POLYGON_RPC_URL,
    DFLOW_API_BASE_URL: source.DFLOW_API_BASE_URL,
    DFLOW_WS_URL: source.DFLOW_WS_URL,
    DFLOW_API_KEY: source.DFLOW_API_KEY,
    SOLANA_RPC_URL: source.SOLANA_RPC_URL,
    POLYGON_NATIVE_USD_UPPER_BOUND_MICROS:
      source.POLYGON_NATIVE_USD_UPPER_BOUND_MICROS,
    SOLANA_NATIVE_USD_UPPER_BOUND_MICROS:
      source.SOLANA_NATIVE_USD_UPPER_BOUND_MICROS,
    POLYGON_NETWORK_COST_POLICY_VALID_UNTIL:
      source.POLYGON_NETWORK_COST_POLICY_VALID_UNTIL,
    SOLANA_NETWORK_COST_POLICY_VALID_UNTIL:
      source.SOLANA_NETWORK_COST_POLICY_VALID_UNTIL,
    CANARY_MAX_TOTAL_MICROS: source.CANARY_MAX_TOTAL_MICROS,
    EXECUTION_MODE: source.EXECUTION_MODE,
    RECOVERY_ACTION_MODE: source.RECOVERY_ACTION_MODE,
    BLOB_READ_WRITE_TOKEN: source.BLOB_READ_WRITE_TOKEN,
    CRON_SECRET: source.CRON_SECRET,
  });
  const {
    ASSET_VALUE_POLICIES_JSON,
    TXBET_ENVELOPE_KEYRING_JSON,
    ...safeRaw
  } = raw;

  return Object.freeze({
    ...safeRaw,
    envelopeKeyring: parseEnvelopeKeyring(
      TXBET_ENVELOPE_KEYRING_JSON,
      raw.TXBET_ENVELOPE_ACTIVE_KEY_ID,
    ),
    assetValuePolicies: parseAssetValuePolicies(ASSET_VALUE_POLICIES_JSON),
  });
}
