"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, DoubleSide, type Group, LatheGeometry, Vector2 } from "three";
import type { SceneTheme } from "../theme/sceneTheme";

const PROFILE = [
  [0, 0],
  [1.0, 0],
  [1.22, 0.18],
  [1.35, 0.7],
  [1.4, 1.25],
  [1.48, 1.32],
].map(([x, y]) => new Vector2(x, y));

export interface MixingVesselProps {
  /** Crop colours with validated weights; produces an illustrative blend colour. */
  contents: { color: string; weight: number }[];
  /** True when a worker event reports the mixing stage (or any stage) running. */
  working: boolean;
  highlight: string | null;
  theme: SceneTheme;
  reducedMotion: boolean;
}

export function MixingVessel({
  contents,
  working,
  highlight,
  theme,
  reducedMotion,
}: MixingVesselProps) {
  const paddle = useRef<Group>(null);
  const geometry = useMemo(() => new LatheGeometry(PROFILE, 64), []);

  const blend = useMemo(() => {
    const total = contents.reduce((sum, c) => sum + Math.max(0, c.weight), 0);
    if (total <= 0) return null;
    const out = new Color(0, 0, 0);
    const tmp = new Color();
    for (const c of contents) {
      tmp.set(c.color).multiplyScalar(Math.max(0, c.weight) / total);
      out.add(tmp);
    }
    return `#${out.getHexString()}`;
  }, [contents]);

  // Decorative motion cue while the worker reports activity. Never a progress signal.
  useFrame((_, delta) => {
    if (paddle.current && working && !reducedMotion) {
      paddle.current.rotation.y += delta * 1.6;
    }
  });

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.65}
          roughness={0.28}
          side={DoubleSide}
        />
      </mesh>
      {blend && (
        <mesh position={[0, 0.55, 0]}>
          <cylinderGeometry args={[1.28, 1.08, 0.9, 64]} />
          <meshStandardMaterial color={blend} roughness={0.9} />
        </mesh>
      )}
      {/* Rim highlight reflects the reported stage status. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1.33, 0]}>
        <ringGeometry args={[1.42, highlight ? 1.62 : 1.5, 64]} />
        <meshBasicMaterial
          color={highlight ?? theme.metal}
          toneMapped={false}
        />
      </mesh>
      <group ref={paddle} position={[0, 0.2, 0]}>
        <mesh position={[0, 0.9, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 1.8, 12]} />
          <meshStandardMaterial
            color={theme.metal}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0, 0.35, 0]} castShadow>
          <boxGeometry args={[1.7, 0.18, 0.06]} />
          <meshStandardMaterial
            color={theme.metal}
            metalness={0.7}
            roughness={0.25}
          />
        </mesh>
      </group>
    </group>
  );
}
