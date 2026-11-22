"use client";

import { useDragStore } from "@/stores/dragStore";

/**
 * The HTML chip that represents a drag which started outside the canvas
 * (pantry, ingredient picker, object list). It follows the pointer until the
 * pointer enters the canvas, where `DragGhost` takes over and this hides.
 */
export function DragChip() {
  const phase = useDragStore((s) => s.phase);
  const pointer = useDragStore((s) => s.pointer);
  const inCanvas = useDragStore((s) => s.inCanvas);
  const label = useDragStore((s) => s.label);
  const kind = useDragStore((s) => s.kind);
  const rejection = useDragStore((s) => s.rejection);

  const visible =
    !inCanvas &&
    (phase === "grab" || phase === "carry" || phase === "over-target");

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
      style={{ left: pointer.x, top: pointer.y }}
    >
      <div
        className={
          "flex items-center gap-1.5 rounded-full border bg-popover/95 px-2.5 py-1 text-xs shadow-lg " +
          (rejection ? "border-destructive" : "border-primary/40")
        }
      >
        <span
          className="size-2 rounded-full"
          style={{
            background:
              kind === "candidate"
                ? "var(--scene-product)"
                : "var(--scene-accent)",
          }}
        />
        <span className="max-w-40 truncate font-medium">{label}</span>
      </div>
    </div>
  );
}

/**
 * The 2D equivalent of the 3D ghost: the same chip, shown while the pointer is
 * over the schematic so a drag in 2D is visible too.
 */
export function DragGhost2D() {
  const phase = useDragStore((s) => s.phase);
  const pointer = useDragStore((s) => s.pointer);
  const inCanvas = useDragStore((s) => s.inCanvas);
  const label = useDragStore((s) => s.label);
  const target = useDragStore((s) => s.target);

  if (!inCanvas || (phase !== "carry" && phase !== "over-target")) {
    return null;
  }

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-30 -translate-x-1/2 -translate-y-1/2"
      style={{ left: pointer.x, top: pointer.y }}
    >
      <div
        className={
          "flex items-center gap-1.5 rounded-full border bg-popover/95 px-2.5 py-1 text-xs shadow-lg " +
          (target ? "border-primary" : "border-primary/40")
        }
      >
        <span
          className="size-2 rounded-full"
          style={{ background: "var(--scene-accent)" }}
        />
        <span className="max-w-40 truncate font-medium">{label}</span>
      </div>
    </div>
  );
}
