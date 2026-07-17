import { PublicKey } from "@solana/web3.js";

import type { AtomicAmount } from "@/core/live-money";
import {
  DFLOW_CANONICAL_SOLANA_USDC_MINT,
  parseDflowLiveOrderResponse,
  type DflowLiveOrder,
} from "@/execution/venues/dflow/live-order";
import { fetchCredentialed } from "@/server/security/upstream-url";

import { verifyDflowSignedJsonResponse } from "./dflow-signed-response";

const DFLOW_PRODUCTION_ORIGIN = "https://quote-api.dflow.net";
const DFLOW_ORDER_PATH = "/order";
const DFLOW_PRIORITY_LEVEL = "medium";
const MAX_TRANSACTION_BYTES = 1_232;
const MAX_SIGNED_INT64 = 9_223_372_036_854_775_807n;
const MAX_UNSIGNED_INT32 = 4_294_967_295;
const DFLOW_UPSTREAM_POLICY = Object.freeze({
  protocols: ["https:"] as const,
  hosts: ["quote-api.dflow.net"] as const,
});

export interface DflowLiveQuoteRequest {
  readonly requestId: string;
  readonly userWallet: string;
  readonly outputMint: string;
  readonly amountAtomic: AtomicAmount;
  readonly minimumOutputAtomic: AtomicAmount;
}

export interface DflowLiveQuoteConfig {
  readonly apiKey: string;
  readonly responsePublicKeyBase58: string;
  readonly slippageBps: number;
  readonly predictionMarketSlippageBps: number;
  readonly prioritizationFeeMaxLamports: number;
  readonly initPredictionMarketCostMaxLamports: number;
  readonly timeoutMs: number;
}

export interface DflowLiveQuoteDependencies {
  readonly fetchImplementation?: typeof fetch;
  readonly nowMs?: number;
}

/** Builds the only credential-bearing DFlow URL accepted by the live canary. */
export function buildDflowLiveOrderUrl(
  request: DflowLiveQuoteRequest,
  config: DflowLiveQuoteConfig,
): URL {
  const validated = validateRequestAndControls(request, config);
  const url = new URL(DFLOW_ORDER_PATH, DFLOW_PRODUCTION_ORIGIN);
  url.search = new URLSearchParams({
    userPublicKey: validated.userWallet,
    inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
    outputMint: validated.outputMint,
    amount: validated.amountAtomic,
    slippageBps: String(validated.slippageBps),
    perLegSlippage: "true",
    predictionMarketSlippageBps: String(
      validated.predictionMarketSlippageBps,
    ),
    allowSyncExec: "false",
    allowAsyncExec: "true",
    restrictRevertMint: "true",
    platformFeeBps: "0",
    destinationWallet: validated.userWallet,
    revertWallet: validated.userWallet,
    predictionMarketInitPayer: validated.userWallet,
    outcomeAccountRentRecipient: validated.userWallet,
    prioritizationFeeLamports: DFLOW_PRIORITY_LEVEL,
    prioritizationFeeMaxLamports: String(
      validated.prioritizationFeeMaxLamports,
    ),
    dynamicComputeUnitLimit: "true",
    includeAddressLookupTables: "false",
    maxTransactionSize: String(MAX_TRANSACTION_BYTES),
  }).toString();
  return url;
}

/** Fetches one signed DFlow quote without exposing credentials or upstream details. */
export async function fetchDflowLiveQuote(
  request: DflowLiveQuoteRequest,
  config: DflowLiveQuoteConfig,
  dependencies: DflowLiveQuoteDependencies = {},
): Promise<DflowLiveOrder> {
  const validated = validateRequestAndControls(request, config);
  validateCredentialConfig(config);
  const url = buildDflowLiveOrderUrl(request, config);
  const signal = AbortSignal.timeout(config.timeoutMs);

  let response: Response;
  try {
    response = await fetchCredentialed(
      url,
      {
        method: "GET",
        headers: {
          "x-api-key": config.apiKey,
          "x-sign-request": "true",
          "x-request-id": validated.requestId,
        },
        cache: "no-store",
        signal,
      },
      DFLOW_UPSTREAM_POLICY,
      dependencies.fetchImplementation ?? fetch,
    );
  } catch {
    if (signal.aborted) throw new Error("DFlow live quote request timed out");
    throw new Error("DFlow live quote request failed");
  }

  let rawBody: string;
  try {
    rawBody = await response.text();
  } catch {
    if (signal.aborted) throw new Error("DFlow live quote request timed out");
    throw new Error("DFlow live quote response could not be read");
  }

  let signedJson: unknown;
  try {
    signedJson = await verifyDflowSignedJsonResponse({
      status: response.status,
      headers: responseHeaders(response),
      rawBody,
      requestId: validated.requestId,
      requestUrl: url.toString(),
      nowMs: dependencies.nowMs,
      publicKeyBase58: config.responsePublicKeyBase58,
    });
  } catch {
    throw new Error("DFlow live quote response verification failed");
  }

  if (response.status !== 200) {
    throw new Error(`DFlow live quote failed with HTTP ${response.status}`);
  }

  try {
    return parseDflowLiveOrderResponse(signedJson, {
      outputMint: validated.outputMint,
      amountAtomic: validated.amountAtomic,
      minimumOutputAtomic: validated.minimumOutputAtomic,
      slippageBps: validated.slippageBps,
      predictionMarketSlippageBps:
        validated.predictionMarketSlippageBps,
      maximumPrioritizationFeeLamports:
        validated.prioritizationFeeMaxLamports,
      maximumInitPredictionMarketCostLamports:
        validated.initPredictionMarketCostMaxLamports,
    });
  } catch {
    throw new Error("DFlow live quote response was rejected");
  }
}

