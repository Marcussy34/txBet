import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const ENVELOPE_ALGORITHM = "A256GCM";
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface EnvelopeKey {
  readonly id: string;
  readonly key: Uint8Array;
}

export interface EncryptedEnvelopeV1 {
  readonly version: 1;
  readonly algorithm: "A256GCM";
  readonly keyId: string;
  readonly iv: string;
  readonly ciphertext: string;
  readonly authTag: string;
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new Error("Envelope keys must contain exactly 32 bytes");
  }
}

function assertKeyId(keyId: string): void {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(keyId)) {
    throw new Error("Envelope key ID has an invalid format");
  }
}

function encode(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

function decode(value: string, field: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error(`Envelope ${field} has an invalid encoding`);
  }

  const decoded = Buffer.from(value, "base64url");
  if (decoded.toString("base64url") !== value) {
    throw new Error(`Envelope ${field} has a non-canonical encoding`);
  }
  return decoded;
}

function authenticatedData(keyId: string, aad: Uint8Array): Buffer {
  const header = Buffer.from(
    `txbet-envelope-v1\0${ENVELOPE_ALGORITHM}\0${keyId}`,
    "utf8",
  );
  const headerLength = Buffer.allocUnsafe(4);
  headerLength.writeUInt32BE(header.byteLength);

  // Length-prefix metadata so no concatenation ambiguity can weaken AAD.
  return Buffer.concat([headerLength, header, Buffer.from(aad)]);
}

export function encryptEnvelope(
  plaintext: Uint8Array,
  aad: Uint8Array,
  envelopeKey: EnvelopeKey,
): EncryptedEnvelopeV1 {
  assertKey(envelopeKey.key);
  assertKeyId(envelopeKey.id);

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, Buffer.from(envelopeKey.key), iv, {
    authTagLength: AUTH_TAG_BYTES,
  });
  cipher.setAAD(authenticatedData(envelopeKey.id, aad));
  const ciphertext = Buffer.concat([
    cipher.update(Buffer.from(plaintext)),
    cipher.final(),
  ]);

  return Object.freeze({
    version: 1,
    algorithm: ENVELOPE_ALGORITHM,
    keyId: envelopeKey.id,
    iv: encode(iv),
    ciphertext: encode(ciphertext),
    authTag: encode(cipher.getAuthTag()),
  });
}

export function decryptEnvelope(
  envelope: EncryptedEnvelopeV1,
  aad: Uint8Array,
  key: Uint8Array,
): Uint8Array {
  assertKey(key);
  if (envelope.version !== 1) {
    throw new Error("Unsupported envelope version");
  }
  if (envelope.algorithm !== ENVELOPE_ALGORITHM) {
    throw new Error("Unsupported envelope algorithm");
  }
  assertKeyId(envelope.keyId);

  const iv = decode(envelope.iv, "IV");
  const ciphertext = decode(envelope.ciphertext, "ciphertext");
  const authTag = decode(envelope.authTag, "authentication tag");
  if (iv.byteLength !== IV_BYTES) {
    throw new Error("Envelope IV must contain exactly 12 bytes");
  }
  if (authTag.byteLength !== AUTH_TAG_BYTES) {
    throw new Error("Envelope authentication tag must contain exactly 16 bytes");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, Buffer.from(key), iv, {
      authTagLength: AUTH_TAG_BYTES,
    });
    decipher.setAAD(authenticatedData(envelope.keyId, aad));
    decipher.setAuthTag(authTag);
    return new Uint8Array(
      Buffer.concat([decipher.update(ciphertext), decipher.final()]),
    );
  } catch {
    // Normalize crypto-library details without leaking any sensitive material.
    throw new Error("Envelope authentication failed");
  }
}
