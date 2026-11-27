import type { DropTargetId } from "@/stores/dragStore";
import type { RectTarget } from "./dragMath";

/**
 * Drop targets that live in the DOM: the pantry strip, the return tray and — in
 * the 2D schematic — the vessel. The 3D vessel is resolved in world space by
 * `DragLayer` instead, because its SVG element does not exist in 3D.
 */
const DOM_TARGET_IDS: Record<DropTargetId, string> = {
  vessel: "drag-target-vessel",
  tray: "drag-target-tray",
  pantry: "drag-target-pantry",
  compare: "drag-target-compare",
};

/** Reads the live client rect of every drop target currently mounted. */
export function readDomTargets(): RectTarget<DropTargetId>[] {
  if (typeof document === "undefined") return [];
  const targets: RectTarget<DropTargetId>[] = [];
  for (const [id, elementId] of Object.entries(DOM_TARGET_IDS)) {
    const element = document.getElementById(elementId);
    if (!element) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    targets.push({
      id: id as DropTargetId,
      rect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
    });
  }
  return targets;
}
