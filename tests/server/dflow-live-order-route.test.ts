import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationError } from "@/server/auth/privy-session";
import { DflowCanaryError } from "@/server/execution/dflow-canary-service";

vi.mock("@/server/auth/vercel-request", () => ({
  verifyVercelPrivyRequest: vi.fn(),
}));
vi.mock("@/server/config/env", () => ({
  loadVercelDflowCanaryEnv: vi.fn(),
}));
vi.mock("@/server/execution/dflow-canary-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/execution/dflow-canary-service")>();
  return { ...original, submitDflowCanaryOrder: vi.fn() };
});
vi.mock("@/server/execution/dflow-privy-signer", () => ({
  createDflowPrivySigner: vi.fn(),
}));
vi.mock("@/server/execution/vercel-blob-store", () => ({
  createVercelBlobJournalStore: vi.fn(),
}));

import { POST, runtime } from "@/app/api/execution/dflow/order/route";
import { verifyVercelPrivyRequest } from "@/server/auth/vercel-request";
import { loadVercelDflowCanaryEnv } from "@/server/config/env";
import { submitDflowCanaryOrder } from "@/server/execution/dflow-canary-service";
import { createDflowPrivySigner } from "@/server/execution/dflow-privy-signer";
import { createVercelBlobJournalStore } from "@/server/execution/vercel-blob-store";

const body = {
  bindingId: "world-cup-winner-argentina-yes",
  amountMicros: 1_000_000,
  minimumOutputAtomic: "500000",
  expectedControlVersion: 1,
  confirmRealMoney: true,
};

function request(options: {
  body?: unknown;
  origin?: string;
  contentType?: string;
  idempotencyKey?: string;
} = {}): Request {
  return new Request("https://txbet.example/api/execution/dflow/order", {
    method: "POST",
    headers: {
      authorization: "Bearer header.payload.signature",
      origin: options.origin ?? "https://txbet.example",
      "content-type": options.contentType ?? "application/json",
      ...(options.idempotencyKey === null
        ? {}
        : { "idempotency-key": options.idempotencyKey ?? "order-1" }),
    },
    body: JSON.stringify(options.body ?? body),
  });
}

describe("deployed DFlow live-order route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(verifyVercelPrivyRequest).mockResolvedValue({
      env: { NEXT_PUBLIC_SITE_URL: "https://txbet.example" } as never,
      session: {
        privyDid: "did:privy:user-1",
        sessionId: "session-1",
        verifiedGoogleEmail: "trader@example.com",
        isOperator: false,
        issuedAt: 1,
        expiresAt: 2,
      },
    });
    vi.mocked(loadVercelDflowCanaryEnv).mockReturnValue({
      PRIVY_APP_ID: "app",
      PRIVY_APP_SECRET: "secret",
      PRIVY_AUTHORIZATION_PRIVATE_KEY: "private",
      PRIVY_KEY_QUORUM_ID: "quorum",
      PRIVY_DFLOW_POLICY_ID: "policy",
    } as never);
    vi.mocked(createDflowPrivySigner).mockReturnValue({} as never);
    vi.mocked(createVercelBlobJournalStore).mockReturnValue({} as never);
    vi.mocked(submitDflowCanaryOrder).mockResolvedValue({
      schemaVersion: "txbet-dflow-canary-result-v1",
      operationId: "a".repeat(64),
      state: "submitted",
      signature: "signature",
      bindingId: body.bindingId,
      amountMicros: body.amountMicros,
      riskMicros: 1_005_200,
    });
  });

  it("uses Node and submits only the strict authenticated same-origin request", async () => {
    expect(runtime).toBe("nodejs");
    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      order: { state: "submitted", amountMicros: 1_000_000 },
    });
    expect(submitDflowCanaryOrder).toHaveBeenCalledWith(expect.objectContaining({
      profileId: "did:privy:user-1",
      idempotencyKey: "order-1",
      order: body,
    }));
  });

  it("rejects missing confirmation, unknown fields, raw wallet/mint inputs, and invalid money", async () => {
    for (const invalid of [
      { ...body, confirmRealMoney: false },
      { ...body, walletId: "attacker-wallet" },
      { ...body, outputMint: "attacker-mint" },
      { ...body, amountMicros: 1.5 },
      { ...body, amountMicros: 10_000_001 },
      { ...body, minimumOutputAtomic: "01" },
    ]) {
      const response = await POST(request({ body: invalid }));
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(submitDflowCanaryOrder).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, non-JSON, and missing-idempotency mutations before execution", async () => {
    const cases = [
      { request: request({ origin: "https://evil.example" }), status: 403 },
      { request: request({ contentType: "text/plain" }), status: 415 },
      { request: request({ idempotencyKey: null as never }), status: 400 },
    ];
    for (const test of cases) {
      const response = await POST(test.request);
      expect(response.status).toBe(test.status);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(submitDflowCanaryOrder).not.toHaveBeenCalled();
  });

  it("normalizes auth, canary, and unexpected failures without leaking upstream data", async () => {
    vi.mocked(verifyVercelPrivyRequest).mockRejectedValueOnce(new AuthenticationError());
    const unauthorized = await POST(request());
    expect(unauthorized.status).toBe(401);

    vi.mocked(submitDflowCanaryOrder).mockRejectedValueOnce(
      new DflowCanaryError("CONTROL_OR_BUDGET_REJECTED", 409),
    );
    const refused = await POST(request());
    expect(refused.status).toBe(409);
    await expect(refused.json()).resolves.toEqual({
      ok: false,
      error: { code: "CONTROL_OR_BUDGET_REJECTED" },
    });

    vi.mocked(submitDflowCanaryOrder).mockRejectedValueOnce(
      new Error("secret API key and signed transaction bytes"),
    );
    const unavailable = await POST(request());
    expect(unavailable.status).toBe(503);
    const text = await unavailable.text();
    expect(text).toContain("DFLOW_CANARY_UNAVAILABLE");
    expect(text).not.toMatch(/secret|signed transaction/i);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
  });
});
