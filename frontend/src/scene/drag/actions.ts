import type { DragState, DropTargetId } from "@/stores/dragStore";
import { useFormulationStore } from "@/stores/formulationStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { getIngredient } from "@/lib/api/ingredients";
import type { Ingredient } from "@/types";

/**
 * What a drop does (guide §12.3). A drag never saves and never starts a job; it
 * only edits the browser draft, exactly as the table does.
 */

export type DropResult =
  | { outcome: "added"; label: string }
  | { outcome: "removed"; label: string }
  | { outcome: "rejected"; reason: string }
  | { outcome: "none" };

/** Labels for a dragged thing, used in the status line and announcements. */
export function dragLabel(
  state: Pick<DragState, "kind" | "id">,
  catalog: Record<string, Ingredient>,
): string {
  return catalog[state.id]?.common_name ?? state.id;
}

/**
 * Applies the drop. `vessel` adds, `tray`/`pantry` removes, `compare` joins the
 * comparison pair. Anything the target cannot take is rejected with a reason.
 */
export async function applyDrop(drag: {
  kind: DragState["kind"];
  id: string;
  target: DropTargetId;
  label: string;
  catalog: Record<string, Ingredient>;
}): Promise<DropResult> {
  const formulation = useFormulationStore.getState();
  const selection = useSelectionStore.getState();
  const alreadyIn = formulation.draft.some((l) => l.ingredient_id === drag.id);

  switch (drag.target) {
    case "vessel": {
      if (drag.kind === "candidate") {
        return { outcome: "rejected", reason: "the vessel takes ingredients" };
      }
      if (alreadyIn) {
        return {
          outcome: "rejected",
          reason: `${drag.label} is already in the formulation`,
        };
      }
      const ingredient = drag.catalog[drag.id] ?? formulation.catalog[drag.id];
      if (!ingredient) {
        try {
          formulation.addIngredient(await getIngredient(drag.id), 0);
          return { outcome: "added", label: drag.label };
        } catch {
          return {
            outcome: "rejected",
            reason: `${drag.label} could not be loaded`,
          };
        }
      }
      formulation.addIngredient(ingredient, 0);
      return { outcome: "added", label: drag.label };
    }
    case "tray":
    case "pantry": {
      if (!alreadyIn) {
        return {
          outcome: "rejected",
          reason: `${drag.label} is not in the formulation`,
        };
      }
      formulation.removeIngredient(drag.id);
      return { outcome: "removed", label: drag.label };
    }
    case "compare": {
      if (drag.kind !== "candidate") {
        return {
          outcome: "rejected",
          reason: "only candidates can be compared",
        };
      }
      selection.toggleCompare(drag.id);
      return { outcome: "added", label: drag.label };
    }
    default:
      return { outcome: "none" };
  }
}

/** Click-to-place: the ingredient held by the pointer alternative, if any. */
export async function placeHeld(
  held: { kind: DragState["kind"]; id: string } | null,
  target: DropTargetId,
  catalog: Record<string, Ingredient>,
): Promise<DropResult> {
  if (!held) return { outcome: "none" };
  return applyDrop({
    ...held,
    target,
    label: dragLabel(held, catalog),
    catalog,
  });
}
