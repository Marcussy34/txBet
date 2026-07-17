import { createHash } from "node:crypto";

import * as ed25519 from "@noble/ed25519";
import { Keypair, PublicKey, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import bs58 from "bs58";
import { httpbis } from "http-message-signatures";
import { describe, expect, it, vi } from "vitest";

import { DFLOW_CANONICAL_SOLANA_USDC_MINT } from "@/execution/venues/dflow/live-order";
import {
  buildDflowLiveOrderUrl,
  fetchDflowLiveQuote,
} from "@/server/execution/dflow-live-quote";

const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const NOW = 1_784_270_000_000;
const OUTCOME_MINT = new PublicKey(
  Uint8Array.from({ length: 32 }, () => 7),
).toBase58();
const BLOCKHASH = new PublicKey(
  Uint8Array.from({ length: 32 }, () => 8),
).toBase58();
const REQUEST_ID = "dflow-live-order-123";

function unsignedTransaction(wallet: PublicKey): string {
  const message = new TransactionMessage({
    payerKey: wallet,
    recentBlockhash: BLOCKHASH,
    instructions: [],
  }).compileToV0Message();
  return Buffer.from(new VersionedTransaction(message).serialize()).toString(
    "base64",
  );
}

const wallet = Keypair.generate().publicKey;
const request = {
  requestId: REQUEST_ID,
  userWallet: wallet.toBase58(),
  outputMint: OUTCOME_MINT,
  amountAtomic: "1000000" as const,
  minimumOutputAtomic: "1800000" as const,
};

function orderResponse(overrides: Record<string, unknown> = {}) {
  return {
    inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
    inAmount: "1000000",
    outputMint: OUTCOME_MINT,
    outAmount: "2000000",
    otherAmountThreshold: "1900000",
    minOutAmount: "1900000",
    slippageBps: 50,
    predictionMarketSlippageBps: 75,
    priceImpactPct: "0.01",
    contextSlot: 123,
    executionMode: "async",
    isNativePredictionMarketOutput: true,
    computeUnitLimit: 200_000,
    initPredictionMarketCost: 1_000_000,
    lastValidBlockHeight: 500,
    platformFee: null,
    predictionMarketInitPayerMustSign: true,
    prioritizationFeeLamports: 5_000,
    prioritizationType: {
      computeBudget: {
        microLamports: 25_000,
        estimatedMicroLamports: 24_000,
      },
    },
    revertMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
    transaction: unsignedTransaction(wallet),
    ...overrides,
  };
}

const configBase = {
  apiKey: "server-only-dflow-key",
  responsePublicKeyBase58: new PublicKey(
    Uint8Array.from({ length: 32 }, () => 6),
  ).toBase58(),
  slippageBps: 50,
  predictionMarketSlippageBps: 75,
  prioritizationFeeMaxLamports: 10_000,
  initPredictionMarketCostMaxLamports: 2_000_000,
  timeoutMs: 5_000,
};

function digest(body: string): string {
  return `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
}

async function signedResponse(input: {
  readonly url: string;
  readonly requestId: string;
  readonly body?: string;
  readonly status?: number;
  readonly createdAt?: Date;
}): Promise<Readonly<{ response: Response; publicKey: string }>> {
  const body = input.body ?? JSON.stringify(orderResponse());
  const status = input.status ?? 200;
  const publicKey = bs58.encode(await ed25519.getPublicKeyAsync(PRIVATE_KEY));
  const signed = await httpbis.signMessage(
    {
      name: "sig1",
      fields: ["@status", "content-type", "content-digest", "x-request-id;req"],
      params: ["created", "keyid", "alg"],
      paramValues: {
        created: input.createdAt ?? new Date(),
        keyid: publicKey,
        alg: "ed25519",
      },
      key: {
        id: publicKey,
        alg: "ed25519",
        sign: async (data) => Buffer.from(
          await ed25519.signAsync(data, PRIVATE_KEY),
        ),
      },
    },
    {
      status,
      headers: {
        "content-type": "application/json",
        "content-digest": digest(body),
        "x-request-id": input.requestId,
      },
    },
    {
      method: "GET",
      url: input.url,
      headers: {
        "x-sign-request": "true",
        "x-request-id": input.requestId,
      },
    },
  );
  return {
    response: new Response(body, { status, headers: signed.headers }),
    publicKey,
  };
}

async function captureError(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error("Expected an Error rejection");
  }
  throw new Error("Expected the operation to reject");
}

describe("live DFlow signed quote boundary", () => {
  it("builds only the production exact-input order URL with every wallet field bound", () => {
    const url = buildDflowLiveOrderUrl(request, configBase);

    expect(url.origin).toBe("https://quote-api.dflow.net");
    expect(url.pathname).toBe("/order");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      userPublicKey: request.userWallet,
      inputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT,
      outputMint: OUTCOME_MINT,
      amount: "1000000",
      slippageBps: "50",
      predictionMarketSlippageBps: "75",
      allowSyncExec: "false",
      allowAsyncExec: "true",
      restrictRevertMint: "true",
      destinationWallet: request.userWallet,
      revertWallet: request.userWallet,
      predictionMarketInitPayer: request.userWallet,
      outcomeAccountRentRecipient: request.userWallet,
      prioritizationFeeLamports: "medium",
      prioritizationFeeMaxLamports: "10000",
      dynamicComputeUnitLimit: "true",
      includeAddressLookupTables: "false",
      maxTransactionSize: "1232",
      platformFeeBps: "0",
    });
    expect(url.searchParams.has("apiKey")).toBe(false);
    expect(url.searchParams.has("minimumOutputAtomic")).toBe(false);
  });

  it("sends credentialed signed-request headers, disables redirects, and verifies before parsing", async () => {
    const url = buildDflowLiveOrderUrl(request, configBase);
    const signed = await signedResponse({ url: url.toString(), requestId: REQUEST_ID });
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(signed.response);

    const quote = await fetchDflowLiveQuote(
      request,
      { ...configBase, responsePublicKeyBase58: signed.publicKey },
      { fetchImplementation: fakeFetch },
    );

    expect(quote).toMatchObject({
      inputAtomic: "1000000",
      outputMint: OUTCOME_MINT,
      expectedOutputAtomic: "2000000",
      minimumOutputAtomic: "1900000",
      executionMode: "async",
    });
    const [fetchUrl, init] = fakeFetch.mock.calls[0] ?? [];
    expect(fetchUrl?.toString()).toBe(url.toString());
    expect(init?.method).toBe("GET");
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const headers = new Headers(init?.headers);
    expect(headers.get("x-api-key")).toBe(configBase.apiKey);
    expect(headers.get("x-sign-request")).toBe("true");
    expect(headers.get("x-request-id")).toBe(REQUEST_ID);
  });

  it("checks signature freshness when the complete response is received", async () => {
    const url = buildDflowLiveOrderUrl(request, configBase);
    const signed = await signedResponse({
      url: url.toString(),
      requestId: REQUEST_ID,
      createdAt: new Date(NOW),
    });
    let receiptNowMs = NOW;
    const fakeFetch = vi.fn<typeof fetch>().mockImplementation(async () => {
      receiptNowMs = NOW + 121_000;
      return signed.response;
    });
    const clock = vi.fn(() => receiptNowMs);
    const dependencies = {
      fetchImplementation: fakeFetch,
      clock,
      // This models the stale operation-start timestamp that must not govern freshness.
      nowMs: NOW,
    };

    await expect(fetchDflowLiveQuote(
      request,
      { ...configBase, responsePublicKeyBase58: signed.publicKey },
      dependencies,
    )).rejects.toThrow(/verification/i);
    expect(clock).toHaveBeenCalledTimes(1);
  });

  it("rejects invalid request controls before making a network request", async () => {
    expect(() =>
      buildDflowLiveOrderUrl(
        { ...request, userWallet: "not-a-wallet" },
        configBase,
      ),
    ).toThrow(/wallet/i);
    expect(() =>
      buildDflowLiveOrderUrl(
        { ...request, outputMint: DFLOW_CANONICAL_SOLANA_USDC_MINT },
        configBase,
      ),
    ).toThrow(/mint/i);
    expect(() =>
      buildDflowLiveOrderUrl(request, {
        ...configBase,
        predictionMarketSlippageBps: 49,
      }),
    ).toThrow(/slippage/i);
    expect(() =>
      buildDflowLiveOrderUrl(request, {
        ...configBase,
        prioritizationFeeMaxLamports: -1,
      }),
    ).toThrow(/fee/i);

    const fakeFetch = vi.fn<typeof fetch>();
    await expect(fetchDflowLiveQuote(
      { ...request, requestId: "contains whitespace" },
      configBase,
      { fetchImplementation: fakeFetch },
    )).rejects.toThrow(/request ID/i);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("never exposes the API key, upstream body, or upstream network error", async () => {
    const url = buildDflowLiveOrderUrl(request, configBase);
    const upstreamSecret = "upstream-secret-payload";
    const signed = await signedResponse({
      url: url.toString(),
      requestId: REQUEST_ID,
      body: JSON.stringify({ msg: upstreamSecret }),
      status: 503,
    });

    const httpError = await captureError(fetchDflowLiveQuote(
      request,
      { ...configBase, responsePublicKeyBase58: signed.publicKey },
      { fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(signed.response) },
    ));
    expect(httpError.message).toContain("503");
    expect(httpError.message).not.toContain(upstreamSecret);
    expect(httpError.message).not.toContain(configBase.apiKey);

    const networkSecret = "private-socket-detail";
    const networkError = await captureError(fetchDflowLiveQuote(
      request,
      { ...configBase, responsePublicKeyBase58: signed.publicKey },
      {
        fetchImplementation: vi
          .fn<typeof fetch>()
          .mockRejectedValue(new Error(networkSecret)),
      },
    ));
    expect(networkError.message).toMatch(/request failed/i);
    expect(networkError.message).not.toContain(networkSecret);
  });

  it("fails closed on an invalid signature and on strict schema rejection", async () => {
    const url = buildDflowLiveOrderUrl(request, configBase);
    const valid = await signedResponse({ url: url.toString(), requestId: REQUEST_ID });
    const tampered = new Response(`${await valid.response.text()} `, {
      status: 200,
      headers: valid.response.headers,
    });
    await expect(fetchDflowLiveQuote(
      request,
      { ...configBase, responsePublicKeyBase58: valid.publicKey },
      { fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(tampered) },
    )).rejects.toThrow(/verification/i);

    const body = JSON.stringify(orderResponse({ undocumented: true }));
    const strict = await signedResponse({
      url: url.toString(),
      requestId: REQUEST_ID,
      body,
    });
    await expect(fetchDflowLiveQuote(
      request,
      { ...configBase, responsePublicKeyBase58: strict.publicKey },
      { fetchImplementation: vi.fn<typeof fetch>().mockResolvedValue(strict.response) },
    )).rejects.toThrow(/rejected/i);
  });

  it("bounds the production request with an aborting timeout", async () => {
    const hangingFetch = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("private abort detail", "AbortError"));
        });
      }),
    );

    await expect(fetchDflowLiveQuote(
      request,
      { ...configBase, timeoutMs: 1 },
      { fetchImplementation: hangingFetch },
    )).rejects.toThrow(/timed out/i);
    expect(hangingFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });
});
