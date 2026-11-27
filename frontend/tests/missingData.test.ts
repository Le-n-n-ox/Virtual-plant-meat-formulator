import { describe, expect, it } from "vitest";
import { describeEvidence } from "@/components/results/texture-results";
import { describeMissing } from "@/components/results/nutrition-results";

/**
 * The guide's §9 rule: missing data is shown as missing, never as zero. Both
 * of these used to default an absent field to 0, which printed a measurement
 * and a count that no source reported. These assertions exist so that cannot
 * come back — a fabricated number on a results page is the worst class of bug
 * this app can have.
 */
describe("published-sample evidence", () => {
  it("prints a range only when both bounds were reported", () => {
    expect(
      describeEvidence({
        n_samples: 12,
        measured_min: 3.5,
        measured_max: 9,
        unit: "N",
      }),
    ).toBe(": measured 3.5 to 9 N across 12 samples");
  });

  it("never invents a zero range when the bounds are absent", () => {
    const text = describeEvidence({ n_samples: 12 });
    expect(text).not.toMatch(/\b0\b/);
    expect(text).not.toContain("measured 0");
    expect(text).toContain("no measured range reported");
    expect(text).toContain("12 samples");
  });

  it("treats a single missing bound as no range at all", () => {
    for (const partial of [
      { n_samples: 4, measured_min: 2 },
      { n_samples: 4, measured_max: 8 },
    ]) {
      expect(describeEvidence(partial)).toContain("no measured range reported");
    }
  });

  it("says nothing when there are no samples to describe", () => {
    expect(describeEvidence({})).toBe("");
    expect(describeEvidence({ measured_min: 1, measured_max: 2 })).toBe("");
  });

  it("omits the unit rather than printing an empty one", () => {
    expect(
      describeEvidence({ n_samples: 2, measured_min: 1, measured_max: 2 }),
    ).toBe(": measured 1 to 2 across 2 samples");
  });
});

describe("missing nutrient values", () => {
  it("does not claim zero ingredients when the list is absent", () => {
    const text = describeMissing(undefined);
    expect(text).not.toMatch(/\b0\b/);
    expect(text).toBe("not reported by the source data");
  });

  it("counts the ingredients the backend named", () => {
    expect(describeMissing(["a", "b"])).toBe(
      "2 ingredients have no reported value",
    );
    expect(describeMissing(["a"])).toBe("1 ingredient has no reported value");
  });

  it("does not print a zero count for an empty list either", () => {
    expect(describeMissing([])).not.toMatch(/\b0\b/);
  });
});
