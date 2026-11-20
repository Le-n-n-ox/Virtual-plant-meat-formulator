"use client";

import {
  CameraControls,
  ContactShadows,
  Environment,
  Grid,
  Lightformer,
  Sparkles,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, SRGBColorSpace, Vector3 } from "three";
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
const HOME_TARGET = new Vector3(2.4, 0.6, 0);
const HOME_DIRECTION = new Vector3(0, 0.46, 1).normalize();
/** Half-size of the content to keep in view (world units). */
const HALF_EXTENT = { x: 6.9, y: 2.7 };

/** sRGB hex with an alpha channel, for canvas gradients. */
function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function radialTexture(inner: string, outer: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

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
      dpr={[1, 2]}
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ position: [2.1, 9, 20], fov: FOV, near: 0.1, far: 140 }}
      gl={{ antialias: true, preserveDrawingBuffer: false }}
      aria-hidden
      onPointerMissed={() =>
        useSelectionStore.getState().selectIngredient(null)
      }
    >
      <color attach="background" args={[theme.bg]} />
      <fog attach="fog" args={[theme.bg, 26, 52]} />
      <SceneLights theme={theme} />
      <Backdrop theme={theme} />
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
      <hemisphereLight args={[theme.glass, theme.floor, 0.55]} />
      <directionalLight
        position={[6, 12, 7]}
        intensity={theme.key_light}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-bias={-0.0004}
      />
      <directionalLight
        position={[-7, 5, -5]}
        intensity={theme.key_light * 0.35}
      />
      {/* Soft top light so the vessel contents read through the glass. */}
      <pointLight
        position={[0, 5, 3.5]}
        intensity={theme.dark ? 45 : 28}
        distance={18}
        decay={2}
        color={theme.glow}
      />
      {/* Offline environment map so metal and glass have something to reflect. */}
      <Environment key={theme.key} resolution={256} frames={1}>
        <Lightformer
          intensity={2.2}
          position={[0, 6, 0]}
          rotation-x={Math.PI / 2}
          scale={[12, 12, 1]}
          color={theme.glass}
        />
        <Lightformer
          intensity={1.4}
          position={[-6, 2, 2]}
          rotation-y={Math.PI / 2}
          scale={[8, 4, 1]}
          color={theme.glow}
        />
        <Lightformer
          intensity={1.1}
          position={[6, 3, -2]}
          rotation-y={-Math.PI / 2}
          scale={[8, 4, 1]}
          color={theme.accent}
        />
      </Environment>
    </>
  );
}

/** Soft glow on the back wall, giving the schematic some depth. */
function Backdrop({ theme }: { theme: SceneTheme }) {
  const texture = useMemo(
    () =>
      radialTexture(
        withAlpha(theme.glow, theme.dark ? 0.32 : 0.22),
        withAlpha(theme.bg2, 0),
      ),
    [theme.glow, theme.bg2, theme.dark],
  );
  return (
    <mesh position={[2, 4.5, -12]} scale={[38, 20, 1]}>
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/**
 * Home view that frames the whole layout for the current panel aspect ratio,
 * so narrow panels zoom out instead of clipping bins or the product.
 */
function homeView(aspect: number, fovDeg: number) {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  const distance =
    Math.max(HALF_EXTENT.x / (t * aspect), HALF_EXTENT.y / t, 9) * 1.05;
  const p = HOME_DIRECTION.clone().multiplyScalar(distance).add(HOME_TARGET);
  return [p.x, p.y, p.z, HOME_TARGET.x, HOME_TARGET.y, HOME_TARGET.z] as const;
}

function Camera() {
  const controls = useRef<CameraControls>(null);
  const token = useSceneStore((s) => s.cameraResetToken);
  const aspect = useThree((s) => s.size.width / Math.max(1, s.size.height));
  const aspectRef = useRef(aspect);
  const ready = useRef(false);

  // Intro: start wide, then settle on the home view.
  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const [px, py, pz, tx, ty, tz] = homeView(aspectRef.current, FOV);
    void c.setLookAt(px * 1.3, py * 1.7, pz * 1.3, tx, ty, tz, false);
    const id = setTimeout(() => {
      ready.current = true;
      void c.setLookAt(px, py, pz, tx, ty, tz, true);
    }, 80);
    return () => clearTimeout(id);
  }, []);

  // Re-frame when the panel changes shape.
  useEffect(() => {
    aspectRef.current = aspect;
    if (!ready.current) return;
    const c = controls.current;
    if (!c) return;
    void c.setLookAt(...homeView(aspect, FOV), false);
  }, [aspect]);

  // Animated return to the home view when the user presses "Reset camera".
  useEffect(() => {
    if (token === 0) return;
    void controls.current?.setLookAt(...homeView(aspectRef.current, FOV), true);
  }, [token]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={5}
      maxDistance={36}
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
  const cutaway = useSelectionStore((s) => s.cutaway);
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
      {/* Floor with a soft vignette */}
      <Floor theme={theme} />
      <Grid
        position={[2, 0.01, 0]}
        args={[26, 26]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={theme.grid}
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor={theme.gridStrong}
        fadeDistance={24}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
      <ContactShadows
        position={[2, 0.02, 0]}
        scale={26}
        blur={2.6}
        opacity={theme.dark ? 0.6 : 0.38}
        far={5}
        resolution={512}
        frames={reducedMotion ? 1 : Infinity}
      />

      {/* Ambient dust, decorative */}
      {!reducedMotion && (
        <Sparkles
          count={40}
          scale={[16, 6, 12]}
          position={[2, 3, 0]}
          size={1.6}
          speed={0.18}
          color={theme.glow}
          opacity={0.35}
        />
      )}

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
        running={running}
        theme={theme}
        reducedMotion={reducedMotion}
      />

      {candidateId && (
        <group position={PRODUCT_POSITION}>
          <CandidateProduct
            key={candidateId}
            theme={theme}
            reducedMotion={reducedMotion}
            cutaway={cutaway}
          />
        </group>
      )}
    </group>
  );
}

function Floor({ theme }: { theme: SceneTheme }) {
  const texture = useMemo(
    () => radialTexture(theme.floor, theme.bg2),
    [theme.floor, theme.bg2],
  );
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[2, -0.01, 0]}
      receiveShadow
    >
      <circleGeometry args={[13, 96]} />
      <meshStandardMaterial map={texture} roughness={0.95} />
    </mesh>
  );
}
