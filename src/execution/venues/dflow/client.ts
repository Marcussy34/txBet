import type { AtomicAmount } from "@/core/live-money";
import { fetchCredentialed } from "@/server/security/upstream-url";

import {
  dflowSignatureSchema,
  parseDflowOrderStatus,
  parseDflowShadowOrderResponse,
  solanaAddressSchema,
  type DflowOrderStatus,
  type DflowShadowQuote,
} from "./schemas";

const DFLOW_POLICY = Object.freeze({
  protocols: ["https:"] as const,
  hosts: ["quote-api.dflow.net"] as const,
});
const DEFAULT_TIMEOUT_MS = 5_000;

class DflowRequestTimeoutError extends Error {
  override readonly name = "DflowRequestTimeoutError";

  constructor() {
    super("DFlow request timed out");
  }
}

function assertApiKey(apiKey: string): void {
  if (apiKey.trim().length === 0) throw new Error("DFlow API key is required");
}

function assertTimeout(timeoutMs: number): void {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) {
    throw new Error("DFlow timeout must be an integer from 1 through 30000ms");
  }
}

async function fetchDflow(
  url: URL,
  apiKey: string,
  fetchImplementation: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  assertApiKey(apiKey);
  assertTimeout(timeoutMs);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      // Settle the timeout branch before aborting the underlying request.
      reject(new DflowRequestTimeoutError());
      controller.abort();
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      fetchCredentialed(
        url,
        {
          method: "GET",
          headers: { "x-api-key": apiKey },
          signal: controller.signal,
        },
        DFLOW_POLICY,
        fetchImplementation,
      ),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export interface DflowShadowOrderRequest {
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountAtomic: AtomicAmount;
  readonly slippageBps: number;
  readonly predictionMarketSlippageBps: number;
}

function validateRequest(request: DflowShadowOrderRequest): void {
  solanaAddressSchema.parse(request.inputMint);
  solanaAddressSchema.parse(request.outputMint);
  if (request.inputMint === request.outputMint) {
    throw new Error("DFlow input and output mints must differ");
  }
  if (!/^[1-9][0-9]*$/.test(request.amountAtomic)) {
    throw new Error("DFlow input amount must be a positive canonical atomic integer");
  }
  for (const [label, value] of [
    ["routing slippage", request.slippageBps],
    ["prediction-market slippage", request.predictionMarketSlippageBps],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 65_535) {
      throw new Error(`DFlow ${label} must be an unsigned 16-bit integer`);
    }
  }
  if (request.predictionMarketSlippageBps < request.slippageBps) {
    throw new Error(
      "DFlow prediction-market slippage cannot be below routing slippage",
    );
  }
}

export function buildDflowShadowOrderUrl(
  request: DflowShadowOrderRequest,
): URL {
  validateRequest(request);
  const url = new URL("https://quote-api.dflow.net/order");
  url.search = new URLSearchParams({
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amount: request.amountAtomic,
    slippageBps: String(request.slippageBps),
    predictionMarketSlippageBps: String(
      request.predictionMarketSlippageBps,
    ),
  }).toString();
  return url;
}

export async function fetchDflowShadowOrder(
  request: DflowShadowOrderRequest,
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DflowShadowQuote> {
  const response = await fetchDflow(
    buildDflowShadowOrderUrl(request),
    apiKey,
    fetchImplementation,
    timeoutMs,
  );
  if (!response.ok) {
    throw new Error(`DFlow shadow quote failed with HTTP ${response.status}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("DFlow shadow quote returned malformed JSON");
  }
  return parseDflowShadowOrderResponse(body, {
    inputMint: request.inputMint,
    outputMint: request.outputMint,
    amountAtomic: request.amountAtomic,
  });
}

export interface DflowShadowOrderStatusRequest {
  readonly signature: string;
  readonly lastValidBlockHeight?: number;
}

export function buildDflowShadowOrderStatusUrl(
  request: DflowShadowOrderStatusRequest,
): URL {
  if (!dflowSignatureSchema.safeParse(request.signature).success) {
    throw new Error("DFlow order signature must be a base58-encoded 64-byte signature");
  }
  if (
    request.lastValidBlockHeight !== undefined &&
    (!Number.isSafeInteger(request.lastValidBlockHeight) ||
      request.lastValidBlockHeight < 0)
  ) {
    throw new Error("DFlow last valid block height must be a nonnegative safe integer");
  }
  const url = new URL("https://quote-api.dflow.net/order-status");
  const parameters = new URLSearchParams({ signature: request.signature });
  if (request.lastValidBlockHeight !== undefined) {
    parameters.set(
      "lastValidBlockHeight",
      String(request.lastValidBlockHeight),
    );
  }
  url.search = parameters.toString();
  return url;
}

export type DflowShadowStatusObservation =
  | Readonly<{ kind: "observed"; status: DflowOrderStatus }>
  | Readonly<{
      kind: "unknown";
      reason: "TIMEOUT" | "NETWORK" | "HTTP" | "MALFORMED";
      httpStatus: number | null;
    }>;

function unknownStatus(
  reason: "TIMEOUT" | "NETWORK" | "HTTP" | "MALFORMED",
  httpStatus: number | null = null,
): DflowShadowStatusObservation {
  return Object.freeze({ kind: "unknown", reason, httpStatus });
}

/** Read-only shadow status. Every ambiguous response remains explicitly unknown. */
export async function fetchDflowShadowOrderStatus(
  request: DflowShadowOrderStatusRequest,
  apiKey: string,
  fetchImplementation: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<DflowShadowStatusObservation> {
  assertApiKey(apiKey);
  const url = buildDflowShadowOrderStatusUrl(request);
  let response: Response;
  try {
    response = await fetchDflow(url, apiKey, fetchImplementation, timeoutMs);
  } catch (error) {
    return error instanceof DflowRequestTimeoutError
      ? unknownStatus("TIMEOUT")
      : unknownStatus("NETWORK");
  }
  if (!response.ok) return unknownStatus("HTTP", response.status);

  try {
    return Object.freeze({
      kind: "observed",
      status: parseDflowOrderStatus(await response.json()),
    });
  } catch {
    return unknownStatus("MALFORMED");
  }
}
