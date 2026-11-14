/**
 * Unit and moisture-basis helpers shared by the catalogue, editor and result
 * pages. All conversions are pure; missing values stay `null`/`NaN`, never 0.
 */

export type MassUnit = "mg" | "g" | "kg";

/** Grams per unit. */
export const MASS_TO_GRAMS: Record<MassUnit, number> = {
  mg: 0.001,
  g: 1,
  kg: 1000,
};

export function isMassUnit(value: string): value is MassUnit {
  return Object.prototype.hasOwnProperty.call(MASS_TO_GRAMS, value);
}

/** Convert a mass between units. Returns NaN for non-finite input. */
export function convertMass(
  value: number,
  from: MassUnit,
  to: MassUnit,
): number {
  if (!Number.isFinite(value)) return Number.NaN;
  return (value * MASS_TO_GRAMS[from]) / MASS_TO_GRAMS[to];
}

export function toGrams(value: number, from: MassUnit): number {
  return convertMass(value, from, "g");
}

export function toKilograms(value: number, from: MassUnit): number {
  return convertMass(value, from, "kg");
}

export function roundTo(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return Number.NaN;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** Render a measured value with its unit. Missing values stay explicit. */
export function formatValue(
  value: number | null,
  unit: string,
  decimals = 2,
): string {
  if (value === null || !Number.isFinite(value)) return "Not reported";
  return `${roundTo(value, decimals).toFixed(decimals)} ${unit}`;
}

/** Render a mass in the given unit. */
export function formatMass(value: number | null, unit: MassUnit): string {
  return formatValue(value, unit, 3);
}

// ---- Moisture basis ----

export function isValidMoisturePercent(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

/** Throws for moisture outside 0–100 so bad fixtures fail loudly. */
export function assertMoisturePercent(value: number): void {
  if (!isValidMoisturePercent(value)) {
    throw new RangeError(
      `Moisture percent must be between 0 and 100, received ${value}.`,
    );
  }
}

/** Fraction of dry matter in a sample at the given moisture percent. */
export function dryMatterFraction(moisturePercent: number): number {
  assertMoisturePercent(moisturePercent);
  return (100 - moisturePercent) / 100;
}

/** Convert an as-is value to a dry-matter basis. */
export function convertToDryMatter(
  value: number,
  moisturePercent: number,
): number {
  return value * dryMatterFraction(moisturePercent);
}

/** Convert a dry-matter value back to an as-is basis. */
export function convertFromDryMatter(
  value: number,
  moisturePercent: number,
): number {
  const fraction = dryMatterFraction(moisturePercent);
  if (fraction === 0) {
    throw new RangeError("Cannot convert from dry matter at 100% moisture.");
  }
  return value / fraction;
}

/** Convert a value between two moisture bases. */
export function convertMoistureBasis(
  value: number,
  fromMoisturePercent: number,
  toMoisturePercent: number,
): number {
  return convertFromDryMatter(
    convertToDryMatter(value, fromMoisturePercent),
    toMoisturePercent,
  );
}

/** Human label for a moisture-basis token used by the backend. */
export function moistureBasisLabel(basis: string): string {
  switch (basis.trim().toLowerCase()) {
    case "as-is":
    case "asis":
      return "As-is";
    case "dry":
    case "dry-matter":
    case "dm":
      return "Dry matter";
    default:
      return basis;
  }
}

/** True when a nutrient value can be converted between bases. */
export function isConvertibleValue(value: number | null): boolean {
  return value !== null && Number.isFinite(value);
}
