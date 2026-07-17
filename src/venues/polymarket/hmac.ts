const MAX_REQUEST_PATH_BYTES = 4_096;
const MAX_BODY_BYTES = 2 * 1_024 * 1_024;
const TEXT_ENCODER = new TextEncoder();

export interface PolymarketClobCredentials {
  readonly apiKey: string;
  readonly secret: string;
  readonly passphrase: string;
}

export interface PolymarketL2SigningInput {
  readonly secret: string;
  readonly timestamp: number;
  readonly method: string;
  readonly requestPath: string;
  readonly body?: string;
}

export interface PolymarketL2HeaderInput
  extends Omit<PolymarketL2SigningInput, "secret"> {
  readonly address: string;
  readonly credentials: PolymarketClobCredentials;
}

export interface PolymarketL2Headers {
  readonly POLY_ADDRESS: string;
  readonly POLY_SIGNATURE: string;
  readonly POLY_TIMESTAMP: string;
  readonly POLY_API_KEY: string;
  readonly POLY_PASSPHRASE: string;
}

function invalidSecret(): never {
  // Never include the rejected value in an error or structured log.
  throw new Error("Polymarket API secret has an invalid encoding");
}

function decodeApiSecret(secret: string): Uint8Array {
  if (
    secret.length === 0 ||
    secret.length > 8_192 ||
    !/^[A-Za-z0-9+/_-]+={0,2}$/.test(secret) ||
    (/[+/]/.test(secret) && /[-_]/.test(secret))
  ) {
    return invalidSecret();
  }

  const unpadded = secret.replace(/=+$/, "");
  if (unpadded.length % 4 === 1) return invalidSecret();

  const normalized = unpadded.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const decoded = Buffer.from(padded, "base64");
  if (decoded.byteLength === 0) return invalidSecret();

  const canonicalStandard = decoded.toString("base64");
  const canonicalUrl = canonicalStandard.replace(/\+/g, "-").replace(/\//g, "_");
  const canonicalCandidates = secret.includes("=")
    ? [canonicalStandard, canonicalUrl]
    : [
        canonicalStandard.replace(/=+$/, ""),
        canonicalUrl.replace(/=+$/, ""),
      ];
  if (!canonicalCandidates.includes(secret)) return invalidSecret();

  return new Uint8Array(decoded);
}

export function assertValidPolymarketApiSecret(secret: string): void {
  const decoded = decodeApiSecret(secret);
  decoded.fill(0);
}

function assertSigningInput(input: PolymarketL2SigningInput): void {
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp < 0) {
    throw new Error("Polymarket L2 timestamp must be a nonnegative integer");
  }
  if (!/^(DELETE|GET|PATCH|POST|PUT)$/.test(input.method)) {
    throw new Error("Polymarket L2 method must be canonical uppercase HTTP");
  }
  if (
    !input.requestPath.startsWith("/") ||
    input.requestPath.startsWith("//") ||
    input.requestPath.includes("#") ||
    /[\u0000-\u001f\u007f]/.test(input.requestPath) ||
    TEXT_ENCODER.encode(input.requestPath).byteLength > MAX_REQUEST_PATH_BYTES
  ) {
    throw new Error("Polymarket L2 request path is invalid");
  }
  if (
    input.body !== undefined &&
    TEXT_ENCODER.encode(input.body).byteLength > MAX_BODY_BYTES
  ) {
    throw new Error("Polymarket L2 request body exceeds the signing limit");
  }
}

/** Implements the exact timestamp + method + path + optional body SDK contract. */
export async function signPolymarketL2Request(
  input: PolymarketL2SigningInput,
): Promise<string> {
  assertSigningInput(input);
  const secretBytes = decodeApiSecret(input.secret);
  const keyMaterial = new ArrayBuffer(secretBytes.byteLength);
  const keyBytes = new Uint8Array(keyMaterial);
  keyBytes.set(secretBytes);

  try {
    const key = await globalThis.crypto.subtle.importKey(
      "raw",
      keyMaterial,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const message = `${input.timestamp}${input.method}${input.requestPath}${input.body ?? ""}`;
    const signature = await globalThis.crypto.subtle.sign(
      "HMAC",
      key,
      TEXT_ENCODER.encode(message),
    );

    // The pinned SDK uses URL-safe base64 while preserving `=` padding.
    return Buffer.from(signature)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
  } finally {
    secretBytes.fill(0);
    keyBytes.fill(0);
  }
}

function assertHeaderValue(value: string, field: string, maxLength: number): void {
  if (
    value.length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new Error(`Polymarket ${field} is invalid`);
  }
}

/** Builds exactly the five CLOB L2 headers documented by Polymarket. */
export async function createPolymarketL2Headers(
  input: PolymarketL2HeaderInput,
): Promise<PolymarketL2Headers> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(input.address)) {
    throw new Error("Polymarket signer address is invalid");
  }
  assertHeaderValue(input.credentials.apiKey, "API key", 256);
  assertHeaderValue(input.credentials.passphrase, "API passphrase", 512);

  const signature = await signPolymarketL2Request({
    secret: input.credentials.secret,
    timestamp: input.timestamp,
    method: input.method,
    requestPath: input.requestPath,
    body: input.body,
  });

  return Object.freeze({
    POLY_ADDRESS: input.address,
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: String(input.timestamp),
    POLY_API_KEY: input.credentials.apiKey,
    POLY_PASSPHRASE: input.credentials.passphrase,
  });
}
