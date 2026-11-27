import type { DragKind, DropTargetId } from "@/stores/dragStore";

/**
 * Screen-reader wording for a drag (guide §12.3). Every pick-up, move over a
 * target, drop, cancel and rejection is announced through the aria-live region,
 * in words rather than as a raw state dump.
 */
export function announcePickUp(label: string): string {
  return `${label} picked up. Move to a target and release to drop.`;
}

export function announceTarget(label: string, target: string): string {
  return `${label} over ${target}. Release to ${target === "tray" || target === "pantry" ? "remove" : "add"}.`;
}

export function announceMove(label: string): string {
  return `${label} carried. No target yet.`;
}

export function announceDrop(label: string, target: DropTargetId): string {
  switch (target) {
    case "vessel":
      return `${label} added to the formulation. Waiting for validation.`;
    case "tray":
    case "pantry":
      return `${label} removed from the formulation.`;
    case "compare":
      return `${label} added to the comparison.`;
    default:
      return `${label} dropped.`;
  }
}

export function announceCancel(label: string): string {
  return `${label} returned to where it came from. Nothing changed.`;
}

export function announceReject(label: string, reason: string): string {
  return `${label} was not dropped: ${reason}`;
}

export function announceRemoved(label: string): string {
  return `${label} removed from the formulation.`;
}

/** Targets a dragged thing can be dropped on. */
export const TARGET_LABEL: Record<DropTargetId, string> = {
  vessel: "the mixing vessel",
  tray: "the return tray",
  pantry: "the pantry",
  compare: "the comparison plinth",
};

/** What a kind of dragged thing is called in an announcement. */
export function kindLabel(kind: DragKind): string {
  return KIND_LABEL[kind];
}

const KIND_LABEL: Record<DragKind, string> = {
  ingredient: "ingredient",
  bin: "bin",
  candidate: "candidate",
};
