import { describe, expect, it, vi } from "vitest";

import {
  buildDflowShadowOrderStatusUrl,
  buildDflowShadowOrderUrl,
  fetchDflowShadowOrder,
  fetchDflowShadowOrderStatus,
} from "@/execution/venues/dflow/client";
import bs58 from "bs58";

const INPUT_MINT = "So11111111111111111111111111111111111111112";
const OUTPUT_MINT = "11111111111111111111111111111111";
const SIGNATURE = bs58.encode(Uint8Array.from({ length: 64 }, () => 1));
const request = {
  inputMint: INPUT_MINT,
  outputMint: OUTPUT_MINT,
  amountAtomic: "1000000" as const,
  slippageBps: 50,
  predictionMarketSlippageBps: 50,
};

const responseBody = {
  inputMint: INPUT_MINT,
  inAmount: "1000000",
  outputMint: OUTPUT_MINT,
  outAmount: "2000000",
  otherAmountThreshold: "1900000",
  minOutAmount: "1900000",
  slippageBps: 50,
  predictionMarketSlippageBps: 50,
  priceImpactPct: "0.01",
  contextSlot: 123,
  executionMode: "async",
  revertMint: INPUT_MINT,
};

describe("DFlow fixed-host shadow client", () => {
  it("encodes only exact-input quote parameters and omits every signing identity", () => {
    const url = buildDflowShadowOrderUrl(request);

    expect(url.origin).toBe("https://quote-api.dflow.net");
    expect(url.pathname).toBe("/order");
    expect(url.searchParams.get("amount")).toBe("1000000");
    expect(url.searchParams.get("slippageBps")).toBe("50");
    expect(url.searchParams.get("predictionMarketSlippageBps")).toBe("50");
    expect(url.searchParams.has("userPublicKey")).toBe(false);
    expect(url.searchParams.has("destinationTokenAccount")).toBe(false);
  });

  it("attaches x-api-key only to the exact host and disables redirects", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(responseBody),
    );

    await fetchDflowShadowOrder(request, "test-api-key", fakeFetch);

    const [url, init] = fakeFetch.mock.calls[0];
    expect((url as URL).host).toBe("quote-api.dflow.net");
    expect(new Headers(init?.headers).get("x-api-key")).toBe("test-api-key");
    expect(init?.redirect).toBe("error");
  });

  it("fails closed on invalid slippage, HTTP errors, and malformed JSON", async () => {
    expect(() =>
      buildDflowShadowOrderUrl({ ...request, predictionMarketSlippageBps: 49 }),
    ).toThrow(/slippage/i);

    await expect(
      fetchDflowShadowOrder(
        request,
        "test-api-key",
        vi.fn<typeof fetch>().mockResolvedValue(new Response("secret body", { status: 503 })),
      ),
    ).rejects.toThrow(/503/);
    await expect(
      fetchDflowShadowOrder(
        request,
        "test-api-key",
        vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 200 })),
      ),
    ).rejects.toThrow(/JSON/i);
  });

  it("bounds quote requests with an aborting timeout", async () => {
    const hangingFetch = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    await expect(
      fetchDflowShadowOrder(request, "test-api-key", hangingFetch, 1),
    ).rejects.toThrow(/timed out/i);
    expect(hangingFetch.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  });

  it("builds the exact order-status URL from documented parameters", () => {
    const url = buildDflowShadowOrderStatusUrl({
      signature: SIGNATURE,
      lastValidBlockHeight: 123,
    });
    expect(url.origin).toBe("https://quote-api.dflow.net");
    expect(url.pathname).toBe("/order-status");
    expect(url.searchParams.get("signature")).toBe(SIGNATURE);
    expect(url.searchParams.get("lastValidBlockHeight")).toBe("123");
    expect(() =>
      buildDflowShadowOrderStatusUrl({ signature: "not-base58" }),
    ).toThrow(/signature/i);
  });

  it("parses status reads but never upgrades them into fill proof", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({ status: "closed", inAmount: "0", outAmount: "0" }),
    );
    const observation = await fetchDflowShadowOrderStatus(
      { signature: SIGNATURE },
      "test-api-key",
      fakeFetch,
    );

    expect(observation).toMatchObject({
      kind: "observed",
      status: { status: "closed", provesFullFill: false },
    });
    const [, init] = fakeFetch.mock.calls[0] ?? [];
    expect(new Headers(init?.headers).get("x-api-key")).toBe("test-api-key");
    expect(init?.redirect).toBe("error");
  });

  it.each([
    {
      name: "not found",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 })),
      reason: "HTTP",
    },
    {
      name: "malformed",
      fetcher: vi.fn<typeof fetch>().mockResolvedValue(Response.json({ unexpected: true })),
      reason: "MALFORMED",
    },
    {
      name: "network failure",
      fetcher: vi.fn<typeof fetch>().mockRejectedValue(new Error("socket secret")),
      reason: "NETWORK",
    },
  ])("normalizes $name status ambiguity to unknown", async ({ fetcher, reason }) => {
    await expect(
      fetchDflowShadowOrderStatus(
        { signature: SIGNATURE },
        "test-api-key",
        fetcher,
      ),
    ).resolves.toMatchObject({ kind: "unknown", reason });
  });

  it("normalizes a status timeout to unknown", async () => {
    const hangingFetch = vi.fn<typeof fetch>().mockImplementation(
      async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    await expect(
      fetchDflowShadowOrderStatus(
        { signature: SIGNATURE },
        "test-api-key",
        hangingFetch,
        1,
      ),
    ).resolves.toEqual({ kind: "unknown", reason: "TIMEOUT", httpStatus: null });
  });
});
