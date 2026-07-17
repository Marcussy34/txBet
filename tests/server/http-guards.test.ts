import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  assertResourceOwner,
  requireJsonMutation,
} from "@/server/http/guards";

const schema = z.strictObject({ value: z.string().min(1) });

function request(overrides: {
  authorization?: string | null;
  contentType?: string | null;
  cookie?: string | null;
  idempotencyKey?: string | null;
  origin?: string | null;
  body?: string;
} = {}) {
  const headers = new Headers();
  const values = {
    authorization: "Bearer access-token",
    contentType: "application/json",
    cookie: null,
    idempotencyKey: "attempt-123",
    origin: "https://txbet.example",
    body: JSON.stringify({ value: "safe" }),
    ...overrides,
  };
  if (values.authorization !== null) headers.set("authorization", values.authorization);
  if (values.contentType !== null) headers.set("content-type", values.contentType);
  if (values.cookie !== null) headers.set("cookie", values.cookie);
  if (values.idempotencyKey !== null) {
    headers.set("idempotency-key", values.idempotencyKey);
  }
  if (values.origin !== null) headers.set("origin", values.origin);
  return new Request("https://txbet.example/api/settings", {
    method: "PUT",
    headers,
    body: values.body,
  });
}

describe("mutation HTTP guards", () => {
  it("returns only the bearer token, validated body, and idempotency key", async () => {
    await expect(
      requireJsonMutation(request(), {
        expectedOrigin: "https://txbet.example",
        schema,
        requireIdempotencyKey: true,
      }),
    ).resolves.toEqual({
      accessToken: "access-token",
      body: { value: "safe" },
      idempotencyKey: "attempt-123",
    });
  });

  it("rejects absent/malformed bearer auth and cookie-only auth", async () => {
    for (const authorization of [null, "", "Basic abc", "Bearer ", "Bearer a b"]) {
      await expect(
        requireJsonMutation(
          request({ authorization, cookie: "session=cookie-only" }),
          {
            expectedOrigin: "https://txbet.example",
            schema,
            requireIdempotencyKey: true,
          },
        ),
      ).rejects.toThrow(/bearer/i);
    }
  });

  it("requires JSON and an exact same-origin Origin", async () => {
    for (const contentType of [null, "text/plain", "application/problem+json"]) {
      await expect(
        requireJsonMutation(request({ contentType }), {
          expectedOrigin: "https://txbet.example",
          schema,
          requireIdempotencyKey: true,
        }),
      ).rejects.toThrow(/JSON/i);
    }
    for (const origin of [
      null,
      "https://evil.example",
      "https://txbet.example.evil.test",
      "http://txbet.example",
      "null",
    ]) {
      await expect(
        requireJsonMutation(request({ origin }), {
          expectedOrigin: "https://txbet.example",
          schema,
          requireIdempotencyKey: true,
        }),
      ).rejects.toThrow(/origin/i);
    }
  });

  it("requires a bounded idempotency key and a strict Zod-valid body", async () => {
    for (const idempotencyKey of [null, "", "has spaces", "x".repeat(129)]) {
      await expect(
        requireJsonMutation(request({ idempotencyKey }), {
          expectedOrigin: "https://txbet.example",
          schema,
          requireIdempotencyKey: true,
        }),
      ).rejects.toThrow(/idempotency/i);
    }
    for (const body of ["not-json", "{}", JSON.stringify({ value: "safe", extra: true })]) {
      await expect(
        requireJsonMutation(request({ body }), {
          expectedOrigin: "https://txbet.example",
          schema,
          requireIdempotencyKey: true,
        }),
      ).rejects.toThrow(/body/i);
    }
  });

  it("checks ownership independently of navigation guards", () => {
    expect(() => assertResourceOwner("profile-1", "profile-1")).not.toThrow();
    expect(() => assertResourceOwner("profile-1", "profile-2")).toThrow(/ownership/i);
  });
});
