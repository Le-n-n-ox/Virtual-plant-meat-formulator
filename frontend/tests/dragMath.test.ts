import { describe, expect, it } from "vitest";
import {
  CARRY_HEIGHT,
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
