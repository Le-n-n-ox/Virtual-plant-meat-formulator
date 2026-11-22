"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group, MathUtils } from "three";
import { useDragStore } from "@/stores/dragStore";
import { useFormulationStore } from "@/stores/formulationStore";
import { cropColor, type SceneTheme } from "../theme/sceneTheme";
import { tiltForVelocity } from "./dragMath";

/** Lift above the carry plane while an object is carried. */
const CARRY_LIFT = 0.35;
const CARRY_SCALE = 1.05;

/**
 * The object under the pointer during a drag: raised, scaled, with a blob
 * shadow and a small tilt towards the direction of travel. Rendered only while
 * the pointer is inside the canvas; outside it the HTML chip represents the
 * drag instead.
 */
export function DragGhost({ theme }: { theme: SceneTheme }) {
  const group = useRef<Group>(null);
  const shadow = useRef<Group>(null);
  const previous = useRef<{ x: number; z: number } | null>(null);

  const phase = useDragStore((s) => s.phase);
  const world = useDragStore((s) => s.world);
  const inCanvas = useDragStore((s) => s.inCanvas);
  const kind = useDragStore((s) => s.kind);
  const id = useDragStore((s) => s.id);
  const target = useDragStore((s) => s.target);
  const validated = useFormulationStore((s) => s.validated);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const visible =
      inCanvas && world !== null
        ? phase === "carry" || phase === "over-target"
        : false;
    g.visible = visible;
    if (!visible || !world) return;

    const vx = previous.current
      ? (world.x - previous.current.x) / Math.max(delta, 1 / 240)
      : 0;
    previous.current = { x: world.x, z: world.z };

    const k = 1 - Math.exp(-delta * 12);
    g.position.x = MathUtils.lerp(g.position.x, world.x, k);
    g.position.z = MathUtils.lerp(g.position.z, world.z, k);
    g.position.y = MathUtils.lerp(g.position.y, CARRY_LIFT, k);
    g.rotation.z = MathUtils.lerp(g.rotation.z, -tiltForVelocity(vx), k);
    const scale = target ? CARRY_SCALE * 1.04 : CARRY_SCALE;
    g.scale.setScalar(MathUtils.lerp(g.scale.x, scale, k));
    if (shadow.current) {
      // The shadow stays on the floor and softens while the object is lifted.
      shadow.current.position.set(g.position.x, 0.02, g.position.z);
      shadow.current.scale.setScalar(
        MathUtils.lerp(shadow.current.scale.x, 0.8, k),
      );
    }
  });

  if (!inCanvas || !world) return null;

  const index = validated?.lines.findIndex((l) => l.ingredient_id === id) ?? -1;
  const color =
    kind === "candidate"
      ? theme.product
      : index >= 0
        ? cropColor(theme, index)
        : theme.accent;

  return (
    <>
      <group ref={shadow}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.7, 32]} />
          <meshBasicMaterial
            color={theme.line}
            transparent
            opacity={0.16}
            depthWrite={false}
          />
        </mesh>
      </group>
      <group ref={group} position={[world.x, CARRY_LIFT, world.z]}>
        {kind === "candidate" ? (
          <mesh castShadow>
            <boxGeometry args={[1.1, 0.7, 1.1]} />
            <meshStandardMaterial color={color} roughness={0.55} />
          </mesh>
        ) : (
          <mesh castShadow>
            <cylinderGeometry args={[0.5, 0.55, 1.1, 32]} />
            <meshStandardMaterial color={color} roughness={0.75} />
          </mesh>
        )}
      </group>
    </>
  );
}
