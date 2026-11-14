import { beforeEach, describe, expect, it } from "vitest";
import { validateFormulationLocally } from "@/lib/validation/formulation";
import {
  DEMO_FORMULATION,
  DEMO_INGREDIENTS,
} from "@/mocks/fixtures/ingredients";
import { useFormulationStore } from "@/stores/formulationStore";

describe("validateFormulationLocally", () => {
  it("accepts a total of exactly 100%", () => {
    const r = validateFormulationLocally([
      { ingredient_id: "a", percent: 60.5 },
      { ingredient_id: "b", percent: 39.5 },
    ]);
    expect(r).toEqual({ valid: true, total_percent: 100, issues: [] });
  });

  it("flags a total that is not 100%", () => {
    const r = validateFormulationLocally([{ ingredient_id: "a", percent: 90 }]);
    expect(r.valid).toBe(false);
    expect(r.issues[0].code).toBe("total_not_100");
  });

  it("flags out-of-range and non-numeric percentages against the ingredient", () => {
    const r = validateFormulationLocally([
      { ingredient_id: "a", percent: Number.NaN },
      { ingredient_id: "b", percent: 120 },
    ]);
    expect(
      r.issues
        .filter((i) => i.code === "percent_out_of_range")
        .map((i) => i.ingredient_id),
    ).toEqual(["a", "b"]);
  });

  it("flags an empty formulation", () => {
    expect(validateFormulationLocally([]).issues[0].code).toBe("empty");
  });
});

describe("formulationStore", () => {
  beforeEach(() => {
    useFormulationStore
      .getState()
      .loadFormulation(DEMO_FORMULATION, DEMO_INGREDIENTS);
  });

  it("drops a validation result that is older than the current draft", () => {
    const s = useFormulationStore.getState();
    const staleRevision = s.draftRevision;
    const staleLines = s.draft;
    s.setPercent("demo-cowpea", 50);
    const applied = useFormulationStore
      .getState()
      .applyValidation(
        staleRevision,
        staleLines,
        validateFormulationLocally(staleLines),
      );
    expect(applied).toBe(false);
    expect(useFormulationStore.getState().validated).toBeNull();
  });

  it("applies a validation result for the current draft", () => {
    const s = useFormulationStore.getState();
    expect(
      s.applyValidation(
        s.draftRevision,
        s.draft,
        validateFormulationLocally(s.draft),
      ),
    ).toBe(true);
    expect(useFormulationStore.getState().validated?.result.valid).toBe(true);
  });

  it("does not add the same ingredient twice", () => {
    const cowpea = DEMO_INGREDIENTS[0];
    useFormulationStore.getState().addIngredient(cowpea);
    expect(
      useFormulationStore
        .getState()
        .draft.filter((l) => l.ingredient_id === cowpea.id),
    ).toHaveLength(1);
  });
});

describe("demo fixtures", () => {
  it("carry no nutrient values (they must never look like real data)", () => {
    for (const i of DEMO_INGREDIENTS) {
      expect(i.nutrients).toHaveLength(0);
      expect(i.amino_acids).toHaveLength(0);
      expect(i.source.name).toMatch(/not real data/i);
    }
  });
});
