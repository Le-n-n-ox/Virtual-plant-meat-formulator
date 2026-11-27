import { beforeEach, describe, expect, it } from "vitest";
import { useFormulationStore } from "@/stores/formulationStore";
import { stepPercent } from "@/scene/drag/percentDrag";
import type { Formulation, Ingredient } from "@/types";

/**
 * "A percentage can be set from the bench and matches the table and the totals
 * bar" (guide §12.13 stage 2). The table inputs and the totals bar both read
 * `draft`; the scene's solid fill reads `validated`. These tests pin that
 * contract so the three cannot drift apart.
 */

const ingredient: Ingredient = {
  id: "ing_a",
  common_name: "Cowpea flour",
  scientific_name: null,
  form: "flour",
  moisture_basis: "as_is",
  nutrients: [],
  amino_acids: [],
  source: { name: "KFCT 2018", license_status: "research" },
};

const formulation: Formulation = {
  id: "frm_1",
  name: "Test",
  version: 1,
  lines: [{ ingredient_id: "ing_a", percent: 20 }],
  updated_at: "2026-11-22T00:00:00Z",
};

function totals(lines: { percent: number }[]): number {
  return lines.reduce(
    (sum, l) => sum + (Number.isFinite(l.percent) ? l.percent : 0),
    0,
  );
}

beforeEach(() => {
  useFormulationStore.getState().reset();
  useFormulationStore.getState().loadFormulation(formulation, [ingredient]);
});

describe("percentage agreement", () => {
  it("setPercent updates the draft the table and totals bar read", () => {
    const store = useFormulationStore.getState();
    store.setPercent("ing_a", stepPercent(20, 1));
    const after = useFormulationStore.getState();
    expect(after.draft[0].percent).toBe(20.5);
    expect(totals(after.draft)).toBe(20.5);
    expect(after.draftRevision).toBe(1);
  });

  it("leaves the validated snapshot untouched until validation returns", () => {
    const store = useFormulationStore.getState();
    store.applyValidation(0, [{ ingredient_id: "ing_a", percent: 20 }], {
      valid: true,
      total_percent: 20,
      issues: [],
    });
    useFormulationStore.getState().setPercent("ing_a", 21);

    const after = useFormulationStore.getState();
    // The scene's solid fill still shows the validated 20…
    expect(after.validated?.lines[0].percent).toBe(20);
    // …while the draft (table, totals bar, ghost fill) shows 21.
    expect(after.draft[0].percent).toBe(21);
    expect(totals(after.draft)).toBe(21);
  });

  it("a fresh validation snapshot moves the solid fill to the new value", () => {
    useFormulationStore.getState().setPercent("ing_a", 21);
    const revision = useFormulationStore.getState().draftRevision;
    const applied = useFormulationStore
      .getState()
      .applyValidation(revision, [{ ingredient_id: "ing_a", percent: 21 }], {
        valid: true,
        total_percent: 21,
        issues: [],
      });
    expect(applied).toBe(true);
    expect(useFormulationStore.getState().validated?.lines[0].percent).toBe(21);
  });

  it("ignores a stale validation response", () => {
    const store = useFormulationStore.getState();
    store.setPercent("ing_a", 21);
    const stale = store.applyValidation(
      0,
      [{ ingredient_id: "ing_a", percent: 20 }],
      {
        valid: true,
        total_percent: 20,
        issues: [],
      },
    );
    expect(stale).toBe(false);
    expect(useFormulationStore.getState().validated).toBeNull();
  });

  it("agrees across several bins", () => {
    const store = useFormulationStore.getState();
    store.addIngredient({ ...ingredient, id: "ing_b", common_name: "Maize" });
    useFormulationStore.getState().setPercent("ing_a", 40);
    useFormulationStore.getState().setPercent("ing_b", 60);
    const after = useFormulationStore.getState();
    expect(totals(after.draft)).toBe(100);
  });
});