function validateRequestAndControls(
  request: DflowLiveQuoteRequest,
  config: DflowLiveQuoteConfig,
): Readonly<
  DflowLiveQuoteRequest &
    Pick<
      DflowLiveQuoteConfig,
      | "slippageBps"
      | "predictionMarketSlippageBps"
      | "prioritizationFeeMaxLamports"
      | "initPredictionMarketCostMaxLamports"
    >
> {
  if (
    typeof request.requestId !== "string" ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(request.requestId)
  ) {
    throw new Error("DFlow live quote request ID is invalid");
  }
  const userWallet = canonicalPublicKey(request.userWallet, "wallet");
  const outputMint = canonicalPublicKey(request.outputMint, "output mint");
  if (outputMint === DFLOW_CANONICAL_SOLANA_USDC_MINT) {
    throw new Error("DFlow live quote output mint must differ from its input mint");
  }
  const amountAtomic = positiveInt64Atomic(request.amountAtomic, "input amount");
  const minimumOutputAtomic = positiveInt64Atomic(
    request.minimumOutputAtomic,
    "minimum output",
  );
  const slippageBps = unsigned16(config.slippageBps, "routing slippage");
  const predictionMarketSlippageBps = unsigned16(
    config.predictionMarketSlippageBps,
    "prediction-market slippage",
  );
  if (predictionMarketSlippageBps < slippageBps) {
    throw new Error(
      "DFlow prediction-market slippage cannot be below routing slippage",
    );
  }
  const prioritizationFeeMaxLamports = unsignedInt32(
    config.prioritizationFeeMaxLamports,
    "prioritization fee cap",
  );
  const initPredictionMarketCostMaxLamports = unsignedInt32(
    config.initPredictionMarketCostMaxLamports,
    "initialization fee cap",
  );

  return Object.freeze({
    requestId: request.requestId,
    userWallet,
    outputMint,
    amountAtomic,
    minimumOutputAtomic,
    slippageBps,
    predictionMarketSlippageBps,
    prioritizationFeeMaxLamports,
    initPredictionMarketCostMaxLamports,
  });
}

function validateCredentialConfig(config: DflowLiveQuoteConfig): void {
  if (
    typeof config.apiKey !== "string" ||
    config.apiKey.trim().length === 0 ||
    config.apiKey.length > 4_096 ||
    /[\r\n]/.test(config.apiKey)
  ) {
    throw new Error("DFlow live quote API key is invalid");
  }
  canonicalPublicKey(config.responsePublicKeyBase58, "response signing key");
  if (
    !Number.isSafeInteger(config.timeoutMs) ||
    config.timeoutMs < 1 ||
    config.timeoutMs > 30_000
  ) {
    throw new Error("DFlow live quote timeout must be from 1 through 30000ms");
  }
}

function canonicalPublicKey(value: string, label: string): string {
  try {
    const key = new PublicKey(value);
    if (key.toBase58() !== value) throw new Error("not canonical");
    return key.toBase58();
  } catch {
    throw new Error(`DFlow live quote ${label} is invalid`);
  }
}

function positiveInt64Atomic(value: string, label: string): AtomicAmount {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`DFlow live quote ${label} must be a positive atomic integer`);
  }
  if (BigInt(value) > MAX_SIGNED_INT64) {
    throw new Error(`DFlow live quote ${label} exceeds the signed 64-bit range`);
  }
  return value as AtomicAmount;
}

function unsigned16(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
    throw new Error(`DFlow live quote ${label} must be an unsigned 16-bit integer`);
  }
  return value;
}

function unsignedInt32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UNSIGNED_INT32) {
    throw new Error(`DFlow live quote ${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

function responseHeaders(response: Response): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    headers[name] = value;
  });
  return headers;
}
