"use client";

import { RoundedBox, Sparkles } from "@react-three/drei";
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
    () => `#${new Color(theme.product).multiplyScalar(0.72).getHexString()}`,
    [theme.product],
  );
  const crust = useMemo(
    () =>
      `#${new Color(theme.product).offsetHSL(0, 0.02, -0.08).getHexString()}`,
    [theme.product],
  );

  useFrame((_, delta) => {
    const g = spin.current;
    if (!g) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 5);
    g.scale.setScalar(g.scale.x + (1 - g.scale.x) * k);
    if (!reducedMotion) g.rotation.y += delta * 0.32;
  });

  return (
    <group>
      {/* Pedestal */}
      <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[1.05, 1.18, 0.44, 56]} />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.6}
          roughness={0.35}
        />
      </mesh>
      <mesh position={[0, 0.45, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.95, 1.1, 56]} />
        <meshBasicMaterial
          color={theme.accent}
          toneMapped={false}
          transparent
          opacity={0.7}
        />
      </mesh>

      <group
        ref={spin}
        position={[0, 0.92, 0]}
        scale={reducedMotion ? 1 : 0.001}
      >
        {/* Patty body */}
        <RoundedBox
          args={[1.5, 0.52, 0.95]}
          radius={0.18}
          smoothness={4}
          castShadow
        >
          <meshStandardMaterial color={theme.product} roughness={0.72} />
        </RoundedBox>
        {/* Seared crust edges */}
        <RoundedBox
          args={[1.54, 0.2, 0.99]}
          radius={0.1}
          smoothness={4}
          position={[0, -0.16, 0]}
        >
          <meshStandardMaterial color={crust} roughness={0.85} />
        </RoundedBox>
        {/* Fibre striations (illustrative) */}
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} position={[0, 0.265, -0.34 + i * 0.115]}>
            <boxGeometry args={[1.16, 0.014, 0.028]} />
            <meshStandardMaterial color={fibre} roughness={0.9} />
          </mesh>
        ))}
        {/* Cut face: layered interior */}
        <mesh position={[0.76, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <cylinderGeometry args={[0.26, 0.26, 0.02, 32]} />
          <meshStandardMaterial color={crust} roughness={0.9} />
        </mesh>
        {[0.09, 0.17].map((r) => (
          <mesh key={r} position={[0.775, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
            <torusGeometry args={[r, 0.012, 8, 32]} />
            <meshStandardMaterial color={fibre} roughness={0.9} />
          </mesh>
        ))}
      </group>

      {/* Ambient sparkle (decorative) */}
      {!reducedMotion && (
        <Sparkles
          count={26}
          scale={[3.2, 1.8, 2.4]}
          position={[0, 1.5, 0]}
          size={2.4}
          speed={0.35}
          color={theme.glow}
          opacity={0.6}
        />
      )}
    </group>
  );
}
