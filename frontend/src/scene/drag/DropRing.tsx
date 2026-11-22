"use client";

import { Line } from "@react-three/drei";
import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { MathUtils, type MeshBasicMaterial } from "three";
import { useDragStore } from "@/stores/dragStore";
import type { SceneTheme } from "../theme/sceneTheme";
import { hitVolume } from "./dragMath";

/** Visible vessel radius; the hit volume is 30 percent larger. */
export const VESSEL_RADIUS = 0.62;

/**
 * The vessel as a drop target: a soft ring that appears while something is
 * carried, brightens when the carried object is over it, and an invisible hit
 * volume 30 percent larger than the visible model.
 */
export function DropRing({ theme }: { theme: SceneTheme }) {
  const material = useRef<MeshBasicMaterial>(null);
  const dragging = useDragStore(
    (s) => s.phase === "carry" || s.phase === "over-target",
  );
  const over = useDragStore((s) => s.target === "vessel");

  const points = useMemo(() => {
    const segments = 64;
    const radius = hitVolume(VESSEL_RADIUS);
    return Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return [Math.cos(a) * radius, 0.06, Math.sin(a) * radius] as [
        number,
        number,
        number,
      ];
    });
  }, []);

  useFrame((_, delta) => {
    const m = material.current;
    if (!m) return;
    const k = 1 - Math.exp(-delta * 10);
    m.opacity = MathUtils.lerp(
      m.opacity,
      dragging ? (over ? 0.85 : 0.35) : 0,
      k,
    );
  });

  return (
    <group>
      {/* Enlarged invisible hit volume; small targets are why DnD feels fiddly. */}
      <mesh visible={false} position={[0, 1, 0]}>
        <cylinderGeometry
          args={[hitVolume(VESSEL_RADIUS), hitVolume(VESSEL_RADIUS), 2.4, 24]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <Line
        points={points}
        color={over ? theme.accent : theme.line}
        lineWidth={over ? 3 : 1.5}
        transparent
        opacity={dragging ? 1 : 0}
      >
        <meshBasicMaterial
          ref={material}
          color={over ? theme.accent : theme.line}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </Line>
    </group>
  );
}
