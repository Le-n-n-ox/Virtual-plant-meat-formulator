import { create } from "zustand";
import type {
  Formulation,
  FormulationLine,
  Ingredient,
  ValidationResult,
} from "@/types";

/**
 * Current formulation draft and its latest validation snapshot.
 *
 * `draft` is what the editor shows while typing. `validated` is the last set of
 * lines that went through validation together with the result; the 3D scene and
 * 2D fallback render *only* `validated`, so the scene never shows proportions
 * that have not been checked.
 */
export interface ValidatedSnapshot {
  lines: FormulationLine[];
  result: ValidationResult;
}

interface FormulationState {
  formulationId: string | null;
  name: string;
  version: number;
  description: string | null;
  /** Lines of the last saved version, used to detect unsaved edits. */
  savedLines: FormulationLine[];
  loadState: "idle" | "loading" | "ready" | "error";
  loadError: string | null;
  /** Ingredient records referenced by the draft, keyed by id. */
  catalog: Record<string, Ingredient>;
  draft: FormulationLine[];
  /** Increments on every draft edit; used to drop stale validation responses. */
  draftRevision: number;
  validated: ValidatedSnapshot | null;

  loadFormulation: (
    formulation: Formulation,
    ingredients: Ingredient[],
  ) => void;
  /** Merge ingredient records so they can be dragged without joining the draft. */
  registerCatalog: (ingredients: Ingredient[]) => void;
  setLoadState: (
    state: "idle" | "loading" | "ready" | "error",
    error?: string | null,
  ) => void;
  /** Records a successful save without touching the draft being edited. */
  markSaved: (formulation: Formulation) => void;
  reset: () => void;
  /** Bumped to make the session reload the formulation from the API. */
  reloadNonce: number;
  requestReload: () => void;
  addIngredient: (ingredient: Ingredient, percent?: number) => void;
  /** Add by id when the record is already known. Returns false if unknown. */
  addIngredientById: (ingredientId: string, percent?: number) => boolean;
  removeIngredient: (ingredientId: string) => void;
  setPercent: (ingredientId: string, percent: number) => void;
  /** Applies a validation result if it still matches the current draft revision. */
  applyValidation: (
    revision: number,
    lines: FormulationLine[],
    result: ValidationResult,
  ) => boolean;
}

const INITIAL = {
  formulationId: null,
  name: "",
  version: 0,
  description: null,
  savedLines: [] as FormulationLine[],
  loadState: "idle" as const,
  loadError: null,
  catalog: {} as Record<string, Ingredient>,
  draft: [] as FormulationLine[],
  draftRevision: 0,
  validated: null,
};

export const useFormulationStore = create<FormulationState>((set, get) => ({
  ...INITIAL,
  reloadNonce: 0,
  requestReload: () => set((s) => ({ reloadNonce: s.reloadNonce + 1 })),

  setLoadState: (loadState, loadError = null) => set({ loadState, loadError }),

  reset: () => set(INITIAL),

  markSaved: (formulation) =>
    set({
      version: formulation.version,
      name: formulation.name,
      description: formulation.description ?? null,
      savedLines: formulation.lines,
    }),

  loadFormulation: (formulation, ingredients) =>
    set({
      formulationId: formulation.id,
      name: formulation.name,
      version: formulation.version,
      description: formulation.description ?? null,
      savedLines: formulation.lines,
      loadState: "ready",
      loadError: null,
      catalog: Object.fromEntries(ingredients.map((i) => [i.id, i])),
      draft: formulation.lines,
      draftRevision: 0,
      validated: null,
    }),

  registerCatalog: (ingredients) =>
    set((s) => ({
      catalog: {
        ...s.catalog,
        ...Object.fromEntries(ingredients.map((i) => [i.id, i])),
      },
    })),

  addIngredient: (ingredient, percent = 0) => {
    if (get().draft.some((l) => l.ingredient_id === ingredient.id)) return;
    set((s) => ({
      catalog: { ...s.catalog, [ingredient.id]: ingredient },
      draft: [...s.draft, { ingredient_id: ingredient.id, percent }],
      draftRevision: s.draftRevision + 1,
    }));
  },

  addIngredientById: (ingredientId, percent = 0) => {
    const ingredient = get().catalog[ingredientId];
    if (!ingredient) return false;
    get().addIngredient(ingredient, percent);
    return true;
  },

  removeIngredient: (ingredientId) =>
    set((s) => ({
      draft: s.draft.filter((l) => l.ingredient_id !== ingredientId),
      draftRevision: s.draftRevision + 1,
    })),

  setPercent: (ingredientId, percent) =>
    set((s) => ({
      draft: s.draft.map((l) =>
        l.ingredient_id === ingredientId ? { ...l, percent } : l,
      ),
      draftRevision: s.draftRevision + 1,
    })),

  applyValidation: (revision, lines, result) => {
    if (revision !== get().draftRevision) return false;
    set({ validated: { lines, result } });
    return true;
  },
}));

/** Issue severity for an ingredient in the validated snapshot, if any. */
export function selectIngredientIssue(
  state: Pick<FormulationState, "validated">,
  ingredientId: string,
): "error" | null {
  const issue = state.validated?.result.issues.find(
    (i) => i.ingredient_id === ingredientId,
  );
  return issue ? "error" : null;
}
