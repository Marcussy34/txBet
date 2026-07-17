import { describe, expect, it } from "vitest";

import {
  createPolymarketL2Headers,
  signPolymarketL2Request,
} from "@/venues/polymarket/hmac";

const CREDENTIALS = Object.freeze({
  apiKey: "550e8400-e29b-41d4-a716-446655440000",
  secret: "c3VwZXItc2VjcmV0LWtleQ==",
  passphrase: "test-passphrase",
});

describe("Polymarket CLOB L2 HMAC", () => {
  it("matches the pinned SDK's exact known-answer contract", async () => {
    await expect(
      signPolymarketL2Request({
        secret: CREDENTIALS.secret,
        timestamp: 1_700_000_000,
        method: "POST",
        requestPath: "/order",
        body: '{"order":{"salt":"1"}}',
      }),
    ).resolves.toBe("95c9Sulzw2ykgQ9OyOHFR2dxNckka3eR0QXhn-qb0c4=");
  });

  it("binds the exact timestamp, method, request path, and serialized body", async () => {
    const base = {
      secret: CREDENTIALS.secret,
      timestamp: 1_700_000_000,
      method: "POST",
      requestPath: "/order?market=1",
      body: '{"a":1,"b":2}',
    } as const;
    const signature = await signPolymarketL2Request(base);

    await expect(
      signPolymarketL2Request({ ...base, timestamp: 1_700_000_001 }),
    ).resolves.not.toBe(signature);
    await expect(
      signPolymarketL2Request({ ...base, method: "DELETE" }),
    ).resolves.not.toBe(signature);
    await expect(
      signPolymarketL2Request({ ...base, requestPath: "/order?market=2" }),
    ).resolves.not.toBe(signature);
    await expect(
      signPolymarketL2Request({ ...base, body: '{"b":2,"a":1}' }),
    ).resolves.not.toBe(signature);
    await expect(
      signPolymarketL2Request({ ...base, body: undefined }),
    ).resolves.not.toBe(signature);
  });

  it("builds only the five documented L2 headers", async () => {
    const headers = await createPolymarketL2Headers({
      address: "0x1111111111111111111111111111111111111111",
      credentials: CREDENTIALS,
      timestamp: 1_700_000_000,
      method: "DELETE",
      requestPath: "/order/abc",
    });

    expect(headers).toEqual({
      POLY_ADDRESS: "0x1111111111111111111111111111111111111111",
      POLY_SIGNATURE: "a23FookxgeTMN5YCRMr_TwT6y0XWv--bg2n6cBlTo4c=",
      POLY_TIMESTAMP: "1700000000",
      POLY_API_KEY: CREDENTIALS.apiKey,
      POLY_PASSPHRASE: CREDENTIALS.passphrase,
    });
    expect(Object.isFrozen(headers)).toBe(true);
  });

  it.each([
    "",
    "not base64!",
    "A",
    "YWJj===",
    "YWJj+_",
  ])("rejects malformed API secrets without echoing them: %s", async (secret) => {
    await expect(
      signPolymarketL2Request({
        secret,
        timestamp: 1_700_000_000,
        method: "GET",
        requestPath: "/orders",
      }),
    ).rejects.toThrow("Polymarket API secret has an invalid encoding");
  });

  it.each([
    { method: "post", requestPath: "/order", timestamp: 1_700_000_000 },
    { method: "POST", requestPath: "https://clob.polymarket.com/order", timestamp: 1_700_000_000 },
    { method: "POST", requestPath: "/order#fragment", timestamp: 1_700_000_000 },
    { method: "POST", requestPath: "/order", timestamp: -1 },
    { method: "POST", requestPath: "/order", timestamp: 1.5 },
  ])("fails closed on a non-canonical signing input", async (input) => {
    await expect(
      signPolymarketL2Request({
        secret: CREDENTIALS.secret,
        ...input,
      }),
    ).rejects.toThrow();
  });
});
