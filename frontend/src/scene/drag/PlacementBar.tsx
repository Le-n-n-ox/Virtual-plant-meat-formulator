"use client";

import { CircleDotIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { usePlacementStore } from "@/stores/placementStore";
import { useFormulationStore } from "@/stores/formulationStore";
import { useDragStore } from "@/stores/dragStore";
import { placeHeld } from "./actions";
import { announceRemoved } from "./announce";

/**
 * The click-to-place and keyboard equivalent of dragging. Shows what is held,
 * offers Place (and a vessel click) plus Cancel, and announces every pick-up,
 * placement and removal.
 */
export function PlacementBar() {
  const heldItem = usePlacementStore((s) => s.held);
  const release = usePlacementStore((s) => s.release);
  const [status, setStatus] = useState<string | null>(null);

  if (!heldItem) return null;
  const item = heldItem;

  async function place(target: "vessel" | "tray") {
    const catalog = useFormulationStore.getState().catalog;
    const result = await placeHeld(item, target, catalog);
    if (result.outcome === "added" || result.outcome === "removed") {
      setStatus(null);
      release();
      return;
    }
    setStatus(result.outcome === "rejected" ? result.reason : null);
    release();
  }

  function cancel() {
    release();
    useDragStore.getState().finish("cancel", item.label);
    useDragStore.getState().reset();
    setStatus(null);
  }

  function remove() {
    useFormulationStore.getState().removeIngredient(item.id);
    useDragStore.getState().finish("drop", item.label);
    useDragStore.getState().reset();
    setStatus(announceRemoved(item.label));
    release();
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto absolute bottom-2 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-full border bg-popover/95 px-3 py-1.5 text-xs shadow-lg backdrop-blur"
    >
      <CircleDotIcon aria-hidden className="size-3.5 text-primary" />
      <span className="max-w-48 truncate font-medium">{item.label} held</span>
      <button
        type="button"
        onClick={() => void place("vessel")}
        className="rounded-full bg-primary/15 px-2 py-0.5 hover:bg-primary/25 focus-visible:outline-none"
      >
        Place in vessel
      </button>
      {item.kind !== "candidate" && (
        <button
          type="button"
          onClick={remove}
          className="rounded-full px-2 py-0.5 hover:bg-secondary focus-visible:outline-none"
        >
          Remove
        </button>
      )}
      <button
        type="button"
        onClick={cancel}
        aria-label="Cancel placement"
        className="rounded-full p-0.5 hover:bg-secondary focus-visible:outline-none"
      >
        <XIcon aria-hidden className="size-3.5" />
      </button>
      {status && <span className="text-destructive">{status}</span>}
    </div>
  );
}
