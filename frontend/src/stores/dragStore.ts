import { create } from "zustand";
import {
  announceCancel,
  announceDrop,
  announceReject,
} from "../scene/drag/announce";

/**
 * The one drag-and-drop store (guide §12.3). The HTML picker, the 3D canvas and
 * the 2D schematic all read and write this, so a drag can start in HTML and end
 * in the scene, and a user in 2D can do everything a user in 3D can.
 *
 * A drag only edits the browser draft through `formulationStore`; it never
 * saves, never starts a job and never bypasses validation.
 */

export type DragKind = "ingredient" | "bin" | "candidate";

/**
 * hover   pointer over a draggable
 * grab    pointer down, thresholds not yet met
 * carry   thresholds met, following the pointer
 * over    carry + a valid target under the pointer
 * drop    released over a target (the action has been applied)
 * cancel  released elsewhere, or Escape — nothing changed
 * reject  dropped on a target that cannot take it
 */
export type DragPhase =
  "hover" | "grab" | "carry" | "over-target" | "drop" | "cancel" | "reject";

/** Where the drag started. `picker` and `pantry` begin in HTML. */
export type DragSource = "pantry" | "picker" | "scene" | "list" | "view2d";

export type DropTargetId = "vessel" | "tray" | "pantry" | "compare";

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * What the scene needs to animate an object after the drag state is gone: the
 * outcome, where the object was released and where it must return to (guide
 * §12.5). Cleared when the animation has run.
 */
export interface DragRelease {
  outcome: "drop" | "cancel" | "reject";
  /** World position at the moment of release. */
  from: Vec3;
  /** Where the object settles: the target socket, or where it came from. */
  to: Vec3;
  kind: DragKind;
  id: string;
  /** `performance.now()` at release, so the scene can measure its own time. */
  startedAt: number;
}

export interface DragState {
  kind: DragKind;
  id: string;
  source: DragSource;
  phase: DragPhase;
  /** Current target, or null when the pointer is over nothing usable. */
  target: DropTargetId | null;
  /** Where the drag began, in client pixels. */
  origin: Vec2;
  /** Current pointer, in client pixels. */
  pointer: Vec2;
  /** Pointer projected onto the carry plane, in world units (3D only). */
  world: { x: number; z: number } | null;
  /** True once the pointer is over the canvas, where the HTML chip hides. */
  inCanvas: boolean;
  pointerId: number | null;
  /** Human-readable refusal, shown in the status line. */
  rejection: string | null;
  /** Last screen-reader announcement. */
  announcement: string;
  /** Name of the dragged thing, for announcements. */
  label: string;
  /** When the pointer went down, for the touch hold threshold. */
  grabbedAt: number;
  /** True while a drag is past the grab threshold. */
  active: boolean;
  /** Where the object started, in world units, for the return arc. */
  originWorld: Vec3 | null;
  /**
   * Incremented on every `begin`. A delayed reset carries the sequence it was
   * scheduled for, so a release animation can never clear a drag the user has
   * already started since.
   */
  seq: number;
  /** The release animation the scene should play, or null. */
  release: DragRelease | null;

  begin: (input: {
    kind: DragKind;
    id: string;
    source: DragSource;
    origin: Vec2;
    pointerId: number | null;
    label: string;
    /** World position the object is lifted from, when it has one. */
    originWorld?: Vec3 | null;
  }) => void;
  /** Pointer moved (or the held-time threshold elapsed). */
  move: (pointer: Vec2) => void;
  /** Thresholds met: the object is carried and the camera is locked. */
  grab: (label: string) => void;
  setWorld: (world: { x: number; z: number } | null) => void;
  setInCanvas: (inCanvas: boolean) => void;
  setTarget: (target: DropTargetId | null, label: string) => void;
  /** Pointer released, or Escape. Applies nothing by itself. */
  finish: (
    phase: "drop" | "cancel" | "reject",
    label: string,
    reason?: string,
  ) => void;
  /** Records the release animation the scene should play. */
  setRelease: (release: DragRelease | null) => void;
  reset: () => void;
  /** Resets only if no new drag has begun since `seq` was read. */
  resetIfSeq: (seq: number) => void;
}

const IDLE = {
  kind: "ingredient" as DragKind,
  id: "",
  source: "scene" as DragSource,
  phase: "hover" as DragPhase,
  target: null as DropTargetId | null,
  origin: { x: 0, y: 0 },
  pointer: { x: 0, y: 0 },
  world: null as { x: number; z: number } | null,
  inCanvas: false,
  pointerId: null as number | null,
  rejection: null as string | null,
  announcement: "",
  label: "",
  grabbedAt: 0,
  active: false,
  originWorld: null as Vec3 | null,
  release: null as DragRelease | null,
};

export const useDragStore = create<DragState>((set, get) => ({
  ...IDLE,
  seq: 0,

  begin: ({ kind, id, source, origin, pointerId, label, originWorld }) =>
    set((state) => ({
      ...IDLE,
      seq: state.seq + 1,
      kind,
      id,
      source,
      label,
      origin,
      originWorld: originWorld ?? null,
      pointer: origin,
      pointerId,
      grabbedAt: Date.now(),
      phase: "grab",
      announcement: `${label} pressed. Move to pick it up.`,
    })),

  move: (pointer) => {
    const { phase } = get();
    if (phase !== "grab" && phase !== "carry" && phase !== "over-target")
      return;
    set({ pointer });
  },

  grab: (label) => {
    const { phase } = get();
    if (phase !== "grab") return;
    set({
      phase: "carry",
      active: true,
      announcement: `${label} picked up. Move to a target and release to drop.`,
    });
  },

  setWorld: (world) => set({ world }),

  setInCanvas: (inCanvas) => {
    if (get().inCanvas === inCanvas) return;
    set({ inCanvas });
  },

  setTarget: (target, label) => {
    const { target: current, phase } = get();
    if (target === current) return;
    if (!target) {
      if (phase === "over-target") set({ target: null, phase: "carry" });
      return;
    }
    set({
      target,
      phase: "over-target",
      announcement: `${label} over ${target}. Release to ${
        target === "tray" || target === "pantry" ? "remove" : "add"
      }.`,
    });
  },

  finish: (phase, label, reason) => {
    const { target } = get();
    const announcement =
      phase === "cancel"
        ? announceCancel(label)
        : phase === "reject"
          ? announceReject(label, reason ?? "that target cannot take it")
          : target
            ? announceDrop(label, target)
            : `${label} dropped.`;
    set({
      phase,
      active: false,
      announcement,
      rejection:
        phase === "reject" ? (reason ?? "that target cannot take it") : null,
    });
  },

  setRelease: (release) => set({ release }),

  reset: () => set({ ...IDLE }),

  resetIfSeq: (seq) => {
    if (get().seq !== seq) return;
    set({ ...IDLE });
  },
}));

/** True while a drag is past the grab threshold (camera lock, chip handoff). */
export function isDragging(state: DragState): boolean {
  return state.active;
}
