"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type ReactNode, useCallback, useEffect } from "react";
import { Vector3 } from "three";

/**
 * Lightweight replacement for drei <Html>: labels are ordinary DOM nodes in the
 * main React tree (so they inherit theme tokens and need no extra React roots),
 * and <LabelProjector/> inside the Canvas moves them to their projected screen
 * position each frame by writing `style.transform` directly.
 */
type Vec3 = readonly [number, number, number];

const entries = new Map<string, { el: HTMLElement; position: Vec3 }>();
let requestFrame: (() => void) | null = null;

function register(id: string, el: HTMLElement, position: Vec3) {
  entries.set(id, { el, position });
  requestFrame?.();
}

function unregister(id: string, el: HTMLElement) {
  if (entries.get(id)?.el === el) entries.delete(id);
}

const v = new Vector3();

/** Mount once inside the <Canvas>. */
export function LabelProjector() {
  const invalidate = useThree((s) => s.invalidate);

  useEffect(() => {
    requestFrame = invalidate;
    return () => {
      if (requestFrame === invalidate) requestFrame = null;
    };
  }, [invalidate]);

  useFrame(({ camera, size }) => {
    entries.forEach(({ el, position }) => {
      v.set(position[0], position[1], position[2]).project(camera);
      const visible = v.z > -1 && v.z < 1;
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
      el.style.opacity = visible ? "1" : "0";
    });
  });

  return null;
}

/** A label anchored to a world position. Render inside <SceneLabelLayer/>. */
export function SceneLabel({
  id,
  position,
  children,
}: {
  id: string;
  position: Vec3;
  children: ReactNode;
}) {
  const [x, y, z] = position;
  const ref = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      register(id, el, [x, y, z]);
      return () => unregister(id, el);
    },
    [id, x, y, z],
  );
  return (
    <div
      ref={ref}
      className="absolute top-0 left-0 opacity-0 will-change-transform"
      aria-hidden
    >
      {children}
    </div>
  );
}

/** Overlay that sits exactly on top of the canvas. */
export function SceneLabelLayer({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {children}
    </div>
  );
}
