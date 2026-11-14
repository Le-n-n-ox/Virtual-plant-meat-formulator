"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { MeshStandardMaterial } from "three";
import type { StageStatus } from "@/stores/jobStore";
import { PROCESS_STATIONS, STATION_X, stageColorKey } from "../stations";
import type { SceneTheme } from "../theme/sceneTheme";

const BARREL_Y = 0.85;
const SEGMENT_LENGTH = 1.1;

interface ProcessLineProps {
  stages: Record<string, StageStatus>;
  theme: SceneTheme;
  reducedMotion: boolean;
}

/** Schematic processing line. Segments reflect worker-reported stage status. */
export function ProcessLine({
  stages,
  theme,
  reducedMotion,
}: ProcessLineProps) {
  const start = 1.5;
  const end = STATION_X.optimization + SEGMENT_LENGTH / 2 + 0.6;

  return (
    <group>
      {/* Base rail */}
      <mesh position={[(start + end) / 2, 0.2, 0]} receiveShadow castShadow>
        <boxGeometry args={[end - start, 0.4, 1.1]} />
        <meshStandardMaterial color={theme.floor} roughness={0.7} />
      </mesh>
      {/* Feed pipe from the vessel */}
      <mesh
        position={[(start + STATION_X.nutrition) / 2 - 0.2, BARREL_Y, 0]}
        rotation={[0, 0, Math.PI / 2]}
      >
        <cylinderGeometry
          args={[0.18, 0.18, STATION_X.nutrition - start, 20]}
        />
        <meshStandardMaterial
          color={theme.metal}
          metalness={0.6}
          roughness={0.3}
        />
      </mesh>
      {PROCESS_STATIONS.filter((s) => s.id !== "mixing").map((station) => (
        <StationSegment
          key={station.id}
          x={STATION_X[station.id as keyof typeof STATION_X]}
          status={stages[station.id]}
          theme={theme}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

function StationSegment({
  x,
  status,
  theme,
  reducedMotion,
}: {
  x: number;
  status: StageStatus | undefined;
  theme: SceneTheme;
  reducedMotion: boolean;
}) {
  const material = useRef<MeshStandardMaterial>(null);
  const colorKey = stageColorKey(status);
  const color = theme[colorKey];
  const active = status === "active";

  // Decorative pulse while the stage is reported active.
  useFrame(({ clock }) => {
    if (!material.current) return;
    material.current.emissiveIntensity =
      active && !reducedMotion
        ? 0.35 + Math.sin(clock.elapsedTime * 3) * 0.2
        : active
          ? 0.4
          : 0.12;
  });

  return (
    <group position={[x, BARREL_Y, 0]}>
      <mesh rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.36, 0.36, SEGMENT_LENGTH - 0.08, 32]} />
        <meshStandardMaterial
          ref={material}
          color={color}
          emissive={colorKey === "metal" ? "#000000" : color}
          emissiveIntensity={0.12}
          metalness={colorKey === "metal" ? 0.6 : 0.2}
          roughness={0.35}
        />
      </mesh>
      {/* Status marker */}
      <mesh position={[0, 0.75, 0]}>
        <sphereGeometry args={[0.1, 20, 20]} />
        <meshBasicMaterial
          color={colorKey === "metal" ? theme.idle : color}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
