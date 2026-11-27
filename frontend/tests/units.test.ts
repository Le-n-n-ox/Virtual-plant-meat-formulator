import { describe, expect, it } from "vitest";
import {
  assertMoisturePercent,
  convertFromDryMatter,
  convertMass,
  convertMoistureBasis,
  convertToDryMatter,
  displayNutrient,
  displayNutrientValue,
  dryMatterFraction,
  formatMass,
  formatValue,
  isMassUnit,
  isValidMoisturePercent,
  moistureBasisLabel,
  nutrientKind,
  roundTo,
  toKilograms,
  type UnitPreferences,
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

const PREFS: UnitPreferences = {
  aminoAcidUnit: "mg",
  energyUnit: "kcal",
  proteinUnit: "g_per_100g",
};

describe("nutrientKind", () => {
  it("classifies protein, energy and amino acids", () => {
    expect(nutrientKind("protein")).toBe("protein");
    expect(nutrientKind("energy_kcal")).toBe("energy");
    expect(nutrientKind("energy_kj")).toBe("energy");
    expect(nutrientKind("fat")).toBe("other");
  });
});

describe("display units", () => {
  it("leaves values alone when the preference matches the stored unit", () => {
    expect(displayNutrient(12, "kcal", "energy", PREFS)).toEqual({
      value: 12,
      unit: "kcal",
    });
    expect(
      displayNutrient(55, "mg_per_g_protein", "amino_acid", PREFS),
    ).toEqual({ value: 55, unit: "mg_per_g_protein" });
    expect(displayNutrient(20, "g", "protein", PREFS)).toEqual({
      value: 20,
      unit: "g",
    });
  });

  it("converts energy between kcal and kJ", () => {
    expect(
      displayNutrient(100, "kcal", "energy", { ...PREFS, energyUnit: "kJ" }),
    ).toEqual({ value: 418.4, unit: "kJ" });
    expect(
      displayNutrient(418.4, "kJ", "energy", { ...PREFS, energyUnit: "kcal" }),
    ).toEqual({ value: 100, unit: "kcal" });
  });

  it("converts amino acids between mg and g", () => {
    expect(
      displayNutrient(55, "mg_per_g_protein", "amino_acid", {
        ...PREFS,
        aminoAcidUnit: "g",
      }),
    ).toEqual({ value: 0.055, unit: "g/g protein" });
    expect(displayNutrient(0.055, "g", "amino_acid", PREFS)).toEqual({
      value: 55,
      unit: "mg",
    });
    expect(displayNutrient(55000, "ug", "amino_acid", PREFS)).toEqual({
      value: 55,
      unit: "mg",
    });
  });

  it("labels protein as a percentage without changing the number", () => {
    expect(
      displayNutrient(20, "g", "protein", { ...PREFS, proteinUnit: "percent" }),
    ).toEqual({ value: 20, unit: "%" });
  });

  it("does not apply amino-acid or energy rules to other nutrients", () => {
    expect(
      displayNutrient(5, "mg", "other", { ...PREFS, aminoAcidUnit: "g" }),
    ).toEqual({ value: 5, unit: "mg" });
    expect(
      displayNutrient(5, "kcal", "other", { ...PREFS, energyUnit: "kJ" }),
    ).toEqual({ value: 5, unit: "kcal" });
  });

  it("keeps missing values missing rather than converting them", () => {
    expect(displayNutrientValue(null, "kcal", "energy", PREFS)).toBeNull();
    expect(
      displayNutrientValue(Number.NaN, "kcal", "energy", PREFS),
    ).toBeNull();
  });
});
