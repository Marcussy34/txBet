import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthenticationError } from "@/server/auth/privy-session";
import {
  BlobJournalConflictError,
  type BlobJournalObjectStore,
} from "@/server/execution/blob-journal";

vi.mock("@/server/auth/vercel-request", () => ({
  verifyVercelPrivyRequest: vi.fn(),
}));
vi.mock("@/server/execution/vercel-blob-store", () => ({
  createVercelBlobJournalStore: vi.fn(),
}));

import { GET, PUT } from "@/app/api/execution/control/route";
import { verifyVercelPrivyRequest } from "@/server/auth/vercel-request";
import { createVercelBlobJournalStore } from "@/server/execution/vercel-blob-store";

const NOW = 1_784_249_200_000;

function memoryStore(): BlobJournalObjectStore {
  const objects = new Map<string, { body: string; etag: string }>();
  let revision = 0;
  return {
    async read(pathname) {
      const value = objects.get(pathname);
      return value === undefined ? null : { ...value };
    },
    async create(pathname, body) {
      if (objects.has(pathname)) throw new BlobJournalConflictError();
      const etag = `etag-${++revision}`;
      objects.set(pathname, { body, etag });
      return { etag };
    },
    async replace(pathname, body, expectedEtag) {
      const current = objects.get(pathname);
      if (current?.etag !== expectedEtag) throw new BlobJournalConflictError();
      const etag = `etag-${++revision}`;
      objects.set(pathname, { body, etag });
      return { etag };
    },
  };
}

function request(method: "GET" | "PUT", body?: unknown, origin = "https://txbet.example") {
  const headers = new Headers({ authorization: "Bearer header.payload.signature" });
  if (method === "PUT") {
    headers.set("content-type", "application/json");
    headers.set("origin", origin);
    headers.set("idempotency-key", "control-v1");
  }
  return new Request("https://txbet.example/api/execution/control", {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe("Vercel execution control route", () => {
  beforeEach(() => {
    vi.spyOn(Date, "now").mockReturnValue(NOW);
    vi.mocked(verifyVercelPrivyRequest).mockResolvedValue({
      env: { NEXT_PUBLIC_SITE_URL: "https://txbet.example" } as never,
      session: {
        privyDid: "did:privy:user-1",
        sessionId: "session-1",
        verifiedGoogleEmail: "trader@example.com",
        isOperator: false,
        issuedAt: Math.floor(NOW / 1_000) - 1,
        expiresAt: Math.floor(NOW / 1_000) + 300,
      },
    });
    vi.mocked(createVercelBlobJournalStore).mockReturnValue(memoryStore());
  });

  afterEach(() => vi.restoreAllMocks());

  it("returns the authenticated user's fail-closed control view", async () => {
    const response = await GET(request("GET"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      control: {
        requestedMode: "disabled",
        kalshiDflow: { mode: "shadow", executable: false },
        pairedExecution: { executable: false },
      },
    });
  });

  it("accepts a same-origin, versioned user control update", async () => {
    const response = await PUT(
      request("PUT", {
        expectedVersion: 0,
        mode: "shadow",
        maxTotalMicros: 1_000_000,
        expiresAtMs: NOW + 86_400_000,
        confirmRealMoney: false,
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      control: { version: 1, requestedMode: "shadow" },
    });
  });

  it("rejects cross-origin mutations before writing", async () => {
    const store = memoryStore();
    vi.mocked(createVercelBlobJournalStore).mockReturnValue(store);
    const response = await PUT(
      request(
        "PUT",
        {
          expectedVersion: 0,
          mode: "shadow",
          maxTotalMicros: 1_000_000,
          expiresAtMs: NOW + 1_000,
          confirmRealMoney: false,
        },
        "https://evil.example",
      ),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "ORIGIN_MISMATCH" },
    });
    await expect(store.read("txbet/execution/did%3Aprivy%3Auser-1/journal.json")).resolves.toBeNull();
  });

  it("normalizes Privy authentication failures", async () => {
    vi.mocked(verifyVercelPrivyRequest).mockRejectedValue(new AuthenticationError());

    const response = await GET(request("GET"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: { code: "UNAUTHORIZED" },
    });
  });
});
