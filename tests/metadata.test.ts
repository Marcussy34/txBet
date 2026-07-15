import { describe, expect, it } from "vitest";
import { resolveMetadataBase } from "../src/lib/metadata-base";

describe("metadata base", () => {
  it("prefers the explicit public site URL", () => {
    expect(resolveMetadataBase({ NEXT_PUBLIC_SITE_URL: "https://txbet.example" }).href).toBe("https://txbet.example/");
  });

  it("uses the Vercel production host automatically", () => {
    expect(resolveMetadataBase({ VERCEL_PROJECT_PRODUCTION_URL: "txbet.vercel.app" }).href).toBe("https://txbet.vercel.app/");
  });

  it("uses the Vercel preview host when needed", () => {
    expect(resolveMetadataBase({ VERCEL_URL: "txbet-git-main.vercel.app" }).href).toBe("https://txbet-git-main.vercel.app/");
  });

  it("falls back to localhost for clean local builds", () => {
    expect(resolveMetadataBase({}).href).toBe("http://localhost:3000/");
  });

  it("rejects non-http schemes", () => {
    expect(() => resolveMetadataBase({ NEXT_PUBLIC_SITE_URL: "javascript:alert(1)" })).toThrow("http or https");
  });
});
