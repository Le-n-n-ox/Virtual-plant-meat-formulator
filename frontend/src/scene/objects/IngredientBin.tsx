"use client";

import { Line } from "@react-three/drei";
import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  Color,
  DoubleSide,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { useFormulationStore } from "@/stores/formulationStore";
import { hitVolume } from "../drag/dragMath";
import { usePercentDrag } from "../drag/usePercentDrag";
import { useInvalidateWhile } from "../hooks/useInvalidateWhile";
import type { SceneTheme } from "../theme/sceneTheme";
import { SceneModel } from "./SceneModel";

const BIN_HEIGHT = 1.2;
const FILL_MAX = 1.06;
/** Visible hopper radius; the hit volume is 30 percent larger. */
const BIN_RADIUS = 0.66;

export interface IngredientBinProps {
  id: string;
  /** Validated percentage. Drives the illustrative fill level only. */
  percent: number;
  color: string;
  position: [number, number, number];
  selected: boolean;
  invalid: boolean;
  /** Awaits its first validation snapshot: translucent with a dashed outline. */
  pending: boolean;
  /** The draft percentage while it differs from the validated one. */
  draftPercent?: number | null;
  theme: SceneTheme;
  reducedMotion: boolean;
  onSelect: (id: string) => void;
  /** Pressing the bin starts a drag; the pointer layer takes over. */
  onBeginDrag: (event: ThreeEvent<PointerEvent>) => void;
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
  pending,
  draftPercent,
  theme,
  reducedMotion,
  onSelect,
  onBeginDrag,
}: IngredientBinProps) {
  const group = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const top = useRef<Mesh>(null);
  const handle = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const ringMaterial = useRef<MeshBasicMaterial>(null);
  const halo = useRef<MeshBasicMaterial>(null);
  const [hovered, setHovered] = useState(false);

  const targetFill = Math.max(
    0.03,
    (FILL_MAX * Math.min(100, Math.max(0, percent))) / 100,
  );
  /**
   * The solid fill is only ever drawn from the validated percentage. A draft
   * value that has not been validated yet shows as a ghost disc instead.
   */
  const draftFill =
    draftPercent === null || draftPercent === undefined
      ? null
      : (FILL_MAX * Math.min(100, Math.max(0, draftPercent))) / 100;
  const showGhost =
    draftFill !== null && Math.abs(draftFill - targetFill) > 0.001;

  const getPercent = useCallback(
    () =>
      useFormulationStore.getState().draft.find((l) => l.ingredient_id === id)
        ?.percent ?? percent,
    [id, percent],
  );
  const beginPercentDrag = usePercentDrag(id, getPercent);

  /**
   * On-demand rendering: the entry pop-in and the fill easing ask for frames
   * until they settle, then the canvas can sleep.
   */
  const [animating, setAnimating] = useState(true);
  const animatingRef = useRef(true);
  useInvalidateWhile(animating);
  const topColor = useMemo(
    () => `#${new Color(color).offsetHSL(0, 0, 0.12).getHexString()}`,
    [color],
  );
  const ringColor = invalid ? theme.failed : theme.accent;
  const showRing = selected || hovered || invalid;

  /** Dashed outline circle for the pending state. */
  const pendingPoints = useMemo(() => {
    const segments = 48;
    return Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return [
        Math.cos(a) * (BIN_RADIUS + 0.16),
        0.07,
        Math.sin(a) * (BIN_RADIUS + 0.16),
      ] as [number, number, number];
    });
  }, []);

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
    if (handle.current) handle.current.position.y = 0.065 + f.scale.y;

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

    const settled =
      Math.abs(g.scale.x - 1) < 0.01 && Math.abs(f.scale.y - targetFill) < 0.01;
    if (settled !== animatingRef.current) {
      animatingRef.current = settled;
      setAnimating(settled);
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
      onPointerDown={onBeginDrag}
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
        theme={theme}
        placeholder={<BinPlaceholder />}
        fallback={<BinShell theme={theme} pending={pending} />}
        tints={{ BinMetal: theme.metal, BinGlass: theme.glass }}
      />

      {/* Enlarged invisible hit volume: draggable objects need a 44 px target. */}
      <mesh visible={false} position={[0, 0.7, 0]}>
        <cylinderGeometry
          args={[hitVolume(BIN_RADIUS), hitVolume(BIN_RADIUS), 1.5, 20]}
        />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>

      {pending && (
        <Line
          points={pendingPoints}
          color={theme.warning}
          dashed
          dashSize={0.16}
          gapSize={0.1}
          lineWidth={2}
          transparent
          opacity={0.95}
        />
      )}

      {/* Contents: height follows the validated percentage (illustrative) */}
      <mesh
        ref={fill}
        castShadow
        scale={[1, reducedMotion ? targetFill : 0.03, 1]}
        position={[0, 0.06, 0]}
      >
        <cylinderGeometry args={[0.48, 0.48, 1, 40]} />
        <meshStandardMaterial
          color={color}
          roughness={0.85}
          transparent={pending}
          opacity={pending ? 0.35 : 1}
        />
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

      {/* Ghost: the draft percentage, drawn until validation confirms it. */}
      {showGhost && draftFill !== null && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.07 + draftFill, 0]}
        >
          <circleGeometry args={[0.48, 40]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Fill handle: drag up or down for 0.5 steps, 0.1 with Shift. */}
      <group
        ref={handle}
        position={[0, 0.065 + (reducedMotion ? targetFill : 0.03), 0]}
      >
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.17, 0.035, 12, 32]} />
          <meshStandardMaterial
            color={theme.accent}
            metalness={0.5}
            roughness={0.35}
          />
        </mesh>
        <mesh visible={false} onPointerDown={beginPercentDrag}>
          <cylinderGeometry args={[0.36, 0.36, 0.3, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>

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
function BinShell({ theme, pending }: { theme: SceneTheme; pending: boolean }) {
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
          opacity={pending ? 0.12 : theme.dark ? 0.2 : 0.3}
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
