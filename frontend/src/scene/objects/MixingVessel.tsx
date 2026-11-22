"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  Color,
  DoubleSide,
  type Group,
  type InstancedMesh,
  Object3D,
} from "three";
import type { SceneTheme } from "../theme/sceneTheme";
import { SceneModel } from "./SceneModel";

const BUBBLES = 18;
const dummy = new Object3D();

export interface MixingVesselProps {
  /** Crop colours with validated weights; produces an illustrative blend colour. */
  contents: { color: string; weight: number }[];
  /** True when a worker event reports the mixing stage (or any stage) running. */
  working: boolean;
  highlight: string | null;
  theme: SceneTheme;
  reducedMotion: boolean;
}

/**
 * Schematic mixing vessel. The blend colour and level come from validated
 * formulation weights; the paddle and bubbles are decorative motion cues only.
 */
export function MixingVessel({
  contents,
  working,
  highlight,
  theme,
  reducedMotion,
}: MixingVesselProps) {
  const paddle = useRef<Group>(null);
  const bubbles = useRef<InstancedMesh>(null);

  const total = contents.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
  const level = total > 0 ? Math.min(1, Math.max(0.08, total / 100)) : 0;
  const fillHeight = 0.22 + level * 0.86;

  const blend = useMemo(() => {
    if (total <= 0) return null;
    const out = new Color(0, 0, 0);
    const tmp = new Color();
    for (const c of contents) {
      tmp.set(c.color).multiplyScalar(Math.max(0, c.weight) / total);
      out.add(tmp);
    }
    // Lift the blend a little so the material reads inside tinted glass.
    out.lerp(new Color("#ffffff"), 0.16);
    return `#${out.getHexString()}`;
  }, [contents, total]);

  const surfaceColor = useMemo(
    () =>
      blend ? `#${new Color(blend).offsetHSL(0, 0, 0.1).getHexString()}` : null,
    [blend],
  );

  const seeds = useMemo(
    () =>
      Array.from({ length: BUBBLES }, (_, i) => {
        const r = (n: number) => {
          const x = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          angle: r(1) * Math.PI * 2,
          radius: 0.25 + r(2) * 0.75,
          speed: 0.35 + r(3) * 0.5,
          offset: r(4),
          size: 0.02 + r(5) * 0.035,
        };
      }),
    [],
  );

  // Decorative motion cue while the worker reports activity. Never a progress signal.
  useFrame(({ clock }, delta) => {
    if (paddle.current && working && !reducedMotion) {
      paddle.current.rotation.y += delta * 1.7;
    }
    const m = bubbles.current;
    if (!m) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i];
      const cycle = (t * s.speed + s.offset) % 1;
      const scale = working && !reducedMotion ? s.size * (0.5 + cycle) : 0;
      dummy.position.set(
        Math.cos(s.angle) * s.radius * 0.85,
        0.36 + cycle * (fillHeight * 0.85),
        Math.sin(s.angle) * s.radius * 0.85,
      );
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {/* Vessel shell: Blender-authored GLB, procedural geometry as fallback */}
      <SceneModel
        url="/scene/assets/mixing-vessel/mixing-vessel.glb"
        theme={theme}
        placeholder={<VesselPlaceholder />}
        fallback={<VesselShell theme={theme} />}
        tints={{ VesselMetal: theme.metal, VesselGlass: theme.glass }}
      />

      {/* Contents: illustrative blend, level follows the validated total */}
      {blend && (
        <>
          <mesh position={[0, 0.36 + fillHeight / 2, 0]}>
            <cylinderGeometry args={[1.22, 1.05, fillHeight, 64]} />
            <meshStandardMaterial color={blend} roughness={0.88} />
          </mesh>
          <mesh
            position={[0, 0.365 + fillHeight, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[1.22, 64]} />
            <meshStandardMaterial
              color={surfaceColor ?? blend}
              roughness={0.75}
            />
          </mesh>
        </>
      )}

      {/* Bubbles while working (decorative) */}
      <instancedMesh
        ref={bubbles}
        args={[undefined, undefined, BUBBLES]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial
          color={theme.glass}
          transparent
          opacity={0.55}
          roughness={0.2}
        />
      </instancedMesh>

      {/* Paddle */}
      <group ref={paddle} position={[0, 0.36, 0]}>
        <mesh position={[0, 0.55, 0]} castShadow>
          <cylinderGeometry args={[0.055, 0.055, 1.3, 16]} />
          <meshStandardMaterial
            color={theme.metal}
            metalness={0.75}
            roughness={0.22}
          />
        </mesh>
        {[0.18, 0.5].map((y) => (
          <mesh key={y} position={[0, y, 0]} castShadow>
            <boxGeometry args={[1.7, 0.14, 0.06]} />
            <meshStandardMaterial
              color={theme.metal}
              metalness={0.75}
              roughness={0.22}
            />
          </mesh>
        ))}
      </group>

      {/* Rim highlight reflects the reported stage status */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.64, 0]}>
        <ringGeometry args={[1.42, highlight ? 1.64 : 1.52, 72]} />
        <meshBasicMaterial
          color={highlight ?? theme.metal}
          toneMapped={false}
          transparent
          opacity={highlight ? 0.95 : 0.8}
        />
      </mesh>
    </group>
  );
}

/** Procedural vessel shell matching the GLB; shown if the asset fails. */
function VesselShell({ theme }: { theme: SceneTheme }) {
  return (
    <group>
      <mesh position={[0, 0.16, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[1.16, 1.3, 0.32, 64]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.65}
          roughness={0.3}
        />
      </mesh>
      <mesh position={[0, 0.33, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.05, 12, 72]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[0, 0.98, 0]} renderOrder={2}>
        <cylinderGeometry args={[1.02, 1.5, 1.28, 64, 1, true]} />
        <meshStandardMaterial
          color={theme.glass}
          transparent
          opacity={theme.dark ? 0.22 : 0.3}
          roughness={0.08}
          metalness={0.05}
          envMapIntensity={1.4}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, 1.62, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.035, 12, 72]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.7}
          roughness={0.25}
        />
      </mesh>
    </group>
  );
}

/** Low-poly stand-in while the GLB downloads. */
function VesselPlaceholder() {
  return (
    <group>
      <mesh position={[0, 0.16, 0]}>
        <cylinderGeometry args={[1.16, 1.3, 0.32, 32]} />
        <meshStandardMaterial transparent opacity={0.25} />
      </mesh>
      <mesh position={[0, 0.98, 0]} renderOrder={2}>
        <cylinderGeometry args={[1.02, 1.5, 1.28, 24, 1, true]} />
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
