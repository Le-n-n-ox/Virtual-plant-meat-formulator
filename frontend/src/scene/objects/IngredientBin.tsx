"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { DoubleSide, type Group, type Mesh } from "three";
import type { SceneTheme } from "../theme/sceneTheme";

const BIN_HEIGHT = 1.2;
const FILL_MAX = 1.1;

export interface IngredientBinProps {
  id: string;
  /** Validated percentage. Drives the illustrative fill level only. */
  percent: number;
  color: string;
  position: [number, number, number];
  selected: boolean;
  invalid: boolean;
  theme: SceneTheme;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
}

export function IngredientBin({
  id,
  percent,
  color,
  position,
  selected,
  invalid,
  theme,
  reducedMotion,
  onSelect,
}: IngredientBinProps) {
  const group = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const [hovered, setHovered] = useState(false);
  const targetFill = Math.max(
    0.03,
    (FILL_MAX * Math.min(100, Math.max(0, percent))) / 100,
  );

  // Decorative easing only: entry pop-in, fill level and selection lift.
  useFrame((_, delta) => {
    const g = group.current;
    const f = fill.current;
    if (!g || !f) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 8);
    const scale = g.scale.x + (1 - g.scale.x) * k;
    g.scale.setScalar(scale);
    const lift = selected ? 0.18 : 0;
    g.position.y += (position[1] + lift - g.position.y) * k;
    f.scale.y += (targetFill - f.scale.y) * k;
    f.position.y = 0.05 + f.scale.y / 2;
  });

  const ringColor = invalid ? theme.failed : theme.accent;
  const showRing = selected || hovered || invalid;

  return (
    <group
      ref={group}
      position={position}
      scale={reducedMotion ? 1 : 0.001}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      {/* Container: translucent so the fill level reads from any angle. */}
      <mesh position={[0, BIN_HEIGHT / 2, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.55, 0.5, BIN_HEIGHT, 40, 1, true]} />
        <meshStandardMaterial
          color={theme.glass}
          transparent
          opacity={theme.dark ? 0.22 : 0.32}
          roughness={0.15}
          metalness={0.1}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh
        position={[0, BIN_HEIGHT, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <torusGeometry args={[0.55, 0.035, 10, 48]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.02, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[0.52, 0.52, 0.04, 40]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.5}
          roughness={0.4}
        />
      </mesh>
      {/* Contents: height follows the validated percentage (illustrative). */}
      <mesh
        ref={fill}
        castShadow
        scale={[1, reducedMotion ? targetFill : 0.03, 1]}
        position={[0, 0.05, 0]}
      >
        <cylinderGeometry args={[0.47, 0.47, 1, 40]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Selection / validation ring */}
      {showRing && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[0.66, invalid || selected ? 0.8 : 0.74, 48]} />
          <meshBasicMaterial color={ringColor} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}
