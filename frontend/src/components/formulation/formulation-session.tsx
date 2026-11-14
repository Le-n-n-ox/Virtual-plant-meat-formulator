"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { getFormulation, validateFormulation } from "@/lib/api/formulations";
import { getIngredient } from "@/lib/api/ingredients";
import { errorMessage } from "@/lib/format";
import { stopJobStream } from "@/lib/jobs/job-runner";
import { validateFormulationLocally } from "@/lib/validation/formulation";
import { useFormulationStore } from "@/stores/formulationStore";
import { useJobStore } from "@/stores/jobStore";
import { useResultStore } from "@/stores/resultStore";
import { useSelectionStore } from "@/stores/selectionStore";

const VALIDATION_DEBOUNCE_MS = 300;

/**
 * Mounted once by the formulation layout. Loads the formulation and its
 * ingredient records from the API, and keeps the validated snapshot in sync
 * with the draft (debounced, via POST /validate).
 */
export function FormulationSession() {
  const { id } = useParams<{ id: string }>();
  const draft = useFormulationStore((s) => s.draft);
  const revision = useFormulationStore((s) => s.draftRevision);
  const loadedId = useFormulationStore((s) => s.formulationId);
  const reloadNonce = useFormulationStore((s) => s.reloadNonce);

  useEffect(() => {
    let active = true;
    const store = useFormulationStore.getState();
    stopJobStream();
    store.reset();
    store.setLoadState("loading");
    useSelectionStore.getState().clear();
    useJobStore.getState().reset();
    useResultStore.getState().clear();

    (async () => {
      try {
        const formulation = await getFormulation(id);
        const ingredients = await Promise.all(
          formulation.lines.map((l) => getIngredient(l.ingredient_id)),
        );
        if (active)
          useFormulationStore
            .getState()
            .loadFormulation(formulation, ingredients);
      } catch (error) {
        if (active)
          useFormulationStore
            .getState()
            .setLoadState("error", errorMessage(error));
      }
    })();

    return () => {
      active = false;
      stopJobStream();
    };
  }, [id, reloadNonce]);

  useEffect(() => {
    if (!loadedId) return;
    let active = true;
    const timer = setTimeout(
      async () => {
        const apply = (
          result: Parameters<
            ReturnType<typeof useFormulationStore.getState>["applyValidation"]
          >[2],
        ) => {
          if (active)
            useFormulationStore
              .getState()
              .applyValidation(revision, draft, result);
        };
        // Blank, negative or empty drafts cannot be sent; the local check only
        // reports structural problems, never scientific values.
        const local = validateFormulationLocally(draft);
        const unsendable =
          draft.length === 0 ||
          draft.some(
            (l) =>
              !Number.isFinite(l.percent) || l.percent < 0 || l.percent > 100,
          );
        if (unsendable) return apply(local);
        try {
          apply(await validateFormulation(loadedId, { lines: draft }));
        } catch (error) {
          apply({
            valid: false,
            total_percent: local.total_percent,
            issues: [
              {
                code: "validation_unavailable",
                message: `Validation unavailable: ${errorMessage(error)}`,
              },
            ],
          });
        }
      },
      revision === 0 ? 0 : VALIDATION_DEBOUNCE_MS,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [draft, revision, loadedId]);

  return null;
}
