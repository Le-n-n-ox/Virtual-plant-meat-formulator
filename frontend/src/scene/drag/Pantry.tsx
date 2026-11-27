"use client";

import { GripIcon, UndoIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useApiQuery } from "@/hooks/use-api-query";
import { listIngredients } from "@/lib/api/ingredients";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { useResolvedView } from "../hooks/useSceneEnvironment";
import { useFormulationStore } from "@/stores/formulationStore";
import { useDragStore } from "@/stores/dragStore";
import { usePlacementStore } from "@/stores/placementStore";
import { useSceneStore } from "@/stores/sceneStore";
import { startPointerDrag } from "./startPointerDrag";

/**
 * The pantry list beside the canvas: catalogue crops that can be dragged onto
 * the vessel, dragged back off, or clicked and then placed. It is also a drop
 * target, so a bin dragged back here is removed.
 *
 * In 3D the shelf in the scene (`PantryShelf`) is the crops' visible home, so
 * this list collapses to a button and acts as the pointer-and-keyboard path to
 * the same crops. In 2D there is no shelf, so it stays open and is the pantry.
 */
export function Pantry() {
  const { view } = useResolvedView();
  const is3D = view === "3d";
  const [open, setOpen] = useState(false);
  const expanded = open || !is3D;
  const { data } = useApiQuery(
    ["ingredients", { page_size: 10, exclude_animal_groups: true }],
    () => listIngredients({ page_size: 10, exclude_animal_groups: true }),
    true,
  );
  const setPantryItems = useSceneStore((s) => s.setPantryItems);
  const hold = usePlacementStore((s) => s.hold);
  // `useShallow` keeps the selector's array identity stable; a fresh array every
  // call makes `useSyncExternalStore` loop and blow the update-depth limit.
  const draftIds = useFormulationStore(
    useShallow((s) => s.draft.map((l) => l.ingredient_id)),
  );
  const phase = useDragStore((s) => s.phase);
  const target = useDragStore((s) => s.target);

  const items = (data?.items ?? []).filter((i) => !draftIds.includes(i.id));
  const active = phase === "carry" || phase === "over-target";

  // The 3D shelf mirrors the same crops, from this one request.
  const all = data?.items;
  useEffect(() => {
    if (all) setPantryItems(all);
  }, [all, setPantryItems]);

  return (
    <div
      id="drag-target-pantry"
      aria-label="Pantry. Drag a crop onto the vessel to add it."
      className={cn(
        "pointer-events-auto absolute top-2 left-2 z-10 max-h-[46%] overflow-auto rounded-lg border bg-popover/90 p-1.5 shadow-sm backdrop-blur transition-opacity",
        expanded ? "w-40" : "w-28",
        target === "pantry"
          ? "opacity-100 ring-2 ring-primary"
          : active
            ? "opacity-100 ring-2 ring-primary/60"
            : "opacity-90",
      )}
    >
      {is3D ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full items-center gap-1 rounded px-1 py-0.5 text-caption font-medium tracking-wide text-muted-foreground uppercase hover:bg-secondary focus-visible:outline-none"
        >
          <GripIcon aria-hidden className="size-3" /> Pantry
          <span className="ml-auto font-numeric normal-case">
            {items.length}
          </span>
        </button>
      ) : (
        <p className="mb-1 flex items-center gap-1 px-1 text-caption font-medium tracking-wide text-muted-foreground uppercase">
          <GripIcon aria-hidden className="size-3" /> Pantry
        </p>
      )}
      {!expanded ? null : items.length === 0 ? (
        <p className="px-1 py-2 text-caption text-muted-foreground">
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
                /**
                 * The no-drag equivalent (WCAG 2.2 criterion 2.5.7, guide
                 * §12.3): click or press Enter to pick the crop up, then place
                 * it from the placement bar or by clicking the vessel.
                 */
                onClick={() =>
                  hold({
                    kind: "ingredient",
                    id: item.id,
                    label: item.common_name,
                  })
                }
                aria-label={`${item.common_name}. Drag onto the vessel, or activate to pick it up and then place it.`}
                className="w-full truncate rounded-md border border-transparent px-1.5 py-1 text-left text-caption hover:border-primary/40 hover:bg-secondary focus-visible:border-primary focus-visible:outline-none"
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
        "pointer-events-auto absolute right-2 bottom-2 z-10 flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-caption shadow-sm backdrop-blur transition-colors " +
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
