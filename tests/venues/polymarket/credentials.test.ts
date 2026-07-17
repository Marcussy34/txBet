import { describe, expect, it } from "vitest";

import { EnvelopeKeyring } from "@/server/crypto/keyring";
import { REDACTED, redactSensitive } from "@/server/security/redaction";
import {
  buildPolymarketCredentialAad,
  encryptPolymarketCredentials,
  withDecryptedPolymarketCredentials,
} from "@/venues/polymarket/credentials";

const BINDING = Object.freeze({
  profileId: "00000000-0000-4000-8000-000000000001",
  venueAccountId: "00000000-0000-4000-8000-000000000011",
  credentialVersion: 3,
});
const CREDENTIALS = Object.freeze({
  apiKey: "550e8400-e29b-41d4-a716-446655440000",
  secret: "c3VwZXItc2VjcmV0LWtleQ==",
  passphrase: "test-passphrase",
});
const KEYRING = new EnvelopeKeyring("active-v1", [
  { id: "active-v1", key: new Uint8Array(32).fill(7) },
]);

describe("encrypted Polymarket credentials", () => {
  it("round trips only through a short-lived callback and never serializes plaintext", async () => {
    const envelope = encryptPolymarketCredentials(
      CREDENTIALS,
      BINDING,
      KEYRING,
    );

    expect(JSON.stringify(envelope)).not.toContain(CREDENTIALS.apiKey);
    expect(JSON.stringify(envelope)).not.toContain(CREDENTIALS.secret);
    expect(JSON.stringify(envelope)).not.toContain(CREDENTIALS.passphrase);
    await expect(
      withDecryptedPolymarketCredentials(
        envelope,
        BINDING,
        KEYRING,
        async (credentials) => ({
          apiKey: credentials.apiKey,
          secret: credentials.secret,
          passphrase: credentials.passphrase,
          frozen: Object.isFrozen(credentials),
        }),
      ),
    ).resolves.toEqual({ ...CREDENTIALS, frozen: true });
  });

  it("cryptographically binds profile, venue account, and credential version", async () => {
    const envelope = encryptPolymarketCredentials(
      CREDENTIALS,
      BINDING,
      KEYRING,
    );

    for (const wrongBinding of [
      { ...BINDING, profileId: "00000000-0000-4000-8000-000000000002" },
      { ...BINDING, venueAccountId: "00000000-0000-4000-8000-000000000012" },
      { ...BINDING, credentialVersion: 4 },
    ]) {
      await expect(
        withDecryptedPolymarketCredentials(
          envelope,
          wrongBinding,
          KEYRING,
          () => undefined,
        ),
      ).rejects.toThrow("Envelope authentication failed");
    }
  });

  it("uses an unambiguous, versioned AAD encoding", () => {
    const aad = buildPolymarketCredentialAad(BINDING);
    expect(new TextDecoder().decode(aad)).not.toContain(
      `${BINDING.profileId}:${BINDING.venueAccountId}`,
    );
    expect(buildPolymarketCredentialAad(BINDING)).toEqual(aad);
    expect(
      buildPolymarketCredentialAad({ ...BINDING, credentialVersion: 4 }),
    ).not.toEqual(aad);
  });

  it.each([
    { ...CREDENTIALS, apiKey: "" },
    { ...CREDENTIALS, secret: "invalid secret" },
    { ...CREDENTIALS, passphrase: "" },
  ])("rejects malformed credentials before encryption", (credentials) => {
    expect(() =>
      encryptPolymarketCredentials(credentials, BINDING, KEYRING),
    ).toThrow("Invalid Polymarket CLOB credentials");
  });

  it("redacts every L2 authentication secret and signature", () => {
    expect(
      redactSensitive({
        POLY_ADDRESS: "0x1111111111111111111111111111111111111111",
        POLY_SIGNATURE: "sensitive-signature",
        POLY_TIMESTAMP: "1700000000",
        POLY_API_KEY: CREDENTIALS.apiKey,
        POLY_PASSPHRASE: CREDENTIALS.passphrase,
      }),
    ).toEqual({
      POLY_ADDRESS: "0x1111111111111111111111111111111111111111",
      POLY_SIGNATURE: REDACTED,
      POLY_TIMESTAMP: "1700000000",
      POLY_API_KEY: REDACTED,
      POLY_PASSPHRASE: REDACTED,
    });
  });
});
