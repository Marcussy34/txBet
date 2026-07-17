import { describe, expect, it } from "vitest";

import {
  assertAtomicAtMost,
  assertFreshBlockHeight,
} from "@/execution/venues/dflow/bounds";

describe("DFlow offline fixture bounds", () => {
  it("accepts exact integer bounds and rejects excess or malformed amounts", () => {
    expect(assertAtomicAtMost("1000000", "1000000", "USDC outflow")).toBe(
      1_000_000n,
    );
    expect(() => assertAtomicAtMost("1000001", "1000000", "USDC outflow")).toThrow(
      /USDC outflow.*exceeds/i,
    );
    expect(() => assertAtomicAtMost("01", "1000000", "USDC outflow")).toThrow(
      /canonical/i,
    );
  });

  it("accepts the final valid block and rejects expired or unsafe heights", () => {
    expect(() => assertFreshBlockHeight(500, 500)).not.toThrow();
    expect(() => assertFreshBlockHeight(501, 500)).toThrow(/expired/i);
    expect(() => assertFreshBlockHeight(Number.MAX_SAFE_INTEGER + 1, 500)).toThrow(
      /safe nonnegative integer/i,
    );
  });
});
