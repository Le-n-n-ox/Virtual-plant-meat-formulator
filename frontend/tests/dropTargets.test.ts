import { beforeEach, describe, expect, it } from "vitest";
import {
  dropSocket,
  pantryCentre,
  sceneDropTargets,
} from "@/scene/drag/dropTargets";
import {
  benchSocket,
  resetBenchSockets,
  setBenchSockets,
} from "@/scene/objects/benchSockets";
import { nearestWorldTarget } from "@/scene/drag/dragMath";

beforeEach(() => {
  resetBenchSockets();
});

describe("bench sockets", () => {
  it("falls back to the authored position before the asset loads", () => {
    expect(benchSocket("Socket_Return")).toEqual([2, 0.3, -2.5]);
  });

  it("prefers the loaded asset's position once the bench registers it", () => {
    setBenchSockets({ Socket_Return: [9, 1, 9] });
    expect(benchSocket("Socket_Return")).toEqual([9, 1, 9]);
  });

  it("is [0, 0, 0] for a socket that does not exist", () => {
    expect(benchSocket("Socket_Nonsense")).toEqual([0, 0, 0]);
  });

  it("moves the drop point when the socket moves in Blender", () => {
    const before = sceneDropTargets({ kind: "bin" }).find(
      (t) => t.id === "tray",
    );
    setBenchSockets({ Socket_Return: [-7, 0.3, 4] });
    const after = sceneDropTargets({ kind: "bin" }).find(
      (t) => t.id === "tray",
    );
    expect(before?.x).not.toBe(after?.x);
    expect(after?.x).toBe(-7);
  });
});

describe("sceneDropTargets", () => {
  it("offers the vessel, tray and pantry for an ingredient", () => {
    const ids = sceneDropTargets({ kind: "ingredient" }).map((t) => t.id);
    expect(ids).toEqual(["vessel", "tray", "pantry"]);
  });

  it("offers only the two compare plinths for a candidate", () => {
    const targets = sceneDropTargets({ kind: "candidate" });
    expect(targets.map((t) => t.id)).toEqual(["compare", "compare"]);
    // Two distinct plinths, so a candidate can go to either side.
    expect(targets[0].z).not.toBe(targets[1].z);
  });

  it("enlarges every hit volume beyond the visible model", () => {
    for (const target of sceneDropTargets({ kind: "ingredient" })) {
      expect(target.radius).toBeGreaterThan(0.5);
    }
  });

  /**
   * The vessel was once given a radius of 0.62 against a model whose rim is
   * 1.5, so a crop could sit visibly inside the vessel and still refuse to
   * drop. These bounds come from `scripts/blender/build_assets.py`.
   */
  it("covers each model's real footprint", () => {
    const radius = (id: string) =>
      sceneDropTargets({ kind: "ingredient" }).find((t) => t.id === id)
        ?.radius ?? 0;
    // VesselRim is a torus of radius 1.5.
    expect(radius("vessel")).toBeGreaterThanOrEqual(1.5);
    // Return_Tray is 1.5 x 1.1, so half its width is 0.75.
    expect(radius("tray")).toBeGreaterThanOrEqual(0.75);
    // Pantry_Shelf is 2.6 x 3.4, so half its width is 1.3.
    expect(radius("pantry")).toBeGreaterThanOrEqual(1.3);
    // Plinth cylinders are radius 0.95.
    const compare = sceneDropTargets({ kind: "candidate" })[0];
    expect(compare.radius).toBeGreaterThanOrEqual(0.95);
  });

  it("accepts a drop anywhere on the vessel's visible rim", () => {
    const targets = sceneDropTargets({ kind: "ingredient" });
    for (const angle of [0, Math.PI / 3, Math.PI, (4 * Math.PI) / 3]) {
      const onRim = { x: Math.cos(angle) * 1.5, z: Math.sin(angle) * 1.5 };
      expect(nearestWorldTarget(onRim, targets)).toBe("vessel");
    }
  });

  it("keeps the targets far enough apart not to overlap", () => {
    const targets = sceneDropTargets({ kind: "ingredient" });
    for (const a of targets) {
      for (const b of targets) {
        if (a === b) continue;
        const gap = Math.hypot(a.x - b.x, a.z - b.z);
        expect(gap).toBeGreaterThan((a.radius ?? 0) + (b.radius ?? 0) - 0.5);
      }
    }
  });
});

describe("target resolution matches what the rings draw", () => {
  it("resolves a point on the vessel to the vessel", () => {
    const targets = sceneDropTargets({ kind: "ingredient" });
    expect(nearestWorldTarget({ x: 0, z: 0 }, targets)).toBe("vessel");
  });

  it("resolves a point on the tray socket to the tray", () => {
    const tray = benchSocket("Socket_Return");
    const targets = sceneDropTargets({ kind: "ingredient" });
    expect(nearestWorldTarget({ x: tray[0], z: tray[2] }, targets)).toBe(
      "tray",
    );
  });

  it("resolves a point over the pantry shelf to the pantry", () => {
    const centre = pantryCentre();
    const targets = sceneDropTargets({ kind: "ingredient" });
    expect(nearestWorldTarget({ x: centre[0], z: centre[2] }, targets)).toBe(
      "pantry",
    );
  });

  it("resolves empty bench to no target, so a drop there cancels", () => {
    const targets = sceneDropTargets({ kind: "ingredient" });
    expect(nearestWorldTarget({ x: 0, z: 6 }, targets)).toBeNull();
  });
});

describe("dropSocket", () => {
  it("drops into the vessel above the floor, at its rim", () => {
    const socket = dropSocket("vessel", "ingredient");
    expect(socket?.[1]).toBeGreaterThan(1);
  });

  it("returns the nearer of the two compare plinths", () => {
    const [a, b] = sceneDropTargets({ kind: "candidate" });
    const nearA = dropSocket("compare", "candidate", { x: a.x, z: a.z });
    const nearB = dropSocket("compare", "candidate", { x: b.x, z: b.z });
    expect(nearA).toEqual(a.socket);
    expect(nearB).toEqual(b.socket);
    expect(nearA).not.toEqual(nearB);
  });

  it("has no socket for a target the carried kind cannot use", () => {
    expect(dropSocket("vessel", "candidate")).toBeNull();
    expect(dropSocket("compare", "ingredient")).toBeNull();
  });
});

describe("pantryCentre", () => {
  it("sits at the middle of the eight slots", () => {
    const centre = pantryCentre();
    // The shelf is at the back left of the bench (guide §12.2).
    expect(centre[0]).toBeLessThan(-3);
    expect(centre[1]).toBeGreaterThan(0.5);
    expect(centre[2]).toBeCloseTo(0, 5);
  });
});
