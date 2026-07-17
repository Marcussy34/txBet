import { z } from "zod";

import type { EncryptedEnvelopeV1 } from "@/server/crypto/envelope";
import type { EnvelopeKeyring } from "@/server/crypto/keyring";

import {
  assertValidPolymarketApiSecret,
  type PolymarketClobCredentials,
} from "./hmac";

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const AAD_DOMAIN = "txbet-polymarket-clob-credentials-v1";

const credentialBindingSchema = z
  .object({
    profileId: z.string().uuid(),
    venueAccountId: z.string().uuid(),
    credentialVersion: z.number().int().positive().safe(),
  })
  .strict();

const credentialSchema = z
  .object({
    apiKey: z.string().min(1).max(256).regex(/^[\x21-\x7e]+$/),
    secret: z.string().min(1).max(8_192),
    passphrase: z.string().min(1).max(512).regex(/^[\x21-\x7e]+$/),
  })
  .strict()
  .superRefine((value, context) => {
    try {
      assertValidPolymarketApiSecret(value.secret);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["secret"],
        message: "invalid encoding",
      });
    }
  });

export interface PolymarketCredentialBinding {
  readonly profileId: string;
  readonly venueAccountId: string;
  readonly credentialVersion: number;
}

function parseBinding(
  binding: PolymarketCredentialBinding,
): PolymarketCredentialBinding {
  const parsed = credentialBindingSchema.safeParse(binding);
  if (!parsed.success) {
    throw new Error("Invalid Polymarket credential binding");
  }
  return parsed.data;
}

function parseCredentials(value: unknown): PolymarketClobCredentials {
  const parsed = credentialSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Invalid Polymarket CLOB credentials");
  }
  return Object.freeze(parsed.data);
}

function lengthPrefixed(value: string): Buffer {
  const encoded = Buffer.from(value, "utf8");
  const length = Buffer.allocUnsafe(4);
  length.writeUInt32BE(encoded.byteLength);
  return Buffer.concat([length, encoded]);
}

/** Separately length-prefixes every identity component to prevent AAD ambiguity. */
export function buildPolymarketCredentialAad(
  binding: PolymarketCredentialBinding,
): Uint8Array {
  const parsed = parseBinding(binding);
  return new Uint8Array(
    Buffer.concat([
      lengthPrefixed(AAD_DOMAIN),
      lengthPrefixed(parsed.profileId),
      lengthPrefixed(parsed.venueAccountId),
      lengthPrefixed(String(parsed.credentialVersion)),
    ]),
  );
}

export function encryptPolymarketCredentials(
  credentials: PolymarketClobCredentials,
  binding: PolymarketCredentialBinding,
  keyring: EnvelopeKeyring,
): EncryptedEnvelopeV1 {
  const parsed = parseCredentials(credentials);
  const plaintext = TEXT_ENCODER.encode(
    JSON.stringify({
      apiKey: parsed.apiKey,
      secret: parsed.secret,
      passphrase: parsed.passphrase,
    }),
  );

  try {
    return keyring.encrypt(plaintext, buildPolymarketCredentialAad(binding));
  } finally {
    plaintext.fill(0);
  }
}

/** Keeps decrypted bytes scoped to one callback and clears the byte buffer afterward. */
export async function withDecryptedPolymarketCredentials<T>(
  envelope: EncryptedEnvelopeV1,
  binding: PolymarketCredentialBinding,
  keyring: EnvelopeKeyring,
  operation: (
    credentials: Readonly<PolymarketClobCredentials>,
  ) => T | Promise<T>,
): Promise<T> {
  const plaintext = keyring.decrypt(
    envelope,
    buildPolymarketCredentialAad(binding),
  );

  try {
    let decoded: unknown;
    try {
      decoded = JSON.parse(TEXT_DECODER.decode(plaintext)) as unknown;
    } catch {
      throw new Error("Invalid Polymarket CLOB credential payload");
    }
    return await operation(parseCredentials(decoded));
  } finally {
    plaintext.fill(0);
  }
}
