"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { MathUtils, type Mesh, type MeshBasicMaterial } from "three";
import { useDragStore } from "@/stores/dragStore";
import { useInvalidateWhile } from "../hooks/useInvalidateWhile";
import type { SceneTheme } from "../theme/sceneTheme";
import { sceneDropTargets, type SceneDropTarget } from "./dropTargets";

/**
 * Every drop target as a soft ring on the bench (guide §12.3, §12.6): the
 * rings fade in while something is carried, and the one under the carried
 * object brightens and lifts so the drop point is never in doubt.
 *
 * The rings are drawn from the same target table the drag layer resolves
 * against, so what the user sees and what accepts the drop cannot disagree.
 */
export function DropTargetRings({ theme }: { theme: SceneTheme }) {
  const kind = useDragStore((s) => s.kind);
  const dragging = useDragStore(
    (s) => s.phase === "carry" || s.phase === "over-target",
  );
  const target = useDragStore((s) => s.target);
  const world = useDragStore((s) => s.world);

  // The target list depends on what is being carried: a candidate may only go
  // on a compare plinth, an ingredient on the vessel, tray or pantry.
  const targets = useMemo(() => sceneDropTargets({ kind }), [kind]);
  useInvalidateWhile(dragging);

  return (
    <group>
      {targets.map((t, index) => (
        <TargetRing
          key={`${t.id}-${index}`}
          target={t}
          theme={theme}
          dragging={dragging}
          over={
            target === t.id &&
            (targets.filter((o) => o.id === t.id).length === 1 ||
              isNearest(t, targets, world))
          }
        />
      ))}
    </group>
  );
}

/** Which of several same-id targets (the compare plinths) the pointer is on. */
function isNearest(
  target: SceneDropTarget,
  targets: SceneDropTarget[],
  world: { x: number; z: number } | null,
): boolean {
  if (!world) return false;
  const same = targets.filter((t) => t.id === target.id);
  let best = same[0];
  let bestDistance = Infinity;
  for (const candidate of same) {
    const d = Math.hypot(world.x - candidate.x, world.z - candidate.z);
    if (d < bestDistance) {
      best = candidate;
      bestDistance = d;
    }
  }
  return best === target;
}

function TargetRing({
  target,
  theme,
  dragging,
  over,
}: {
  target: SceneDropTarget;
  theme: SceneTheme;
  dragging: boolean;
  over: boolean;
}) {
  const ring = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  const radius = target.radius ?? 0.9;

  useFrame((state, delta) => {
    const m = material.current;
    const r = ring.current;
    if (!m || !r) return;
    const k = 1 - Math.exp(-delta * 10);
    m.opacity = MathUtils.lerp(m.opacity, dragging ? (over ? 0.9 : 0.3) : 0, k);
    m.color.set(over ? theme.accent : theme.line);
    // A slow pulse on the active target, so it reads as live rather than lit.
    const pulse = over ? 1 + Math.sin(state.clock.elapsedTime * 5) * 0.03 : 1;
    r.scale.setScalar(MathUtils.lerp(r.scale.x, pulse, k));
  });

  return (
    <group position={[target.x, 0, target.z]}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.06, 0]}>
        <ringGeometry args={[radius * 0.82, radius, 56]} />
        <meshBasicMaterial
          ref={material}
          color={theme.line}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
