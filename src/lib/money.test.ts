import { describe, it, expect } from "vitest";
import {
  parseDollarsToCents,
  dollarsToCents,
  formatCents,
  assertCents,
} from "./money";

describe("parseDollarsToCents", () => {
  it.each([
    ["$44.00", 4400],
    ["44", 4400],
    ["44.5", 4450],
    ["$1,250.50", 125050],
    ["  $2,500  ", 250000],
    ["0", 0],
    ["-8.30", -830],
    ["-$8.3", -830],
  ])("parses %s -> %d cents", (input, expected) => {
    expect(parseDollarsToCents(input)).toBe(expected);
  });

  it.each(["", "abc", "$", "4.005", "1.2.3", "4,00", "$-4"])(
    "rejects malformed %s",
    (bad) => {
      expect(() => parseDollarsToCents(bad)).toThrow();
    },
  );
});

describe("dollarsToCents", () => {
  it("converts whole and half-cent-free numbers", () => {
    expect(dollarsToCents(44)).toBe(4400);
    expect(dollarsToCents(44.5)).toBe(4450);
  });
  it("rejects sub-cent precision", () => {
    expect(() => dollarsToCents(44.005)).toThrow();
  });
  it("rejects non-finite", () => {
    expect(() => dollarsToCents(Infinity)).toThrow();
    expect(() => dollarsToCents(NaN)).toThrow();
  });
});

describe("formatCents", () => {
  it.each([
    [4400, "$44.00"],
    [125050, "$1,250.50"],
    [0, "$0.00"],
    [5, "$0.05"],
    [-830, "-$8.30"],
    [100000000, "$1,000,000.00"],
  ])("formats %d -> %s", (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });
  it("rejects non-integer cents", () => {
    expect(() => formatCents(44.5)).toThrow();
  });
});

describe("assertCents", () => {
  it("passes integers through", () => {
    expect(assertCents(4400)).toBe(4400);
  });
  it("rejects floats and non-numbers", () => {
    expect(() => assertCents(4400.5)).toThrow();
    expect(() => assertCents("4400")).toThrow();
    expect(() => assertCents(null)).toThrow();
  });
});
