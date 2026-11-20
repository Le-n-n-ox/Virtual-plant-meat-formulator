"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import type { StageStatus } from "@/stores/jobStore";
import {
  BARREL_Y,
  BELT_Y,
  BEACON_Y,
  LINE_END,
  LINE_START,
  PROCESS_STATIONS,
  STATION_X,
  stageColorKey,
} from "../stations";
import type { SceneTheme } from "../theme/sceneTheme";
import { SceneModel } from "./SceneModel";

const SEGMENT_LENGTH = 1.1;
const SLAT_COUNT = 12;
const SLAT_SPACING = 0.4;

interface ProcessLineProps {
  stages: Record<string, StageStatus>;
  /** True while a worker event reports any stage running. Drives the belt. */
  running: boolean;
  theme: SceneTheme;
  reducedMotion: boolean;
}

/** Schematic processing line. Segments reflect worker-reported stage status. */
export function ProcessLine({
  stages,
  running,
  theme,
  reducedMotion,
}: ProcessLineProps) {
  const tread = useRef<Group>(null);
  const slug = useRef<Mesh>(null);
  const offset = useRef(0);
  const slugProgress = useRef(0);

  useFrame((_, delta) => {
    if (running && !reducedMotion) {
      offset.current = (offset.current + delta * 1.1) % SLAT_SPACING;
      slugProgress.current = (slugProgress.current + delta * 0.28) % 1;
    }
    if (tread.current) tread.current.position.x = -offset.current;
    if (slug.current) {
      slug.current.position.x =
        LINE_START + slugProgress.current * (LINE_END - LINE_START);
      slug.current.visible = running;
    }
  });

  return (
    <group>
      {/* Rail, legs and bed: Blender-authored GLB, procedural as fallback */}
      <group position={[(LINE_START + LINE_END) / 2, 0, 0]}>
        <SceneModel
          url="/scene/assets/processing-line/processing-line.glb"
          placeholder={<LinePlaceholder />}
          fallback={<LineShell theme={theme} />}
          tints={{ LineMetal: theme.metal, LineDark: theme.metal }}
        />
      </group>

      {/* Moving tread slats */}
      <group ref={tread}>
        {Array.from({ length: SLAT_COUNT }, (_, i) => (
          <mesh
            key={i}
            position={[LINE_START + 0.2 + i * SLAT_SPACING, BELT_Y + 0.03, 0]}
          >
            <boxGeometry args={[0.22, 0.04, 0.9]} />
            <meshStandardMaterial color={theme.gridStrong} roughness={0.8} />
          </mesh>
        ))}
      </group>

      {/* Moving product slug (decorative) */}
      <mesh
        ref={slug}
        position={[LINE_START, BELT_Y + 0.14, 0]}
        visible={false}
      >
        <boxGeometry args={[0.5, 0.22, 0.5]} />
        <meshStandardMaterial color={theme.product} roughness={0.8} />
      </mesh>

      {/* Feed pipe from the vessel */}
      <mesh
        position={[(LINE_START + STATION_X.nutrition) / 2 - 0.2, BARREL_Y, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry
          args={[0.18, 0.18, STATION_X.nutrition - LINE_START, 20]}
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

/** Procedural rail, legs and bed matching the GLB; asset fallback. */
function LineShell({ theme }: { theme: SceneTheme }) {
  return (
    <group>
      <mesh position={[0, 0.24, 0]} receiveShadow castShadow>
        <boxGeometry args={[LINE_END - LINE_START, 0.36, 1.05]} />
        <meshStandardMaterial color={theme.metal} roughness={0.55} />
      </mesh>
      {[-1.95, 1.95].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]} castShadow>
          <boxGeometry args={[0.16, BELT_Y - 0.36, 0.8]} />
          <meshStandardMaterial color={theme.metal} roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 0.43, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[LINE_END - LINE_START - 0.2, 0.92]} />
        <meshStandardMaterial
          color={theme.metal}
          roughness={0.55}
          metalness={0.3}
        />
      </mesh>
    </group>
  );
}

/** Low-poly stand-in while the GLB downloads. */
function LinePlaceholder() {
  return (
    <mesh position={[0, 0.24, 0]}>
      <boxGeometry args={[LINE_END - LINE_START, 0.36, 1.05]} />
      <meshStandardMaterial transparent opacity={0.2} />
    </mesh>
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
  const beacon = useRef<Mesh>(null);
  const colorKey = stageColorKey(status);
  const color = theme[colorKey];
  const active = status === "active";

  // Decorative pulse while the stage is reported active.
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (material.current) {
      material.current.emissiveIntensity =
        active && !reducedMotion
          ? 0.4 + Math.sin(t * 3) * 0.22
          : active
            ? 0.45
            : 0.1;
    }
    if (beacon.current) {
      const s = active && !reducedMotion ? 1 + Math.sin(t * 3) * 0.18 : 1;
      beacon.current.scale.setScalar(s);
    }
  });

  return (
    <group position={[x, 0, 0]}>
      {/* Barrel */}
      <mesh
        position={[0, BARREL_Y, 0]}
        rotation={[0, 0, Math.PI / 2]}
        castShadow
      >
        <cylinderGeometry args={[0.36, 0.36, SEGMENT_LENGTH - 0.08, 32]} />
        <meshStandardMaterial
          ref={material}
          color={color}
          emissive={colorKey === "metal" ? "#000000" : color}
          emissiveIntensity={0.1}
          metalness={colorKey === "metal" ? 0.6 : 0.25}
          roughness={0.35}
        />
      </mesh>
      {/* End caps */}
      {[-1, 1].map((side) => (
        <mesh
          key={side}
          position={[(side * (SEGMENT_LENGTH - 0.08)) / 2, BARREL_Y, 0]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <torusGeometry args={[0.36, 0.035, 10, 32]} />
          <meshStandardMaterial
            color={theme.metal}
            metalness={0.7}
            roughness={0.28}
          />
        </mesh>
      ))}
      {/* Beacon pole + status marker */}
      <mesh position={[0, (BARREL_Y + BEACON_Y) / 2 + 0.1, 0]}>
        <cylinderGeometry args={[0.02, 0.02, BEACON_Y - BARREL_Y - 0.2, 8]} />
        <meshStandardMaterial color={theme.metal} metalness={0.6} />
      </mesh>
      <mesh ref={beacon} position={[0, BEACON_Y, 0]}>
        <sphereGeometry args={[0.11, 20, 20]} />
        <meshBasicMaterial
          color={colorKey === "metal" ? theme.idle : color}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}
