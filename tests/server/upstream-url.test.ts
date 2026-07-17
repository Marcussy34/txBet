import { describe, expect, it, vi } from "vitest";

import {
  assertAllowedUpstream,
  fetchCredentialed,
} from "@/server/security/upstream-url";

const HTTPS_POLICY = {
  protocols: ["https:"] as const,
  hosts: ["api.example.com"],
};

describe("assertAllowedUpstream", () => {
  it("accepts only an exact configured host and protocol", () => {
    expect(
      assertAllowedUpstream("https://api.example.com/v1/books", HTTPS_POLICY).href,
    ).toBe("https://api.example.com/v1/books");

    expect(() =>
      assertAllowedUpstream("http://api.example.com/v1/books", HTTPS_POLICY),
    ).toThrow(/protocol/i);
    expect(() =>
      assertAllowedUpstream("https://evil.api.example.com/v1/books", HTTPS_POLICY),
    ).toThrow(/host/i);
    expect(() =>
      assertAllowedUpstream("https://api.example.com.evil.test/v1/books", HTTPS_POLICY),
    ).toThrow(/host/i);
  });

  it("supports an explicitly configured websocket upstream", () => {
    expect(
      assertAllowedUpstream("wss://stream.example.com/feed", {
        protocols: ["wss:"],
        hosts: ["stream.example.com"],
      }).href,
    ).toBe("wss://stream.example.com/feed");
  });

  it("rejects malformed URLs and URLs containing credentials", () => {
    expect(() => assertAllowedUpstream("not a URL", HTTPS_POLICY)).toThrow(
      /valid upstream URL/i,
    );
    expect(() =>
      assertAllowedUpstream("https://secret@example.com/path", {
        protocols: ["https:"],
        hosts: ["example.com"],
      }),
    ).toThrow(/credentials/i);
  });

  it("rejects plaintext transport even when a hostile caller policy allows it", () => {
    for (const protocol of ["http:", "ws:", "ftp:", "file:"]) {
      expect(() =>
        assertAllowedUpstream(`${protocol}//api.example.com/private`, {
          protocols: [protocol],
          hosts: ["api.example.com"],
        }),
      ).toThrow(/secure protocol/i);
    }
  });
});

describe("fetchCredentialed", () => {
  it("validates before attaching credentials and disables redirect following", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 204 }));

    await fetchCredentialed(
      "https://api.example.com/private",
      {
        headers: { authorization: "Bearer secret" },
        redirect: "follow",
      },
      HTTPS_POLICY,
      fakeFetch,
    );

    expect(fakeFetch).toHaveBeenCalledOnce();
    const [target, init] = fakeFetch.mock.calls[0];
    expect(target).toBeInstanceOf(URL);
    expect((target as URL).host).toBe("api.example.com");
    expect(init?.redirect).toBe("error");
  });

  it("does not call fetch for a disallowed target", async () => {
    const fakeFetch = vi.fn<typeof fetch>();

    await expect(
      fetchCredentialed(
        "https://evil.example/private",
        { headers: { authorization: "Bearer secret" } },
        HTTPS_POLICY,
        fakeFetch,
      ),
    ).rejects.toThrow(/host/i);
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("allows only HTTPS at the credential-bearing fetch boundary", async () => {
    const fakeFetch = vi.fn<typeof fetch>();

    await expect(
      fetchCredentialed(
        "wss://api.example.com/private",
        { headers: { authorization: "Bearer secret" } },
        { protocols: ["wss:"], hosts: ["api.example.com"] },
        fakeFetch,
      ),
    ).rejects.toThrow(/HTTPS/i);
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
