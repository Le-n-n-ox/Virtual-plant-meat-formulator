"use client";

import { CameraControls, ContactShadows, Grid } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";
import { useShallow } from "zustand/react/shallow";
import { useFormulationStore } from "@/stores/formulationStore";
import { isTerminal, useJobStore } from "@/stores/jobStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { useReducedMotionPreference } from "./hooks/useSceneEnvironment";
import { LabelProjector } from "./labels";
import { CandidateProduct } from "./objects/CandidateProduct";
import { IngredientBin } from "./objects/IngredientBin";
import { IngredientFlow } from "./objects/IngredientFlow";
import { MixingVessel } from "./objects/MixingVessel";
import { ProcessLine } from "./objects/ProcessLine";
import {
  PRODUCT_POSITION,
  VESSEL_POSITION,
  binPosition,
  stageColorKey,
} from "./stations";
import { type SceneTheme, cropColor, useSceneTheme } from "./theme/sceneTheme";

const FOV = 38;
const HOME_TARGET = new Vector3(2.1, 0.5, 0);
const HOME_DIRECTION = new Vector3(0, 0.48, 1).normalize();
/** Half-size of the content to keep in view (world units). */
const HALF_EXTENT = { x: 6.1, y: 2.4 };

/**
 * The live 3D workspace. Renders only from stores:
 *  - formulationStore.validated → bins, fill levels, vessel blend
 *  - jobStore → station status, vessel activity, candidate preview
 *  - selectionStore → highlighted bin / candidate
 * It never computes scientific values or progress.
 */
export default function SceneCanvas() {
  const theme = useSceneTheme();
  const reducedMotion = useReducedMotionPreference();

  return (
    <Canvas
      shadows
      flat
      dpr={[1, 2]}
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ position: [2.1, 6, 13], fov: FOV, near: 0.1, far: 120 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      aria-hidden
      onPointerMissed={() =>
        useSelectionStore.getState().selectIngredient(null)
      }
    >
      <color attach="background" args={[theme.bg]} />
      <fog attach="fog" args={[theme.bg, 24, 48]} />
      <SceneLights theme={theme} />
      <Stage theme={theme} reducedMotion={reducedMotion} />
      <Camera />
      <LabelProjector />
    </Canvas>
  );
}

function SceneLights({ theme }: { theme: SceneTheme }) {
  return (
    <>
      <ambientLight intensity={theme.ambient} />
      <hemisphereLight args={[theme.glass, theme.floor, 0.5]} />
      <directionalLight
        position={[5, 10, 6]}
        intensity={theme.key_light}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <directionalLight
        position={[-6, 4, -4]}
        intensity={theme.key_light * 0.3}
      />
    </>
  );
}

/**
 * Home view that frames the whole layout for the current panel aspect ratio,
 * so narrow panels zoom out instead of clipping bins or the product.
 */
function homeView(aspect: number, fovDeg: number) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const distance =
    Math.max(HALF_EXTENT.x / (t * aspect), HALF_EXTENT.y / t, 8) * 1.06;
  const p = HOME_DIRECTION.clone().multiplyScalar(distance).add(HOME_TARGET);
  return [p.x, p.y, p.z, HOME_TARGET.x, HOME_TARGET.y, HOME_TARGET.z] as const;
}

function Camera() {
  const controls = useRef<CameraControls>(null);
  const token = useSceneStore((s) => s.cameraResetToken);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const aspectRef = useRef(aspect);

  // Animated return to the home view when the user presses "Reset camera".
  useEffect(() => {
    if (token === 0) return;
    void controls.current?.setLookAt(...homeView(aspectRef.current, FOV), true);
  }, [token]);

  // Frame the layout on mount and whenever the panel changes shape.
  useEffect(() => {
    aspectRef.current = aspect;
    const c = controls.current;
    if (!c) return;
    void c.setLookAt(...homeView(aspect, FOV), false);
  }, [aspect]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={5}
      maxDistance={34}
      maxPolarAngle={Math.PI / 2.1}
    />
  );
}

interface Flow {
  key: string;
  from: [number, number, number];
  color: string;
}

