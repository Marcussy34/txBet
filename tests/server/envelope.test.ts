import { describe, expect, it } from "vitest";

import {
  decryptEnvelope,
  encryptEnvelope,
  type EncryptedEnvelopeV1,
} from "@/server/crypto/envelope";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KEY = new Uint8Array(32).fill(7);
const AAD = encoder.encode("credential:profile-1:polymarket:v3");

function alterBase64Url(value: string): string {
  const replacement = value[0] === "A" ? "B" : "A";
  return `${replacement}${value.slice(1)}`;
}

describe("AES-256-GCM envelopes", () => {
  it("round trips with a random 96-bit IV and caller-supplied AAD", () => {
    const plaintext = encoder.encode("private venue credential");
    const first = encryptEnvelope(plaintext, AAD, { id: "active-v1", key: KEY });
    const second = encryptEnvelope(plaintext, AAD, { id: "active-v1", key: KEY });

    expect(first).toMatchObject({
      version: 1,
      algorithm: "A256GCM",
      keyId: "active-v1",
    });
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(decoder.decode(decryptEnvelope(first, AAD, KEY))).toBe(
      "private venue credential",
    );
  });

  it("rejects wrong AAD and tampering of every authenticated field", () => {
    const envelope = encryptEnvelope(encoder.encode("sensitive"), AAD, {
      id: "active-v1",
      key: KEY,
    });

    expect(() =>
      decryptEnvelope(envelope, encoder.encode("wrong-aad"), KEY),
    ).toThrow(/authentication/i);

    for (const field of ["iv", "ciphertext", "authTag"] as const) {
      const tampered: EncryptedEnvelopeV1 = {
        ...envelope,
        [field]: alterBase64Url(envelope[field]),
      };
      expect(() => decryptEnvelope(tampered, AAD, KEY)).toThrow();
    }
  });

  it("requires exactly 32 key bytes and a valid v1 envelope shape", () => {
    expect(() =>
      encryptEnvelope(encoder.encode("secret"), AAD, {
        id: "active-v1",
        key: new Uint8Array(31),
      }),
    ).toThrow(/32 bytes/i);

    const envelope = encryptEnvelope(encoder.encode("secret"), AAD, {
      id: "active-v1",
      key: KEY,
    });
    expect(() =>
      decryptEnvelope({ ...envelope, version: 2 as 1 }, AAD, KEY),
    ).toThrow(/version/i);
    expect(() =>
      decryptEnvelope({ ...envelope, iv: "not_base64!" }, AAD, KEY),
    ).toThrow(/encoding/i);
  });

  it("never serializes plaintext", () => {
    const plaintext = "DO_NOT_SERIALIZE_THIS_VALUE";
    const envelope = encryptEnvelope(encoder.encode(plaintext), AAD, {
      id: "active-v1",
      key: KEY,
    });

    expect(JSON.stringify(envelope)).not.toContain(plaintext);
    expect(Object.keys(envelope).sort()).toEqual(
      ["algorithm", "authTag", "ciphertext", "iv", "keyId", "version"].sort(),
    );
  });
});
