"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { validateFormulationLocally } from "@/lib/validation/formulation";
import {
  DEMO_FORMULATION,
  DEMO_INGREDIENTS,
} from "@/mocks/fixtures/ingredients";
import { useFormulationStore } from "@/stores/formulationStore";
import { useJobStore } from "@/stores/jobStore";
import { useSelectionStore } from "@/stores/selectionStore";

const VALIDATION_DEBOUNCE_MS = 250;

/**
 * Mounted once by the formulation layout. Loads the formulation into the store
 * and keeps the validated snapshot in sync with the draft (debounced).
 *
 * TODO(API): replace the demo fixture with GET /api/formulations/{id} and the
 * local validator with POST /api/formulations/{id}/validate.
 */
export function FormulationSession() {
  const { id } = useParams<{ id: string }>();
  const load = useFormulationStore((s) => s.loadFormulation);
  const draft = useFormulationStore((s) => s.draft);
  const revision = useFormulationStore((s) => s.draftRevision);
  const loadedId = useFormulationStore((s) => s.formulationId);

  useEffect(() => {
    if (id !== "demo" || loadedId === "demo") return;
    const ingredients = DEMO_INGREDIENTS.filter((i) =>
      DEMO_FORMULATION.lines.some((l) => l.ingredient_id === i.id),
    );
    load(DEMO_FORMULATION, ingredients);
    // Keep every demo ingredient available so it can be dragged into the scene.
    useFormulationStore.getState().registerCatalog(DEMO_INGREDIENTS);
    useSelectionStore.getState().clear();
    useJobStore.getState().reset();
  }, [id, load, loadedId]);

  useEffect(() => {
    if (!loadedId) return;
    const timer = setTimeout(
      () => {
        const result = validateFormulationLocally(draft);
        useFormulationStore.getState().applyValidation(revision, draft, result);
      },
      revision === 0 ? 0 : VALIDATION_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [draft, revision, loadedId]);

  return null;
}