function Stage({
  theme,
  reducedMotion,
}: {
  theme: SceneTheme;
  reducedMotion: boolean;
}) {
  const validated = useFormulationStore((s) => s.validated);
  const selectedId = useSelectionStore((s) => s.selectedIngredientId);
  const selectIngredient = useSelectionStore((s) => s.selectIngredient);
  const job = useJobStore(
    useShallow((s) => ({
      status: s.status,
      stages: s.stages,
      candidateIds: s.candidateIds,
    })),
  );
  const selectedCandidate = useSelectionStore((s) => s.selectedCandidateId);
  const [flows, setFlows] = useState<Flow[]>([]);

  const lines = useMemo(() => validated?.lines ?? [], [validated]);
  const invalidIds = useMemo(
    () =>
      new Set(
        validated?.result.issues.map((i) => i.ingredient_id).filter(Boolean),
      ),
    [validated],
  );

  // Play a pour-in cue for ingredients that newly appear in the validated snapshot.
  useEffect(() => {
    if (reducedMotion) return;
    return useFormulationStore.subscribe((state, prev) => {
      const before = new Set(prev.validated?.lines.map((l) => l.ingredient_id));
      if (!prev.validated) return; // first snapshot: no pour-in
      const now = state.validated?.lines ?? [];
      const added = now
        .map((l, index) => ({ l, index }))
        .filter(({ l }) => !before.has(l.ingredient_id));
      if (added.length === 0) return;
      setFlows((f) => [
        ...f,
        ...added.map(({ l, index }) => ({
          key: `${l.ingredient_id}-${Date.now()}`,
          from: binPosition(index, now.length),
          color: cropColor(theme, index),
        })),
      ]);
    });
  }, [reducedMotion, theme]);

  const running = job.status === "running" || job.status === "queued";
  const mixingStatus = job.stages["mixing"];
  const totalInvalid = validated ? !validated.result.valid : false;
  // Job stage colour takes precedence; otherwise flag an invalid total in amber.
  const vesselHighlight =
    mixingStatus || (running && !isTerminal(job.status))
      ? theme[stageColorKey(mixingStatus ?? "active")]
      : totalInvalid
        ? theme.warning
        : null;
  const candidateId = selectedCandidate ?? job.candidateIds.at(-1) ?? null;

  return (
    <group>
      {/* Floor */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[2, -0.01, 0]}
        receiveShadow
      >
        <circleGeometry args={[11, 72]} />
        <meshStandardMaterial color={theme.floor} roughness={0.95} />
      </mesh>
      <Grid
        position={[2, 0, 0]}
        args={[22, 22]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={theme.grid}
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={theme.grid}
        fadeDistance={20}
        fadeStrength={1.5}
        infiniteGrid={false}
      />
      <ContactShadows
        position={[2, 0.005, 0]}
        scale={22}
        blur={2.4}
        opacity={theme.dark ? 0.55 : 0.35}
        far={4}
        resolution={512}
        frames={reducedMotion ? 1 : Infinity}
      />

      <group position={VESSEL_POSITION}>
        <MixingVessel
          contents={lines.map((l, i) => ({
            color: cropColor(theme, i),
            weight: l.percent,
          }))}
          working={running && !isTerminal(job.status)}
          highlight={vesselHighlight}
          theme={theme}
          reducedMotion={reducedMotion}
        />
      </group>

      {lines.map((line, index) => {
        return (
          <IngredientBin
            key={line.ingredient_id}
            id={line.ingredient_id}
            percent={line.percent}
            color={cropColor(theme, index)}
            position={binPosition(index, lines.length)}
            selected={selectedId === line.ingredient_id}
            invalid={invalidIds.has(line.ingredient_id)}
            theme={theme}
            reducedMotion={reducedMotion}
            onSelect={selectIngredient}
          />
        );
      })}

      {flows.map((flow) => (
        <IngredientFlow
          key={flow.key}
          from={flow.from}
          to={VESSEL_POSITION}
          color={flow.color}
          onDone={() => setFlows((f) => f.filter((x) => x.key !== flow.key))}
        />
      ))}

      <ProcessLine
        stages={job.stages}
        theme={theme}
        reducedMotion={reducedMotion}
      />

      {candidateId && (
        <group position={PRODUCT_POSITION}>
          <CandidateProduct
            key={candidateId}
            theme={theme}
            reducedMotion={reducedMotion}
          />
        </group>
      )}
    </group>
  );
}
