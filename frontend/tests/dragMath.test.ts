import { describe, expect, it } from "vitest";
import {
  BENCH_LEVEL,
  CARRY_HEIGHT,
  TARGET_STICKINESS,
  DROP_RADIUS,
  HIT_VOLUME_SCALE,
  MOUSE_MOVE_THRESHOLD_PX,
  TOUCH_HOLD_MS,
  hitVolume,
  inRect,
  intersectPlane,
  nearestWorldTarget,
  rectTarget,
  shouldStartDrag,
  tiltForVelocity,
} from "@/scene/drag/dragMath";

describe("drag thresholds", () => {
  it("uses 6 px for a mouse", () => {
    expect(MOUSE_MOVE_THRESHOLD_PX).toBe(6);
    expect(
      shouldStartDrag({
        pointerType: "mouse",
        heldMs: 0,
        from: { x: 0, y: 0 },
        to: { x: 6, y: 0 },
      }),
    ).toBe(false);
    expect(
      shouldStartDrag({
        pointerType: "mouse",
        heldMs: 0,
        from: { x: 0, y: 0 },
        to: { x: 6.5, y: 0 },
      }),
    ).toBe(true);
  });

  it("uses a 180 ms hold for touch, so a tap can still orbit", () => {
    expect(TOUCH_HOLD_MS).toBe(180);
    const base = {
      pointerType: "touch",
      from: { x: 0, y: 0 },
      to: { x: 40, y: 0 },
    };
    expect(shouldStartDrag({ ...base, heldMs: 179 })).toBe(false);
    expect(shouldStartDrag({ ...base, heldMs: 180 })).toBe(true);
  });
});

describe("intersectPlane", () => {
  it("puts the ray on the carry-height plane", () => {
    const point = intersectPlane(
      {
        origin: { x: 0, y: 5, z: 0 },
        direction: { x: 0, y: -1, z: 0 },
      },
      CARRY_HEIGHT,
    );
    expect(point).toEqual({ x: 0, z: 0 });
  });

  it("keeps the horizontal offset", () => {
    const point = intersectPlane(
      {
        origin: { x: 2, y: CARRY_HEIGHT + 2, z: -3 },
        direction: { x: 0, y: -2, z: 0 },
      },
      CARRY_HEIGHT,
    );
    expect(point).toEqual({ x: 2, z: -3 });
  });

  it("returns null for a ray parallel to or pointing away from the plane", () => {
    expect(
      intersectPlane(
        { origin: { x: 0, y: 5, z: 0 }, direction: { x: 1, y: 0, z: 0 } },
        CARRY_HEIGHT,
      ),
    ).toBeNull();
    expect(
      intersectPlane(
        { origin: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: -1, z: 0 } },
        CARRY_HEIGHT,
      ),
    ).toBeNull();
  });
});

describe("drop targets", () => {
  it("finds the nearest target inside its radius", () => {
    expect(
      nearestWorldTarget({ x: 0.5, z: 0 }, [
        { id: "vessel", x: 0, z: 0, radius: DROP_RADIUS },
      ]),
    ).toBe("vessel");
    expect(
      nearestWorldTarget({ x: 5, z: 0 }, [
        { id: "vessel", x: 0, z: 0, radius: DROP_RADIUS },
      ]),
    ).toBeNull();
  });

  it("prefers the closest of two targets", () => {
    expect(
      nearestWorldTarget({ x: 1.4, z: 0 }, [
        { id: "far", x: 3, z: 0, radius: 2 },
        { id: "near", x: 1.2, z: 0, radius: 2 },
      ]),
    ).toBe("near");
  });

  it("resolves a DOM rect", () => {
    const rect = { left: 10, top: 20, right: 110, bottom: 60 };
    expect(rectTarget({ x: 50, y: 40 }, [{ id: "tray", rect }])).toBe("tray");
    expect(rectTarget({ x: 5, y: 40 }, [{ id: "tray", rect }])).toBeNull();
    expect(inRect({ x: 50, y: 40 }, rect)).toBe(true);
  });
});

describe("drag presentation", () => {
  it("enlarges a hit volume by 30 percent", () => {
    expect(HIT_VOLUME_SCALE).toBe(1.3);
    expect(hitVolume(1)).toBeCloseTo(1.3);
  });

  it("caps the tilt at 8 degrees in either direction", () => {
    expect(tiltForVelocity(0)).toBe(0);
    expect(tiltForVelocity(1000)).toBeCloseTo((8 * Math.PI) / 180);
    expect(tiltForVelocity(-1000)).toBeCloseTo((-8 * Math.PI) / 180);
  });
});

/**
 * The drop point is resolved on the bench, not on the plane the carried object
 * is drawn at. A plane at carry height sits between the camera and the bench,
 * so a screen point that looks like it is over the vessel lands several units
 * in front of it � which once made every drop on the vessel miss.
 */
describe("parallax: the pointer resolves on the bench", () => {
  // A ray from a raised camera in front of the bench, aimed at the origin.
  const ray = {
    origin: { x: 0, y: 6, z: 12 },
    direction: { x: 0, y: -0.45, z: -1 },
  };

  it("lands on the vessel when intersected at bench level", () => {
    const point = intersectPlane(ray, BENCH_LEVEL);
    if (!point) throw new Error("the ray must meet the bench");
    expect(Math.hypot(point.x, point.z)).toBeLessThan(1.5);
  });

  it("lands well in front of the vessel at carry height", () => {
    const point = intersectPlane(ray, CARRY_HEIGHT);
    if (!point) throw new Error("the ray must meet the carry plane");
    // Several units short: this is the offset that broke the drop.
    expect(point.z).toBeGreaterThan(3);
  });

  it("defaults to the bench, so a caller cannot reintroduce the offset", () => {
    expect(intersectPlane(ray)).toEqual(intersectPlane(ray, BENCH_LEVEL));
  });
});

describe("target stickiness", () => {
  const targets = [
    { id: "vessel" as const, x: 0, z: 0, radius: 1 },
    { id: "tray" as const, x: 4, z: 0, radius: 1 },
  ];

  it("holds a target just outside its radius once acquired", () => {
    const justOutside = { x: 1.1, z: 0 };
    expect(nearestWorldTarget(justOutside, targets)).toBeNull();
    expect(nearestWorldTarget(justOutside, targets, "vessel")).toBe("vessel");
  });

  it("still lets go when the pointer leaves the sticky radius too", () => {
    const wellOutside = { x: 1 * TARGET_STICKINESS + 0.2, z: 0 };
    expect(nearestWorldTarget(wellOutside, targets, "vessel")).toBeNull();
  });

  it("does not let a sticky target steal one the pointer is inside", () => {
    // Deep inside the tray, just beyond the vessel's sticky edge.
    expect(nearestWorldTarget({ x: 4, z: 0 }, targets, "vessel")).toBe("tray");
  });

  it("prefers the target the pointer sits most deeply inside", () => {
    const overlapping = [
      { id: "a" as const, x: 0, z: 0, radius: 3 },
      { id: "b" as const, x: 1, z: 0, radius: 0.5 },
    ];
    expect(nearestWorldTarget({ x: 1, z: 0 }, overlapping)).toBe("b");
  });
});
