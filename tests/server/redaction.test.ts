import { describe, expect, it } from "vitest";

import { REDACTED, redactSensitive } from "@/server/security/redaction";

describe("redactSensitive", () => {
  it("redacts credential and signed-payload fields recursively without mutating input", () => {
    const input = {
      authorization: "Bearer auth-secret",
      Cookie: "session=cookie-secret",
      nested: {
        apiKey: "api-secret",
        hmac_signature: "hmac-secret",
        signedPayload: "signed-secret",
        private_key: "private-secret",
        safe: "visible",
      },
      entries: [
        { "x-api-key": "array-secret" },
        { setCookie: "response-cookie", publicKey: "safe-public-key" },
      ],
    };

    expect(redactSensitive(input)).toEqual({
      authorization: REDACTED,
      Cookie: REDACTED,
      nested: {
        apiKey: REDACTED,
        hmac_signature: REDACTED,
        signedPayload: REDACTED,
        private_key: REDACTED,
        safe: "visible",
      },
      entries: [
        { "x-api-key": REDACTED },
        { setCookie: REDACTED, publicKey: "safe-public-key" },
      ],
    });
    expect(input.nested.apiKey).toBe("api-secret");
  });

  it("redacts common secret and token spellings but preserves key identifiers", () => {
    expect(
      redactSensitive({
        client_secret: "secret",
        accessToken: "token",
        PRIVY_AUTHORIZATION_PRIVATE_KEY: "private",
        keyId: "active-v1",
        policyId: "policy-v1",
      }),
    ).toEqual({
      client_secret: REDACTED,
      accessToken: REDACTED,
      PRIVY_AUTHORIZATION_PRIVATE_KEY: REDACTED,
      keyId: "active-v1",
      policyId: "policy-v1",
    });
  });

  it("redacts passwords, passphrases, encoded keys, and complete keyrings", () => {
    expect(
      redactSensitive({
        password: "database-password",
        POLYMARKET_BUILDER_API_PASSPHRASE: "builder-passphrase",
        keyBase64: "encoded-key",
        keyBytes: [1, 2, 3],
        TXBET_ENVELOPE_KEYRING_JSON: "whole-keyring",
        seedPhrase: "wallet-seed",
        keyId: "safe-key-id",
      }),
    ).toEqual({
      password: REDACTED,
      POLYMARKET_BUILDER_API_PASSPHRASE: REDACTED,
      keyBase64: REDACTED,
      keyBytes: REDACTED,
      TXBET_ENVELOPE_KEYRING_JSON: REDACTED,
      seedPhrase: REDACTED,
      keyId: "safe-key-id",
    });
  });

  it("returns scalar values unchanged", () => {
    expect(redactSensitive("visible")).toBe("visible");
    expect(redactSensitive(42)).toBe(42);
    expect(redactSensitive(null)).toBeNull();
  });

  it("redacts credential header tuples and Headers instances", () => {
    expect(
      redactSensitive([
        ["authorization", "Bearer secret"],
        ["x-api-key", "api-secret"],
        ["content-type", "application/json"],
      ]),
    ).toEqual([
      ["authorization", REDACTED],
      ["x-api-key", REDACTED],
      ["content-type", "application/json"],
    ]);

    const headers = new Headers({
      authorization: "Bearer secret",
      "content-type": "application/json",
    });
    expect(redactSensitive(headers)).toEqual({
      authorization: REDACTED,
      "content-type": "application/json",
    });
  });

  it("does not allow __proto__ keys to change the redacted clone prototype", () => {
    const input = JSON.parse(
      '{"__proto__":{"polluted":true},"secretKey":"credential"}',
    ) as unknown;
    const result = redactSensitive(input) as Record<string, unknown>;

    expect(Object.getPrototypeOf(result)).toBeNull();
    expect(result.secretKey).toBe(REDACTED);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});
