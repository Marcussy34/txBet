import { describe, expect, it } from "vitest";

import { EnvelopeKeyring } from "@/server/crypto/keyring";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const AAD = encoder.encode("artifact:attempt-1:v1");

function key(byte: number): Uint8Array {
  return new Uint8Array(32).fill(byte);
}

describe("EnvelopeKeyring", () => {
  it("always encrypts with the active key and decrypts historical-key envelopes", () => {
    const oldOnly = new EnvelopeKeyring("old-v1", [
      { id: "old-v1", key: key(1) },
    ]);
    const historicalEnvelope = oldOnly.encrypt(encoder.encode("historical"), AAD);

    const rotated = new EnvelopeKeyring("active-v2", [
      { id: "active-v2", key: key(2) },
      { id: "old-v1", key: key(1) },
    ]);
    const currentEnvelope = rotated.encrypt(encoder.encode("current"), AAD);

    expect(currentEnvelope.keyId).toBe("active-v2");
    expect(decoder.decode(rotated.decrypt(historicalEnvelope, AAD))).toBe(
      "historical",
    );
    expect(decoder.decode(rotated.decrypt(currentEnvelope, AAD))).toBe("current");
  });

  it("rejects duplicate IDs, a missing active ID, and non-32-byte keys", () => {
    expect(
      () =>
        new EnvelopeKeyring("active", [
          { id: "active", key: key(1) },
          { id: "active", key: key(2) },
        ]),
    ).toThrow(/duplicate/i);
    expect(
      () => new EnvelopeKeyring("missing", [{ id: "old", key: key(1) }]),
    ).toThrow(/active/i);
    expect(
      () =>
        new EnvelopeKeyring("active", [
          { id: "active", key: new Uint8Array(33) },
        ]),
    ).toThrow(/32 bytes/i);
  });

  it("selects decryption strictly by key ID and rejects an unknown ID", () => {
    const ring = new EnvelopeKeyring("active", [
      { id: "active", key: key(3) },
      { id: "historical", key: key(4) },
    ]);
    const envelope = ring.encrypt(encoder.encode("secret"), AAD);

    expect(() =>
      ring.decrypt({ ...envelope, keyId: "unknown" }, AAD),
    ).toThrow(/unknown envelope key/i);
  });

  it("does not retain caller-owned mutable key bytes", () => {
    const callerKey = key(5);
    const ring = new EnvelopeKeyring("active", [
      { id: "active", key: callerKey },
    ]);
    const envelope = ring.encrypt(encoder.encode("secret"), AAD);

    callerKey.fill(9);
    expect(decoder.decode(ring.decrypt(envelope, AAD))).toBe("secret");
  });
});
