"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { type InstancedMesh, Object3D } from "three";

const COUNT = 26;
const DURATION = 1.4;
const dummy = new Object3D();
const OFFSETS = Array.from({ length: COUNT }, (_, i) => (i / COUNT) * 0.45);

interface IngredientFlowProps {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  onDone: () => void;
}

/**
 * Schematic "ingredient poured in" cue, played once when a validated
 * formulation gains an ingredient. Purely decorative; skipped with reduced motion.
 */
export function IngredientFlow({
  from,
  to,
  color,
  onDone,
}: IngredientFlowProps) {
  const mesh = useRef<InstancedMesh>(null);
  const elapsed = useRef(0);
  const finished = useRef(false);

  useFrame((_, delta) => {
    const m = mesh.current;
    if (!m || finished.current) return;
    elapsed.current += delta;
    for (let i = 0; i < COUNT; i++) {
      const t = Math.min(
        1,
        Math.max(0, (elapsed.current / DURATION - OFFSETS[i]) / 0.55),
      );
      const x = from[0] + (to[0] - from[0]) * t;
      const z = from[2] + (to[2] - from[2]) * t;
      const y = 1.4 + Math.sin(Math.PI * t) * 1.3 - t * 0.4;
      const s = t <= 0 || t >= 1 ? 0 : 0.09;
      dummy.position.set(
        x + Math.sin(i * 12.9) * 0.08,
        y,
        z + Math.cos(i * 7.3) * 0.08,
      );
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    if (elapsed.current > DURATION * 1.1) {
      finished.current = true;
      onDone();
    }
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, COUNT]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 10, 10]} />
      <meshStandardMaterial color={color} roughness={0.8} />
    </instancedMesh>
  );
}
