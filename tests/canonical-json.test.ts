import { describe, expect, it } from "vitest";

import { canonicalJson, sha256Canonical } from "@/core/canonical-json";

describe("canonical JSON", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalJson({ z: 1, a: { d: 4, b: 2 }, list: [3, 2, 1] })).toBe(
      '{"a":{"b":2,"d":4},"list":[3,2,1],"z":1}',
    );
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });

  it("produces deterministic SHA-256 hashes that are sensitive to semantic changes", () => {
    expect(sha256Canonical({ b: 2, a: 1 })).toBe(sha256Canonical({ a: 1, b: 2 }));
    expect(sha256Canonical({ a: 1 })).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256Canonical({ a: 1 })).not.toBe(sha256Canonical({ a: 2 }));
    expect(sha256Canonical([1, 2])).not.toBe(sha256Canonical([2, 1]));
  });

  it("rejects values with ambiguous or non-JSON representations", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const sparse = Array(2) as unknown[];
    sparse[1] = "present";

    for (const value of [
      { value: undefined },
      { value: Number.NaN },
      { value: Number.POSITIVE_INFINITY },
      { value: 1.5 },
      { value: Number.MAX_SAFE_INTEGER + 1 },
      { value: 1n },
      { value: () => true },
      { value: Symbol("value") },
      { value: -0 },
      new Date(0),
      cyclic,
      sparse,
    ]) {
      expect(() => canonicalJson(value as never)).toThrow();
    }
  });

  it("rejects symbol keys, accessors, and non-enumerable data", () => {
    const symbolKey = { [Symbol("key")]: "value" };
    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => 1,
    });
    const hidden = Object.defineProperty({}, "value", {
      enumerable: false,
      value: 1,
    });

    expect(() => canonicalJson(symbolKey as never)).toThrow(/symbol/i);
    expect(() => canonicalJson(accessor as never)).toThrow(/data propert/i);
    expect(() => canonicalJson(hidden as never)).toThrow(/enumerable/i);
  });
});
