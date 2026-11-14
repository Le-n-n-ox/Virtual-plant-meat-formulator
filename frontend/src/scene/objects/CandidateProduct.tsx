"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, type Group } from "three";
import type { SceneTheme } from "../theme/sceneTheme";

interface CandidateProductProps {
  theme: SceneTheme;
  reducedMotion: boolean;
}

/**
 * ILLUSTRATIVE product preview. Shape, colour and fibre lines are not derived
 * from any prediction; they must stay labelled "Illustrative" until a
 * calibrated, validated model supplies a variable for them.
 */
export function CandidateProduct({
  theme,
  reducedMotion,
}: CandidateProductProps) {
  const spin = useRef<Group>(null);
  const fibre = useMemo(
    () => `#${new Color(theme.product).multiplyScalar(0.78).getHexString()}`,
    [theme.product],
  );

  useFrame((_, delta) => {
    const g = spin.current;
    if (!g) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 6);
    g.scale.setScalar(g.scale.x + (1 - g.scale.x) * k);
    if (!reducedMotion) g.rotation.y += delta * 0.35;
  });

  return (
    <group>
      <mesh position={[0, 0.25, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1, 1.1, 0.5, 48]} />
        <meshStandardMaterial color={theme.floor} roughness={0.6} />
      </mesh>
      <group
        ref={spin}
        position={[0, 0.82, 0]}
        scale={reducedMotion ? 1 : 0.001}
      >
        <RoundedBox
          args={[1.4, 0.5, 0.9]}
          radius={0.16}
          smoothness={4}
          castShadow
        >
          <meshStandardMaterial color={theme.product} roughness={0.75} />
        </RoundedBox>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[0, 0.255, -0.33 + i * 0.11]}>
            <boxGeometry args={[1.1, 0.012, 0.025]} />
            <meshStandardMaterial color={fibre} roughness={0.9} />
          </mesh>
        ))}
      </group>
    </group>
  );
}
