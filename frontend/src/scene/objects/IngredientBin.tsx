"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState } from "react";
import {
  Color,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import type { SceneTheme } from "../theme/sceneTheme";
import { SceneModel } from "./SceneModel";

const BIN_HEIGHT = 1.2;
const FILL_MAX = 1.06;

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

/**
 * A schematic ingredient hopper. The fill height is a decorative reading of the
 * validated percentage; it is never a measured quantity.
 */
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
  const top = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const ringMaterial = useRef<MeshBasicMaterial>(null);
  const halo = useRef<MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);

  const targetFill = Math.max(
    0.03,
    (FILL_MAX * Math.min(100, Math.max(0, percent))) / 100,
  );
  const topColor = useMemo(
    () => `#${new Color(color).offsetHSL(0, 0, 0.12).getHexString()}`,
    [color],
  );
  const ringColor = invalid ? theme.failed : theme.accent;
  const showRing = selected || hovered || invalid;

  // Decorative easing only: entry pop-in, fill level, hover/selection lift.
  useFrame((state, delta) => {
    const g = group.current;
    const f = fill.current;
    if (!g || !f) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 7);
    g.scale.setScalar(g.scale.x + (1 - g.scale.x) * k);
    const lift = selected ? 0.16 : hovered ? 0.06 : 0;
    g.position.y += (position[1] + lift - g.position.y) * k;
    f.scale.y += (targetFill - f.scale.y) * k;
    f.position.y = 0.06 + f.scale.y / 2;
    if (top.current) top.current.position.y = 0.065 + f.scale.y;

    const t = state.clock.elapsedTime;
    if (ring.current) {
      const pulse =
        selected && !reducedMotion ? 1 + Math.sin(t * 4) * 0.045 : 1;
      const base = invalid ? 1.14 : 1.06;
      ring.current.scale.setScalar(base * pulse);
    }
    if (ringMaterial.current) {
      const target = showRing ? 1 : 0;
      ringMaterial.current.opacity +=
        (target - ringMaterial.current.opacity) * k;
    }
    if (halo.current) {
      const target = selected ? 0.3 : 0;
      halo.current.opacity += (target - halo.current.opacity) * k;
    }
  });

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
      {/* Soft halo under a selected bin */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <circleGeometry args={[0.95, 48]} />
        <meshBasicMaterial
          ref={halo}
          color={theme.accent}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* Hopper shell: Blender-authored GLB, procedural geometry as fallback */}
      <SceneModel
        url="/scene/assets/ingredient-bin/ingredient-bin.glb"
        placeholder={<BinPlaceholder />}
        fallback={<BinShell theme={theme} />}
        tints={{ BinMetal: theme.metal, BinGlass: theme.glass }}
      />

      {/* Contents: height follows the validated percentage (illustrative) */}
      <mesh
        ref={fill}
        castShadow
        scale={[1, reducedMotion ? targetFill : 0.03, 1]}
        position={[0, 0.06, 0]}
      >
        <cylinderGeometry args={[0.48, 0.48, 1, 40]} />
        <meshStandardMaterial color={color} roughness={0.85} />
      </mesh>
      {/* Surface disc so the fill reads as a material, not a rod */}
      <mesh
        ref={top}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.065 + (reducedMotion ? targetFill : 0.03), 0]}
      >
        <circleGeometry args={[0.48, 40]} />
        <meshStandardMaterial color={topColor} roughness={0.7} />
      </mesh>

      {/* Selection / validation ring */}
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]}>
        <ringGeometry args={[0.68, invalid ? 0.82 : 0.78, 48]} />
        <meshBasicMaterial
          ref={ringMaterial}
          color={ringColor}
          transparent
          opacity={0}
          toneMapped={false}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

/** Procedural hopper matching the GLB; shown if the asset fails to load. */
function BinShell({ theme }: { theme: SceneTheme }) {
  return (
    <group>
      <mesh position={[0, 0.03, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.62, 0.66, 0.06, 48]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.6}
          roughness={0.32}
        />
      </mesh>
      <mesh position={[0, 0.07, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.62, 0.022, 10, 48]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0.08 + BIN_HEIGHT / 2, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.56, 0.5, BIN_HEIGHT, 48, 1, true]} />
        <meshStandardMaterial
          color={theme.glass}
          transparent
          opacity={theme.dark ? 0.2 : 0.3}
          roughness={0.12}
          metalness={0.1}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      {[0.35, 0.65, 0.95].map((y) => (
        <mesh
          key={y}
          position={[0, 0.08 + y, 0]}
          rotation={[Math.PI / 2, 0, 0]}
        >
          <torusGeometry args={[0.545, 0.006, 8, 48]} />
          <meshStandardMaterial
            color={theme.metal}
            metalness={0.4}
            roughness={0.4}
            transparent
            opacity={0.55}
          />
        </mesh>
      ))}
      <mesh
        position={[0, 0.08 + BIN_HEIGHT, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
      >
        <torusGeometry args={[0.56, 0.035, 12, 48]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.65}
          roughness={0.28}
        />
      </mesh>
    </group>
  );
}

/** Low-poly stand-in while the GLB downloads. */
function BinPlaceholder() {
  return (
    <group>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.62, 0.66, 0.06, 24]} />
        <meshStandardMaterial transparent opacity={0.25} />
      </mesh>
      <mesh position={[0, 0.08 + BIN_HEIGHT / 2, 0]} renderOrder={2}>
        <cylinderGeometry args={[0.56, 0.5, BIN_HEIGHT, 16, 1, true]} />
        <meshStandardMaterial
          transparent
          opacity={0.12}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
    </group>
  );
}
