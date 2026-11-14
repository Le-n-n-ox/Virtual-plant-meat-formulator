import { describe, expect, it } from "vitest";
import {
  assertMoisturePercent,
  convertFromDryMatter,
  convertMass,
  convertMoistureBasis,
  convertToDryMatter,
  dryMatterFraction,
  formatMass,
  formatValue,
  isMassUnit,
  isValidMoisturePercent,
  moistureBasisLabel,
  roundTo,
  toKilograms,
} from "@/lib/units";

describe("mass units", () => {
  it("converts between mass units", () => {
    expect(convertMass(1, "kg", "g")).toBe(1000);
    expect(convertMass(500, "g", "kg")).toBe(0.5);
    expect(convertMass(1500, "mg", "g")).toBe(1.5);
    expect(toKilograms(2500, "g")).toBe(2.5);
  });

  it("returns NaN for non-finite input", () => {
    expect(Number.isNaN(convertMass(Number.NaN, "g", "kg"))).toBe(true);
  });

  it("recognises mass units", () => {
    expect(isMassUnit("kg")).toBe(true);
    expect(isMassUnit("pound")).toBe(false);
  });

  it("rounds without hiding missing values", () => {
    expect(roundTo(1.23456, 2)).toBe(1.23);
    expect(formatValue(null, "g")).toBe("Not reported");
    expect(formatMass(2.5, "kg")).toBe("2.500 kg");
  });
});

describe("moisture basis", () => {
  it("derives the dry-matter fraction", () => {
    expect(dryMatterFraction(10)).toBeCloseTo(0.9);
    expect(dryMatterFraction(0)).toBe(1);
  });

  it("converts as-is to dry matter and back", () => {
    const dry = convertToDryMatter(100, 10);
    expect(dry).toBeCloseTo(90);
    expect(convertFromDryMatter(dry, 10)).toBeCloseTo(100);
  });

  it("converts between two moisture bases", () => {
    const value = convertMoistureBasis(100, 10, 20);
    expect(value).toBeCloseTo(112.5);
    expect(convertMoistureBasis(value, 20, 10)).toBeCloseTo(100);
  });

  it("rejects invalid moisture percentages", () => {
    expect(isValidMoisturePercent(50)).toBe(true);
    expect(isValidMoisturePercent(120)).toBe(false);
    expect(() => assertMoisturePercent(-1)).toThrow(RangeError);
    expect(() => convertFromDryMatter(10, 100)).toThrow(RangeError);
  });

  it("labels the supported bases", () => {
    expect(moistureBasisLabel("as-is")).toBe("As-is");
    expect(moistureBasisLabel("dry-matter")).toBe("Dry matter");
    expect(moistureBasisLabel("custom")).toBe("custom");
  });
});
