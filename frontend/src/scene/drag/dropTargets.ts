import type { DropTargetId } from "@/stores/dragStore";
import {
  BENCH_SOCKET,
  PANTRY_SOCKETS,
  benchSocket,
  type Vec3Tuple,
} from "../objects/benchSockets";
import { VESSEL_POSITION } from "../stations";
import { hitVolume, type WorldTarget } from "./dragMath";

/**
 * The drop targets that exist in the 3D scene (guide §12.2, §12.3).
 *
 * Each one is a socket on the bench plus a hit radius, and every radius is the
 * visible model's enlarged by 30 percent — small targets are the most common
 * reason drag and drop feels fiddly. The positions come from the bench asset's
 * sockets, so moving a socket in Blender moves the drop point with it.
 */

export interface SceneDropTarget extends WorldTarget<DropTargetId> {
  /** Socket the carried object snaps to while it is over this target. */
  socket: Vec3Tuple;
  /** Label shown while the object is over it. */
  hint: string;
}

/**
 * Visible radius of each target, before the hit-volume enlargement. These are
 * the models' real dimensions, taken from `scripts/blender/build_assets.py`:
 *
 * | Target  | Asset part            | Size                          |
 * | ------- | --------------------- | ----------------------------- |
 * | vessel  | `VesselRim`           | torus, radius 1.5             |
 * | tray    | `Return_Tray`         | cube 1.5 × 1.1, half-width .75|
 * | pantry  | `Pantry_Shelf`        | cube 2.6 × 3.4, half-width 1.3|
 * | compare | `Plinth_A` / `Plinth_B` | cylinder, radius 0.95       |
 *
 * Getting these wrong is what makes a drop feel broken: the vessel was once
 * treated as radius 0.62 against a model of 1.5, so a crop could sit visibly
 * inside the vessel and still refuse to drop.
 */
const RADIUS = {
  vessel: 1.5,
  tray: 0.75,
  pantry: 1.3,
  compare: 0.95,
} as const;

/** The vessel's drop socket sits at its rim, not on the floor. */
const VESSEL_DROP_HEIGHT = 1.62;

/**
 * Builds the live target list. Called on every pointer move while a drag is in
 * flight, so it reads the sockets fresh and needs no invalidation when the
 * bench finishes loading.
 */
export function sceneDropTargets(options: {
  /** Candidates may only be dropped on the compare plinths. */
  kind: "ingredient" | "bin" | "candidate";
}): SceneDropTarget[] {
  if (options.kind === "candidate") {
    const a = benchSocket(BENCH_SOCKET.compareA);
    const b = benchSocket(BENCH_SOCKET.compareB);
    return [
      {
        id: "compare",
        x: a[0],
        z: a[2],
        radius: hitVolume(RADIUS.compare),
        socket: a,
        hint: "Drop to compare",
      },
      {
        id: "compare",
        x: b[0],
        z: b[2],
        radius: hitVolume(RADIUS.compare),
        socket: b,
        hint: "Drop to compare",
      },
    ];
  }

  const tray = benchSocket(BENCH_SOCKET.return);
  const pantry = pantryCentre();
  return [
    {
      id: "vessel",
      x: VESSEL_POSITION[0],
      z: VESSEL_POSITION[2],
      radius: hitVolume(RADIUS.vessel),
      socket: [VESSEL_POSITION[0], VESSEL_DROP_HEIGHT, VESSEL_POSITION[2]],
      hint: "Drop to add",
    },
    {
      id: "tray",
      x: tray[0],
      z: tray[2],
      radius: hitVolume(RADIUS.tray),
      socket: tray,
      hint: "Drop to remove",
    },
    {
      id: "pantry",
      x: pantry[0],
      z: pantry[2],
      radius: hitVolume(RADIUS.pantry),
      socket: pantry,
      hint: "Drop to remove",
    },
  ];
}

/** Centre of the pantry shelf, averaged over its eight slots. */
export function pantryCentre(): Vec3Tuple {
  let x = 0;
  let y = 0;
  let z = 0;
  for (const name of PANTRY_SOCKETS) {
    const p = benchSocket(name);
    x += p[0];
    y += p[1];
    z += p[2];
  }
  const n = PANTRY_SOCKETS.length;
  return [x / n, y / n, z / n];
}

/** The socket a given target id snaps a carried object to. */
export function dropSocket(
  id: DropTargetId,
  kind: "ingredient" | "bin" | "candidate",
  near?: { x: number; z: number },
): Vec3Tuple | null {
  const matches = sceneDropTargets({ kind }).filter((t) => t.id === id);
  if (matches.length === 0) return null;
  if (!near || matches.length === 1) return matches[0].socket;
  // Two compare plinths share one id; snap to whichever is closer.
  let best = matches[0];
  let bestDistance = Infinity;
  for (const match of matches) {
    const d = Math.hypot(near.x - match.x, near.z - match.z);
    if (d < bestDistance) {
      best = match;
      bestDistance = d;
    }
  }
  return best.socket;
}
