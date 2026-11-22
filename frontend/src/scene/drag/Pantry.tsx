"use client";

import { GripIcon, UndoIcon } from "lucide-react";
import { useApiQuery } from "@/hooks/use-api-query";
import { listIngredients } from "@/lib/api/ingredients";
import { useShallow } from "zustand/react/shallow";
import { useFormulationStore } from "@/stores/formulationStore";
import { useDragStore } from "@/stores/dragStore";
import { startPointerDrag } from "./startPointerDrag";

/**
 * The temporary pantry (guide §12.13 stage 1): a strip of catalogue crops that
 * can be dragged onto the vessel, dragged back off, or clicked to pick up and
 * placed. It is also a drop target, so a bin dragged back here is removed.
 */
export function Pantry() {
  const { data } = useApiQuery(
    ["ingredients", { page_size: 10, exclude_animal_groups: true }],
    () => listIngredients({ page_size: 10, exclude_animal_groups: true }),
    true,
  );
  // `useShallow` keeps the selector's array identity stable; a fresh array every
  // call makes `useSyncExternalStore` loop and blow the update-depth limit.
  const draftIds = useFormulationStore(
    useShallow((s) => s.draft.map((l) => l.ingredient_id)),
  );
  const phase = useDragStore((s) => s.phase);
  const target = useDragStore((s) => s.target);

  const items = (data?.items ?? []).filter((i) => !draftIds.includes(i.id));
  const active = phase === "carry" || phase === "over-target";

  return (
    <div
      id="drag-target-pantry"
      aria-label="Pantry. Drag a crop onto the vessel to add it."
      className={
        "pointer-events-auto absolute top-2 left-2 z-10 max-h-[46%] w-40 overflow-auto rounded-lg border bg-popover/90 p-1.5 shadow-sm backdrop-blur transition-opacity " +
        (target === "pantry"
          ? "opacity-100 ring-2 ring-primary"
          : active
            ? "opacity-100 ring-2 ring-primary/60"
            : "opacity-90")
      }
    >
      <p className="mb-1 flex items-center gap-1 px-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        <GripIcon aria-hidden className="size-3" /> Pantry
      </p>
      {items.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">
          Every crop is in the formulation.
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onPointerDown={startPointerDrag({
                  kind: "ingredient",
                  id: item.id,
                  label: item.common_name,
                  source: "pantry",
                })}
                className="w-full truncate rounded-md border border-transparent px-1.5 py-1 text-left text-[11px] hover:border-primary/40 hover:bg-secondary focus-visible:border-primary focus-visible:outline-none"
              >
                {item.common_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The return tray: drop a bin here to remove it from the draft. */
export function ReturnTray() {
  const phase = useDragStore((s) => s.phase);
  const target = useDragStore((s) => s.target);
  const active = phase === "carry" || phase === "over-target";

  return (
    <div
      id="drag-target-tray"
      aria-label="Return tray. Drop a bin here to remove it."
      className={
        "pointer-events-auto absolute right-2 bottom-2 z-10 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] shadow-sm backdrop-blur transition-colors " +
        (target === "tray"
          ? "border-primary bg-primary/15 text-foreground"
          : "border-dashed border-muted-foreground/50 bg-popover/80 text-muted-foreground") +
        (active ? " " : " opacity-80")
      }
    >
      <UndoIcon aria-hidden className="size-3.5" />
      {target === "tray" ? "Release to remove" : "Return tray"}
    </div>
  );
}
