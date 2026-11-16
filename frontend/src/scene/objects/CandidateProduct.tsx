"use client";

import { RoundedBox, Sparkles } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, type Group } from "three";
import type { SceneTheme } from "../theme/sceneTheme";
import { SceneModel } from "./SceneModel";

interface CandidateProductProps {
  theme: SceneTheme;
  reducedMotion: boolean;
  /**
   * Cutaway view: the patty is shown in two halves with the interior layers
   * exposed. Only offered when the candidate carries a validated scene
   * variable; otherwise the fibre-pattern view is used.
   */
  cutaway?: boolean;
}

/**
 * ILLUSTRATIVE product preview. Shape, colour and fibre lines are not derived
 * from any prediction; they must stay labelled "Illustrative" until a
 * calibrated, validated model supplies a variable for them.
 */
export function CandidateProduct({
  theme,
  reducedMotion,
  cutaway = false,
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
      {/* Pedestal: Blender-authored GLB, procedural geometry as fallback */}
      <SceneModel
        url="/scene/assets/candidate-pedestal/pedestal.glb"
        placeholder={<PedestalPlaceholder />}
        fallback={<PedestalShell theme={theme} />}
        tints={{ PedestalMetal: theme.metal }}
      />
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
        {cutaway ? (
          <CutawayBody theme={theme} crust={crust} fibre={fibre} />
        ) : (
          <FibreBody theme={theme} fibre={fibre} />
        )}
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

/** Default view: a solid patty with fibre striations on top. */
function FibreBody({ theme, fibre }: { theme: SceneTheme; fibre: string }) {
  return (
    <group>
      {/* Patty body: Blender-authored GLB, procedural geometry as fallback */}
      <SceneModel
        url="/scene/assets/candidate-patty/patty.glb"
        placeholder={<PattyPlaceholder />}
        fallback={<PattyShell theme={theme} />}
        tints={{ PattyCrust: theme.product }}
      />
      {/* Seared crust edges */}
      <RoundedBox
        args={[1.54, 0.2, 0.99]}
        radius={0.1}
        smoothness={4}
        position={[0, -0.16, 0]}
      >
        <meshStandardMaterial color={crustColor(theme)} roughness={0.85} />
      </RoundedBox>
      {/* Fibre striations (illustrative) */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[0, 0.265, -0.34 + i * 0.115]}>
          <boxGeometry args={[1.16, 0.014, 0.028]} />
          <meshStandardMaterial color={fibre} roughness={0.9} />
        </mesh>
      ))}
      <CutFace />
    </group>
  );
}

/**
 * Cutaway view: the patty is split in two and pulled apart so the layered
 * interior is visible. Rendered procedurally because the GLB is one solid.
 */
function CutawayBody({
  theme,
  crust,
  fibre,
}: {
  theme: SceneTheme;
  crust: string;
  fibre: string;
}) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.42, 0, 0]}>
          <RoundedBox
            args={[0.66, 0.52, 0.95]}
            radius={0.13}
            smoothness={4}
            castShadow
          >
            <meshStandardMaterial color={theme.product} roughness={0.72} />
          </RoundedBox>
          <RoundedBox
            args={[0.7, 0.18, 0.99]}
            radius={0.08}
            smoothness={4}
            position={[0, -0.17, 0]}
          >
            <meshStandardMaterial color={crust} roughness={0.85} />
          </RoundedBox>
          {Array.from({ length: 4 }, (_, i) => (
            <mesh key={i} position={[0, 0.265, -0.3 + i * 0.2]}>
              <boxGeometry args={[0.42, 0.014, 0.028]} />
              <meshStandardMaterial color={fibre} roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      {/* Interior layers exposed by the cut (illustrative) */}
      {[-0.17, 0, 0.17].map((y, i) => (
        <mesh key={y} position={[0, y, 0]}>
          <boxGeometry args={[0.16, 0.15, 0.88]} />
          <meshStandardMaterial
            color={i === 1 ? theme.product : crust}
            roughness={0.9}
          />
        </mesh>
      ))}
      <CutFace />
    </group>
  );
}

/** Layered cut face shared by both views. */
function CutFace() {
  return (
    <group>
      <mesh position={[0.76, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
        <cylinderGeometry args={[0.26, 0.26, 0.02, 32]} />
        <meshStandardMaterial color="#7a4a2c" roughness={0.9} />
      </mesh>
      {[0.09, 0.17].map((r) => (
        <mesh key={r} position={[0.775, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
          <torusGeometry args={[r, 0.012, 8, 32]} />
          <meshStandardMaterial color="#c9a27a" roughness={0.9} />
        </mesh>
      ))}
    </group>
  );
}

function crustColor(theme: SceneTheme): string {
  return `#${new Color(theme.product).offsetHSL(0, 0.02, -0.08).getHexString()}`;
}

/** Procedural pedestal matching the GLB; shown if the asset fails. */
function PedestalShell({ theme }: { theme: SceneTheme }) {
  return (
    <mesh position={[0, 0.22, 0]} receiveShadow castShadow>
      <cylinderGeometry args={[1.05, 1.18, 0.44, 56]} />
      <meshStandardMaterial
        color={theme.metal}
        metalness={0.6}
        roughness={0.35}
      />
    </mesh>
  );
}

function PedestalPlaceholder() {
  return (
    <mesh position={[0, 0.22, 0]}>
      <cylinderGeometry args={[1.05, 1.18, 0.44, 24]} />
      <meshStandardMaterial transparent opacity={0.25} />
    </mesh>
  );
}

/** Procedural patty matching the GLB; shown if the asset fails. */
function PattyShell({ theme }: { theme: SceneTheme }) {
  return (
    <RoundedBox
      args={[1.5, 0.52, 0.95]}
      radius={0.18}
      smoothness={4}
      castShadow
    >
      <meshStandardMaterial color={theme.product} roughness={0.72} />
    </RoundedBox>
  );
}

function PattyPlaceholder() {
  return (
    <RoundedBox args={[1.5, 0.52, 0.95]} radius={0.18} smoothness={2}>
      <meshStandardMaterial transparent opacity={0.2} />
    </RoundedBox>
  );
}
