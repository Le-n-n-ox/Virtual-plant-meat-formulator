import { beforeEach, describe, expect, it } from "vitest";
import { validateFormulationLocally } from "@/lib/validation/formulation";
import { useFormulationStore } from "@/stores/formulationStore";
import type { Formulation, Ingredient } from "@/types";

const ingredient = (id: string): Ingredient => ({
  id,
  scientific_name: null,
  common_name: id,
  form: "raw",
  moisture_basis: "as_is",
  nutrients: [],
  amino_acids: [],
  source: { name: "test source", license_status: "test" },
});
const INGREDIENTS = [ingredient("ing-a"), ingredient("ing-b")];
const FORMULATION: Formulation = {
  id: "frm-test",
  name: "Test blend",
  version: 1,
  lines: [
    { ingredient_id: "ing-a", percent: 60 },
    { ingredient_id: "ing-b", percent: 40 },
  ],
  updated_at: "2026-11-14T00:00:00Z",
};

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
    useFormulationStore.getState().loadFormulation(FORMULATION, INGREDIENTS);
  });

  it("drops a validation result that is older than the current draft", () => {
    const s = useFormulationStore.getState();
    const staleRevision = s.draftRevision;
    const staleLines = s.draft;
    s.setPercent("ing-a", 50);
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
    const cowpea = INGREDIENTS[0];
    useFormulationStore.getState().addIngredient(cowpea);
    expect(
      useFormulationStore
        .getState()
        .draft.filter((l) => l.ingredient_id === cowpea.id),
    ).toHaveLength(1);
  });
});

describe("formulationStore save tracking", () => {
  it("markSaved updates the version and saved lines but keeps the draft", () => {
    useFormulationStore.getState().loadFormulation(FORMULATION, INGREDIENTS);
    useFormulationStore.getState().setPercent("ing-a", 50);
    const draft = useFormulationStore.getState().draft;
    useFormulationStore
      .getState()
      .markSaved({ ...FORMULATION, version: 2, lines: draft });
    const s = useFormulationStore.getState();
    expect(s.version).toBe(2);
    expect(s.savedLines).toBe(draft);
    expect(s.draft).toBe(draft);
  });
});
