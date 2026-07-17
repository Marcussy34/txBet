import { describe, expect, it, vi } from "vitest";

import {
  AuthenticationError,
  extractBearerAccessToken,
  parseOperatorEmails,
  verifyPrivySession,
  type PrivyAccessTokenVerifier,
  type PrivyUserReader,
} from "@/server/auth/privy-session";

const NOW = 1_784_249_200;
const TOKEN = "header.payload.signature";

function verifier(
  overrides: Partial<Awaited<ReturnType<PrivyAccessTokenVerifier["verify"]>>> = {},
): PrivyAccessTokenVerifier {
  return {
    verify: vi.fn().mockResolvedValue({
      appId: "privy-app",
      issuer: "privy.io",
      issuedAt: NOW - 10,
      expiration: NOW + 300,
      sessionId: "session-1",
      userId: "did:privy:user-1",
      ...overrides,
    }),
  };
}

function users(
  linkedAccounts: readonly Readonly<Record<string, unknown>>[] = [
    {
      type: "google_oauth",
      email: "Trader@Gmail.com",
      subject: "google-subject-1",
      verified_at: NOW - 100,
      latest_verified_at: NOW - 100,
    },
  ],
  id = "did:privy:user-1",
): PrivyUserReader {
  return {
    get: vi.fn().mockResolvedValue({ id, linkedAccounts }),
  };
}

async function authenticate(
  overrides: Partial<Parameters<typeof verifyPrivySession>[0]> = {},
) {
  return verifyPrivySession({
    authorization: `Bearer ${TOKEN}`,
    expectedAppId: "privy-app",
    nowSeconds: NOW,
    operatorEmails: ["trader@gmail.com"],
    verifier: verifier(),
    users: users(),
    ...overrides,
  });
}

describe("extractBearerAccessToken", () => {
  it("accepts one exact bearer JWT and returns only the token", () => {
    expect(extractBearerAccessToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it.each([
    undefined,
    null,
    "",
    TOKEN,
    `bearer ${TOKEN}`,
    `Bearer  ${TOKEN}`,
    `Bearer ${TOKEN} extra`,
    `Bearer ${TOKEN}, Bearer ${TOKEN}`,
    "Bearer not-a-jwt",
    `Bearer ${"a".repeat(8_193)}`,
  ])("rejects absent, ambiguous, or malformed authorization: %s", (value) => {
    expect(() => extractBearerAccessToken(value)).toThrow(AuthenticationError);
  });
});

describe("parseOperatorEmails", () => {
  it("normalizes, sorts, freezes, and de-duplicates exact operator emails", () => {
    const emails = parseOperatorEmails(" Boss@Example.com,ops@example.com,boss@example.com ");

    expect(emails).toEqual(["boss@example.com", "ops@example.com"]);
    expect(Object.isFrozen(emails)).toBe(true);
  });

  it.each(["", ",", "not-an-email", "a@example.com,", "@example.com"])(
    "rejects an invalid operator allowlist: %s",
    (value) => expect(() => parseOperatorEmails(value)).toThrow(/operator/i),
  );
});

describe("verifyPrivySession", () => {
  it("verifies the bearer token, reads the exact Privy user, and returns frozen identity", async () => {
    const tokenVerifier = verifier();
    const userReader = users();

    const session = await authenticate({ verifier: tokenVerifier, users: userReader });

    expect(tokenVerifier.verify).toHaveBeenCalledWith(TOKEN);
    expect(userReader.get).toHaveBeenCalledWith("did:privy:user-1");
    expect(session).toEqual({
      privyDid: "did:privy:user-1",
      sessionId: "session-1",
      verifiedGoogleEmail: "trader@gmail.com",
      isOperator: true,
      issuedAt: NOW - 10,
      expiresAt: NOW + 300,
    });
    expect(Object.isFrozen(session)).toBe(true);
    expect(JSON.stringify(session)).not.toContain(TOKEN);
  });

  it("uses exact normalized operator email matching", async () => {
    expect(
      (await authenticate({ operatorEmails: ["othertrader@gmail.com"] })).isOperator,
    ).toBe(false);
    expect(
      (await authenticate({ operatorEmails: ["TRADER@GMAIL.COM"] })).isOperator,
    ).toBe(true);
  });

  it.each([
    ["wrong app", { appId: "other-app" }],
    ["wrong issuer", { issuer: "lookalike.privy.io" }],
    ["expired", { expiration: NOW }],
    ["future issued-at", { issuedAt: NOW + 31 }],
    ["empty session", { sessionId: "" }],
    ["non-Privy user ID", { userId: "user-1" }],
  ] as const)("fails closed for %s token claims", async (_label, claims) => {
    await expect(authenticate({ verifier: verifier(claims) })).rejects.toEqual(
      new AuthenticationError(),
    );
  });

  it("normalizes verifier and user lookup failures without exposing secrets", async () => {
    const throwingVerifier: PrivyAccessTokenVerifier = {
      verify: vi.fn().mockRejectedValue(new Error(`bad token ${TOKEN}`)),
    };
    const throwingUsers: PrivyUserReader = {
      get: vi.fn().mockRejectedValue(new Error(`upstream saw ${TOKEN}`)),
    };

    for (const inputs of [
      { verifier: throwingVerifier },
      { verifier: verifier(), users: throwingUsers },
    ]) {
      const error = await authenticate(inputs).catch((reason: unknown) => reason);
      expect(error).toEqual(new AuthenticationError());
      expect(String(error)).not.toContain(TOKEN);
    }
  });

  it.each([
    ["mismatched user", users(undefined, "did:privy:other-user")],
    ["no Google account", users([{ type: "email", address: "trader@gmail.com", verified_at: NOW - 1 }])],
    ["unverified Google account", users([{ type: "google_oauth", email: "trader@gmail.com", subject: "google-1", verified_at: 0 }])],
    ["future verification", users([{ type: "google_oauth", email: "trader@gmail.com", subject: "google-1", verified_at: NOW + 1 }])],
    ["missing Google subject", users([{ type: "google_oauth", email: "trader@gmail.com", subject: "", verified_at: NOW - 1 }])],
    [
      "ambiguous Google accounts",
      users([
        { type: "google_oauth", email: "trader@gmail.com", subject: "google-1", verified_at: NOW - 1 },
        { type: "google_oauth", email: "other@gmail.com", subject: "google-2", verified_at: NOW - 1 },
      ]),
    ],
  ] as const)("fails closed for %s", async (_label, userReader) => {
    await expect(authenticate({ users: userReader })).rejects.toEqual(
      new AuthenticationError(),
    );
  });

  it("rejects cookie-only authentication before calling Privy", async () => {
    const tokenVerifier = verifier();

    await expect(
      authenticate({ authorization: undefined, verifier: tokenVerifier }),
    ).rejects.toEqual(new AuthenticationError());
    expect(tokenVerifier.verify).not.toHaveBeenCalled();
  });
});
