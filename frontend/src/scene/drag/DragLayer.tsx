"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Plane, Raycaster, Vector2, Vector3 } from "three";
import { useDragStore } from "@/stores/dragStore";
import { VESSEL_POSITION } from "../stations";
import {
  cancelDrag,
  handleDragPointerMove,
  resolveDomTarget,
  settleDragDrop,
} from "./dragRuntime";
import { CARRY_HEIGHT, hitVolume, nearestWorldTarget } from "./dragMath";

/** Radius of the visible vessel, before the 30 percent hit-volume enlargement. */
const VESSEL_RADIUS = 0.62;

/**
 * The pointer drag layer for the 3D canvas (guide §12.3). Pointer Events, the
 * 6 px / 180 ms thresholds, pointer capture and the drop resolution are shared
 * with the 2D view through `dragRuntime`; this adds the ray/plane intersection
 * that puts the carried object under the pointer at carry height.
 */
export function DragLayer() {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const phase = useDragStore((s) => s.phase);

  useEffect(() => {
    if (phase !== "grab" && phase !== "carry" && phase !== "over-target") {
      return;
    }
    const element = gl.domElement;
    const raycaster = new Raycaster();
    const plane = new Plane(new Vector3(0, 1, 0), -CARRY_HEIGHT);
    const ndc = new Vector2();
    const hit = new Vector3();
    let capturedPointerId: number | null = null;

    const capture = (pointerId: number | null) => {
      if (pointerId === null || capturedPointerId === pointerId) return;
      try {
        element.setPointerCapture(pointerId);
        capturedPointerId = pointerId;
      } catch {
        /* the pointer may already be released */
      }
    };

    const release = () => {
      if (capturedPointerId === null) return;
      try {
        element.releasePointerCapture(capturedPointerId);
      } catch {
        /* already released */
      }
      capturedPointerId = null;
    };

    /** Projects the pointer onto the carry plane and resolves the target. */
    const track = () => {
      const state = useDragStore.getState();
      const rect = element.getBoundingClientRect();
      const pointer = { x: state.pointer.x, y: state.pointer.y };
      const overCanvas =
        rect.width > 0 &&
        pointer.x >= rect.left &&
        pointer.x <= rect.right &&
        pointer.y >= rect.top &&
        pointer.y <= rect.bottom;
      state.setInCanvas(overCanvas);

      if (overCanvas) {
        ndc.set(
          ((pointer.x - rect.left) / rect.width) * 2 - 1,
          -((pointer.y - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(ndc, camera);
        const world = raycaster.ray.intersectPlane(plane, hit);
        state.setWorld(world ? { x: hit.x, z: hit.z } : null);
      } else {
        state.setWorld(null);
      }

      const worldTarget = state.world
        ? nearestWorldTarget(state.world, [
            {
              id: "vessel",
              x: VESSEL_POSITION[0],
              z: VESSEL_POSITION[2],
              radius: hitVolume(VESSEL_RADIUS),
            },
          ])
        : null;
      // An explicit DOM target wins; otherwise 3D vessel proximity applies.
      state.setTarget(resolveDomTarget(pointer) ?? worldTarget, state.label);
    };

    const onMove = (event: PointerEvent) => {
      const state = useDragStore.getState();
      if (state.pointerId !== null && state.pointerId !== event.pointerId)
        return;
      handleDragPointerMove(event);
      capture(state.pointerId ?? event.pointerId);
      track();
    };

    const onUp = (event: PointerEvent) => {
      const state = useDragStore.getState();
      if (state.pointerId !== null && state.pointerId !== event.pointerId)
        return;
      release();
      void settleDragDrop();
    };

    const onCancel = () => {
      release();
      cancelDrag();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const state = useDragStore.getState();
      if (!state.active) return;
      event.preventDefault();
      onCancel();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKeyDown);
      release();
    };
  }, [phase, gl, camera]);

  return null;
}
