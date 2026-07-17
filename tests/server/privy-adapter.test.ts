import { describe, expect, it, vi } from "vitest";

import {
  PRIVY_API_HOST,
  createPrivySessionAdapters,
  type PrivySdkBoundary,
} from "@/server/auth/privy-adapter";

const SDK_USER = {
  id: "did:privy:user-1",
  linked_accounts: [
    {
      type: "google_oauth",
      email: "trader@gmail.com",
      subject: "google-1",
      verified_at: 123,
    },
  ],
};

function sdk(): PrivySdkBoundary {
  return {
    verifyAccessToken: vi.fn().mockResolvedValue({
      app_id: "privy-app",
      issuer: "privy.io",
      issued_at: 100,
      expiration: 200,
      session_id: "session-1",
      user_id: "did:privy:user-1",
    }),
    createClient: vi.fn().mockReturnValue({
      getUser: vi.fn().mockResolvedValue(SDK_USER),
    }),
  };
}

describe("createPrivySessionAdapters", () => {
  it("pins the official API and maps the current SDK token and user shapes", async () => {
    const boundary = sdk();
    const adapters = createPrivySessionAdapters(
      {
        appId: "privy-app",
        appSecret: "privy-secret",
        verificationKey: "privy-public-key",
      },
      boundary,
    );

    expect(boundary.createClient).toHaveBeenCalledWith({
      appId: "privy-app",
      appSecret: "privy-secret",
      apiUrl: PRIVY_API_HOST,
      maxRetries: 1,
      timeout: 5_000,
    });
    await expect(adapters.verifier.verify("access.jwt.token")).resolves.toEqual({
      appId: "privy-app",
      issuer: "privy.io",
      issuedAt: 100,
      expiration: 200,
      sessionId: "session-1",
      userId: "did:privy:user-1",
    });
    expect(boundary.verifyAccessToken).toHaveBeenCalledWith({
      access_token: "access.jwt.token",
      app_id: "privy-app",
      verification_key: "privy-public-key",
    });

    await expect(adapters.users.get("did:privy:user-1")).resolves.toEqual({
      id: "did:privy:user-1",
      linkedAccounts: SDK_USER.linked_accounts,
    });
    expect(Object.isFrozen(adapters)).toBe(true);
  });

  it.each([
    { appId: "", appSecret: "secret", verificationKey: "key" },
    { appId: "app", appSecret: "", verificationKey: "key" },
    { appId: "app", appSecret: "secret", verificationKey: "" },
  ])("rejects incomplete server credentials before creating a client", (config) => {
    const boundary = sdk();

    expect(() => createPrivySessionAdapters(config, boundary)).toThrow(
      /Privy session adapter configuration/i,
    );
    expect(boundary.createClient).not.toHaveBeenCalled();
  });

  it("does not expose the app secret or verification key on the adapters", () => {
    const serialized = JSON.stringify(
      createPrivySessionAdapters(
        {
          appId: "privy-app",
          appSecret: "never-serialize-this-secret",
          verificationKey: "never-serialize-this-key",
        },
        sdk(),
      ),
    );

    expect(serialized).not.toContain("never-serialize-this");
  });
});
