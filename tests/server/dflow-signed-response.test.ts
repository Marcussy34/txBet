import { createHash } from "node:crypto";

import * as ed25519 from "@noble/ed25519";
import bs58 from "bs58";
import { httpbis } from "http-message-signatures";
import { describe, expect, it } from "vitest";

import { verifyDflowSignedJsonResponse } from "@/server/execution/dflow-signed-response";

const NOW = 1_784_270_000_000;
const PRIVATE_KEY = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const REQUEST_ID = "dflow-request-1";
const REQUEST_URL = "https://quote-api.dflow.net/order?amount=1000000";

function digest(body: string): string {
  return `sha-256=:${createHash("sha256").update(body).digest("base64")}:`;
}

async function signedResponse(body = JSON.stringify({ ok: true })) {
  const publicKey = await ed25519.getPublicKeyAsync(PRIVATE_KEY);
  const response = await httpbis.signMessage(
    {
      name: "sig1",
      fields: ["@status", "content-type", "content-digest", "x-request-id;req"],
      params: ["created", "keyid", "alg"],
      paramValues: {
        created: new Date(NOW),
        keyid: bs58.encode(publicKey),
        alg: "ed25519",
      },
      key: {
        id: bs58.encode(publicKey),
        alg: "ed25519",
        sign: async (data) => Buffer.from(await ed25519.signAsync(data, PRIVATE_KEY)),
      },
    },
    {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-digest": digest(body),
        "x-request-id": REQUEST_ID,
      },
    },
    {
      method: "GET",
      url: REQUEST_URL,
      headers: {
        "x-sign-request": "true",
        "x-request-id": REQUEST_ID,
      },
    },
  );
  return { body, headers: response.headers, publicKey: bs58.encode(publicKey) };
}

describe("DFlow signed JSON responses", () => {
  it("verifies the pinned RFC 9421 profile, request binding, digest, and Ed25519 key", async () => {
    const signed = await signedResponse();

    await expect(verifyDflowSignedJsonResponse({
      status: 200,
      headers: signed.headers,
      rawBody: signed.body,
      requestId: REQUEST_ID,
      requestUrl: REQUEST_URL,
      nowMs: NOW + 1_000,
      publicKeyBase58: signed.publicKey,
    })).resolves.toEqual({ ok: true });
  });

  it("rejects body tampering, request replay, stale signatures, and the wrong key", async () => {
    const signed = await signedResponse();
    const common = {
      status: 200,
      headers: signed.headers,
      rawBody: signed.body,
      requestId: REQUEST_ID,
      requestUrl: REQUEST_URL,
      nowMs: NOW + 1_000,
      publicKeyBase58: signed.publicKey,
    } as const;

    await expect(verifyDflowSignedJsonResponse({
      ...common,
      rawBody: `${signed.body} `,
    })).rejects.toThrow(/digest/i);
    await expect(verifyDflowSignedJsonResponse({
      ...common,
      requestId: "other-request",
    })).rejects.toThrow(/request/i);
    await expect(verifyDflowSignedJsonResponse({
      ...common,
      nowMs: NOW + 121_000,
    })).rejects.toThrow(/time|stale/i);
    await expect(verifyDflowSignedJsonResponse({
      ...common,
      publicKeyBase58: bs58.encode(Uint8Array.from({ length: 32 }, () => 9)),
    })).rejects.toThrow(/key|signature/i);
  });

  it("rejects missing headers and any signature profile other than DFlow's exact profile", async () => {
    const signed = await signedResponse();
    const headers: Record<string, string | string[]> = { ...signed.headers };
    delete headers["content-digest"];
    await expect(verifyDflowSignedJsonResponse({
      status: 200,
      headers,
      rawBody: signed.body,
      requestId: REQUEST_ID,
      requestUrl: REQUEST_URL,
      nowMs: NOW,
      publicKeyBase58: signed.publicKey,
    })).rejects.toThrow(/signed response/i);

    const wrongProfile = Object.fromEntries(
      Object.entries(signed.headers).map(([name, value]) => [
        name,
        name.toLowerCase() === "signature-input"
          ? String(value).replace('"x-request-id";req', '"x-request-id"')
          : value,
      ]),
    );
    await expect(verifyDflowSignedJsonResponse({
      status: 200,
      headers: wrongProfile,
      rawBody: signed.body,
      requestId: REQUEST_ID,
      requestUrl: REQUEST_URL,
      nowMs: NOW,
      publicKeyBase58: signed.publicKey,
    })).rejects.toThrow(/profile/i);
  });
});
