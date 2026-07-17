import { createHash, timingSafeEqual } from "node:crypto";

import * as ed25519 from "@noble/ed25519";
import bs58 from "bs58";
import { httpbis } from "http-message-signatures";

const SIGNATURE_MAX_AGE_SECONDS = 120;
const SIGNATURE_FUTURE_SKEW_SECONDS = 5;
const JSON_CONTENT_TYPE = "application/json";
/** Current production key published by DFlow for signed HTTP responses. */
export const DFLOW_SIGNED_RESPONSE_PUBLIC_KEY =
  "EZKxYr7bbXHaKAGw2MEpVUU9He3hwXGejSpCsdsZCmiF" as const;
const SIGNATURE_PROFILE =
  /^sig1=\("@status" "content-type" "content-digest" "x-request-id";req\);created=([0-9]+);keyid="([^"]+)";alg="ed25519"$/;

type HeaderValue = string | readonly string[] | undefined;

export interface VerifyDflowSignedJsonResponseInput {
  readonly status: number;
  readonly headers: Readonly<Record<string, HeaderValue>>;
  readonly rawBody: string;
  readonly requestId: string;
  readonly requestUrl: string;
  readonly nowMs?: number;
  readonly publicKeyBase58: string;
}

/** Verifies DFlow's pinned RFC 9421 response profile before parsing any JSON. */
export async function verifyDflowSignedJsonResponse(
  input: VerifyDflowSignedJsonResponseInput,
): Promise<unknown> {
  const nowMs = input.nowMs ?? Date.now();
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new Error("DFlow response verification time is invalid");
  }
  if (!Number.isInteger(input.status) || input.status < 100 || input.status > 599) {
    throw new Error("DFlow signed response status is invalid");
  }
  if (!input.requestId || !input.requestUrl) {
    throw new Error("DFlow signed response request binding is missing");
  }

  const headers = normalizeHeaders(input.headers);
  const contentType = requireHeader(headers, "content-type");
  const contentDigest = requireHeader(headers, "content-digest");
  const echoedRequestId = requireHeader(headers, "x-request-id");
  const signatureInput = requireHeader(headers, "signature-input");
  requireHeader(headers, "signature");

  if (contentType !== JSON_CONTENT_TYPE) {
    throw new Error("DFlow signed response content type is not application/json");
  }
  if (echoedRequestId !== input.requestId) {
    throw new Error("DFlow signed response request ID does not match");
  }

  const expectedDigest = `sha-256=:${createHash("sha256")
    .update(input.rawBody)
    .digest("base64")}:`;
  if (!constantTimeEqual(contentDigest, expectedDigest)) {
    throw new Error("DFlow signed response content digest does not match");
  }

  const profile = SIGNATURE_PROFILE.exec(signatureInput);
  if (!profile) {
    throw new Error("DFlow signed response signature profile is not accepted");
  }
  const createdSeconds = Number(profile[1]);
  const keyId = profile[2];
  const nowSeconds = Math.floor(nowMs / 1_000);
  if (!Number.isSafeInteger(createdSeconds)) {
    throw new Error("DFlow signed response creation time is invalid");
  }
  if (
    createdSeconds < nowSeconds - SIGNATURE_MAX_AGE_SECONDS ||
    createdSeconds > nowSeconds + SIGNATURE_FUTURE_SKEW_SECONDS
  ) {
    throw new Error("DFlow signed response signature time is stale or in the future");
  }

  const publicKey = decodeFixedBase58(input.publicKeyBase58, 32, "public key");
  if (keyId !== input.publicKeyBase58) {
    throw new Error("DFlow signed response key ID does not match the pinned key");
  }

  let verified: boolean | null;
  try {
    verified = await httpbis.verifyMessage(
      {
        all: true,
        notAfter: nowSeconds + SIGNATURE_FUTURE_SKEW_SECONDS,
        requiredFields: ["@status", "content-type", "content-digest", "x-request-id"],
        requiredParams: ["created", "keyid", "alg"],
        keyLookup: async (parameters) => {
          if (parameters.keyid !== keyId || parameters.alg !== "ed25519") return null;
          return {
            id: keyId,
            algs: ["ed25519"],
            verify: async (data, signature) => {
              if (signature.byteLength !== 64) return false;
              return ed25519.verifyAsync(signature, data, publicKey);
            },
          };
        },
      },
      { status: input.status, headers },
      {
        method: "GET",
        url: input.requestUrl,
        headers: {
          "x-sign-request": "true",
          "x-request-id": input.requestId,
        },
      },
    );
  } catch (error) {
    throw new Error("DFlow signed response signature verification failed", {
      cause: error,
    });
  }
  if (verified !== true) {
    throw new Error("DFlow signed response signature is invalid");
  }

  try {
    return JSON.parse(input.rawBody) as unknown;
  } catch (error) {
    throw new Error("DFlow signed response body is not valid JSON", { cause: error });
  }
}

function normalizeHeaders(
  source: Readonly<Record<string, HeaderValue>>,
): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [rawName, rawValue] of Object.entries(source)) {
    if (rawValue === undefined) continue;
    const name = rawName.toLowerCase();
    if (name in normalized || Array.isArray(rawValue)) {
      throw new Error("DFlow signed response contains an ambiguous signed header");
    }
    normalized[name] = rawValue as string;
  }
  return normalized;
}

function requireHeader(headers: Record<string, string>, name: string): string {
  const value = headers[name];
  if (!value) {
    throw new Error(`DFlow signed response is missing ${name}`);
  }
  return value;
}

function decodeFixedBase58(value: string, length: number, label: string): Uint8Array {
  let decoded: Uint8Array;
  try {
    decoded = bs58.decode(value);
  } catch (error) {
    throw new Error(`DFlow signed response ${label} is malformed`, { cause: error });
  }
  if (decoded.byteLength !== length || bs58.encode(decoded) !== value) {
    throw new Error(`DFlow signed response ${label} is not canonical`);
  }
  return decoded;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.byteLength === rightBytes.byteLength && timingSafeEqual(leftBytes, rightBytes);
}
