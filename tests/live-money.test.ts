import { describe, expect, it } from "vitest";

import {
  addAtomic,
  ceilRatioProductMicros,
  compareAtomic,
  compareShares,
  convertAtomicScale,
  equalAtomicAcrossScales,
  formatUsdMicros,
  microsFromBigInt,
  mulDivFloorMicros,
  parseAtomicAmount,
  parseUsdMicros,
  reduceShares,
  venueQuantity,
} from "@/core/live-money";

describe("exact live money", () => {
  it("parses and formats USD without floating-point arithmetic", () => {
    expect(parseUsdMicros("0")).toBe(0);
    expect(parseUsdMicros("0.000001")).toBe(1);
    expect(parseUsdMicros("0.100001")).toBe(100_001);
    expect(parseUsdMicros("12.34")).toBe(12_340_000);
    expect(parseUsdMicros("9007199254.740991")).toBe(Number.MAX_SAFE_INTEGER);

    expect(formatUsdMicros(0)).toBe("0.000000");
    expect(formatUsdMicros(100_001)).toBe("0.100001");
    expect(formatUsdMicros(12_340_000)).toBe("12.340000");
  });

  it("rejects signs, exponent notation, excess precision, and unsafe USD values", () => {
    for (const value of [
      "-1",
      "+1",
      "1e-3",
      "1.0000001",
      "01",
      ".1",
      "1.",
      "NaN",
      "9007199254.740992",
    ]) {
      expect(() => parseUsdMicros(value), value).toThrow();
    }

    expect(() => formatUsdMicros(-1)).toThrow(/nonnegative/i);
    expect(() => formatUsdMicros(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i);
  });

  it("normalizes arbitrary-size atomic integers and applies an explicit zero policy", () => {
    expect(parseAtomicAmount("00012")).toBe("12");
    expect(parseAtomicAmount("9".repeat(100))).toBe("9".repeat(100));
    expect(parseAtomicAmount("000", { allowZero: true })).toBe("0");
    expect(() => parseAtomicAmount("0")).toThrow(/positive/i);

    for (const value of ["", "-1", "+1", "1.0", "1e3", " 1"] ) {
      expect(() => parseAtomicAmount(value), value).toThrow(/digits|atomic/i);
    }
  });

  it("adds and compares atomics exactly", () => {
    expect(addAtomic("999999999999999999999", "1")).toBe("1000000000000000000000");
    expect(compareAtomic("1", "2")).toBe(-1);
    expect(compareAtomic("2", "2")).toBe(0);
    expect(compareAtomic("3", "2")).toBe(1);
    expect(() => addAtomic("01" as never, "1")).toThrow(/canonical/i);
  });

  it("reduces and compares positive rational shares by cross multiplication", () => {
    expect(reduceShares("100", "1000000")).toEqual({
      numerator: "1",
      denominator: "10000",
    });
    expect(compareShares(reduceShares("1", "2"), reduceShares("2", "4"))).toBe(0);
    expect(compareShares(reduceShares("1", "3"), reduceShares("1", "2"))).toBe(-1);
    expect(compareShares(reduceShares("7", "3"), reduceShares("2", "1"))).toBe(1);
    expect(() => reduceShares("0", "1")).toThrow(/positive/i);
    expect(() => reduceShares("1", "0")).toThrow(/denominator/i);
  });

  it("converts atomic quantities across scales only when conversion is exact", () => {
    expect(convertAtomicScale("125", 2, 4)).toBe("12500");
    expect(convertAtomicScale("12500", 4, 2)).toBe("125");
    expect(equalAtomicAcrossScales("125", 2, "12500", 4)).toBe(true);
    expect(equalAtomicAcrossScales("125", 2, "125", 4)).toBe(false);
    expect(() => convertAtomicScale("12501", 4, 2)).toThrow(/divisible|exact/i);
    expect(() => convertAtomicScale("1", -1, 2)).toThrow(/scale/i);
  });

  it("derives a deterministic venue-quantity conversion proof", () => {
    const quantity = venueQuantity("001250000", 6);

    expect(quantity).toMatchObject({
      atomic: "1250000",
      scale: 6,
      exactShares: { numerator: "5", denominator: "4" },
    });
    expect(quantity.conversionEvidenceHash).toMatch(/^[a-f0-9]{64}$/);
    expect(venueQuantity("1250000", 6)).toEqual(quantity);
  });

  it("ceil-multiplies exact rational microdollars by exact shares", () => {
    expect(
      ceilRatioProductMicros(
        { numerator: "333333", denominator: "1" },
        { numerator: "3", denominator: "2" },
      ),
    ).toBe(500_000);
    expect(
      ceilRatioProductMicros(
        { numerator: "0", denominator: "1" },
        { numerator: "3", denominator: "2" },
      ),
    ).toBe(0);
    expect(() =>
      ceilRatioProductMicros(
        { numerator: "1", denominator: "0" },
        { numerator: "1", denominator: "1" },
      ),
    ).toThrow(/denominator/i);
  });

  it("performs checked bigint floor multiplication for basis points", () => {
    expect(mulDivFloorMicros(1_000_001, 125, 10_000)).toBe(12_500);
    expect(mulDivFloorMicros(Number.MAX_SAFE_INTEGER, 1, 1)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => mulDivFloorMicros(Number.MAX_SAFE_INTEGER, 2, 1)).toThrow(/safe/i);
    expect(() => mulDivFloorMicros(1, 1.5, 10_000)).toThrow(/integer/i);
    expect(() => mulDivFloorMicros(1, 1, 0)).toThrow(/denominator/i);
    expect(() => mulDivFloorMicros(-1, 1, 1)).toThrow(/nonnegative/i);
  });

  it("converts bigint microdollars only after a safe-range proof", () => {
    expect(microsFromBigInt(100_000n)).toBe(100_000);
    expect(() => microsFromBigInt(-1n)).toThrow(/nonnegative/i);
    expect(() => microsFromBigInt(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(/safe/i);
  });
});
