"use client";

import {
  CameraControls,
  ContactShadows,
  Environment,
  Lightformer,
} from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CanvasTexture,
  NeutralToneMapping,
  SRGBColorSpace,
  Vector3,
} from "three";
import { useShallow } from "zustand/react/shallow";
import { useFormulationStore } from "@/stores/formulationStore";
import { useDragStore } from "@/stores/dragStore";
import { usePlacementStore } from "@/stores/placementStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { isTerminal, useJobStore } from "@/stores/jobStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { DragGhost } from "./drag/DragGhost";
import { DragLayer } from "./drag/DragLayer";
import { DropRing } from "./drag/DropRing";
import { placeHeld } from "./drag/actions";
import { PerformanceGate } from "./performance/PerformanceGate";
import {
  useDprCap,
  useReducedMotionPreference,
} from "./hooks/useSceneEnvironment";
import { useInvalidateWhile } from "./hooks/useInvalidateWhile";
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
  stationStatuses,
} from "./stations";
import { type SceneTheme, cropColor, useSceneTheme } from "./theme/sceneTheme";

const FOV = 32;
/** Orbit limits (guide §12.4): ±40° around home, 15°–65° of elevation. */
const HOME_TARGET = new Vector3(2.4, 0.6, 0);
const HOME_DIRECTION = new Vector3(0, 0.46, 1).normalize();
const AZIMUTH_LIMIT = (40 * Math.PI) / 180;
const MIN_POLAR = ((90 - 65) * Math.PI) / 180;
const MAX_POLAR = ((90 - 15) * Math.PI) / 180;
/** Half-size of the content to keep in view (world units). */
const HALF_EXTENT = { x: 6.9, y: 2.7 };

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
  /** Camera orbit is locked for the duration of a drag (guide §12.3). */
  const dragging = useDragStore((s) => s.active);
  const jobActive = useJobStore(
    (s) => s.status === "running" || s.status === "queued",
  );
  /** 2 desktop, 1.5 on a phone (guide §12.11). */
  const baseDpr = useDprCap();
  const [shadows, setShadows] = useState(true);
  const setPerformanceNotice = usePreferencesStore(
    (s) => s.setPerformanceNotice,
  );
  const giveUp = useCallback(() => {
    setPerformanceNotice(
      "The 3D view could not hold a comfortable frame rate, so the 2D view is shown instead. Every control remains available there.",
    );
  }, [setPerformanceNotice]);

  /**
   * On demand whenever nothing is moving: no drag, no active job, and no
   * animation asking for frames. The animated components invalidate themselves,
   * so the frame loop can sleep.
   */
  const frameloop = dragging || jobActive ? "always" : "demand";

  return (
    <Canvas
      shadows={shadows}
      dpr={[1, baseDpr]}
      frameloop={frameloop}
      camera={{ position: [2.1, 9, 20], fov: FOV, near: 0.1, far: 140 }}
      gl={{
        antialias: true,
        preserveDrawingBuffer: false,
        // Neutral keeps the crop and status colours close to their CSS tokens;
        // ACES Filmic desaturates them.
        toneMapping: NeutralToneMapping,
      }}
      aria-hidden
      onPointerMissed={() =>
        useSelectionStore.getState().selectIngredient(null)
      }
    >
      <color attach="background" args={[theme.bg]} />
      <fog attach="fog" args={[theme.bg, 26, 52]} />
      <PerformanceGate
        baseDpr={baseDpr}
        onShadowsOff={() => setShadows(false)}
        onGiveUp={giveUp}
      >
        <SceneLights theme={theme} />
        <Backdrop theme={theme} />
        <Stage theme={theme} reducedMotion={reducedMotion} />
      </PerformanceGate>
      <DragLayer />
      <DragGhost theme={theme} />
      <Camera dragging={dragging} />
      <LabelProjector />
    </Canvas>
  );
}

export function SceneLights({ theme }: { theme: SceneTheme }) {
  /**
   * Three roles (guide §12.4): a warm key from the front left and above that
   * casts the only real-time shadow, a soft cooler fill from the sky side, and
   * a rim from behind on the right to separate objects from the background.
   */
  return (
    <>
      <ambientLight intensity={theme.ambient} />
      <hemisphereLight args={[theme.bg, theme.floor, 0.55]} />
      <directionalLight
        position={[-6, 12, 7]}
        intensity={theme.key_light}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={9}
        shadow-camera-bottom={-9}
        shadow-bias={-0.0004}
      />
      <directionalLight
        position={[0, 10, -9]}
        intensity={theme.key_light * 0.45}
        color={theme.bg}
      />
      <directionalLight
        position={[8, 6, -9]}
        intensity={theme.key_light * 0.5}
        color={theme.glow}
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

/** Vertical two-tone gradient with a gentle vignette (guide §12.4). */
function backgroundTexture(top: string, bottom: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 2;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, top);
    grad.addColorStop(1, bottom);
    g.fillStyle = grad;
    g.fillRect(0, 0, 2, 256);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Soft glow on the back wall, giving the schematic some depth. */
function Backdrop({ theme }: { theme: SceneTheme }) {
  const texture = useMemo(
    () => backgroundTexture(theme.bg, theme.bg2),
    [theme.bg, theme.bg2],
  );
  return (
    <mesh position={[2, 6, -18]} scale={[60, 30, 1]}>
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

function Camera({ dragging }: { dragging: boolean }) {
  const controls = useRef<CameraControls>(null);
  const gl = useThree((s) => s.gl);
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

  // Double-click anywhere on the canvas returns to the home view.
  useEffect(() => {
    const element = gl.domElement;
    const onDoubleClick = () => {
      void controls.current?.setLookAt(
        ...homeView(aspectRef.current, FOV),
        true,
      );
    };
    element.addEventListener("dblclick", onDoubleClick);
    return () => element.removeEventListener("dblclick", onDoubleClick);
  }, [gl]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      enabled={!dragging}
      minDistance={8}
      maxDistance={26}
      minPolarAngle={MIN_POLAR}
      maxPolarAngle={MAX_POLAR}
      minAzimuthAngle={-AZIMUTH_LIMIT}
      maxAzimuthAngle={AZIMUTH_LIMIT}
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
  const draft = useFormulationStore((s) => s.draft);
  const catalog = useFormulationStore((s) => s.catalog);
  const held = usePlacementStore((s) => s.held);
  const selectedId = useSelectionStore((s) => s.selectedIngredientId);
  const selectIngredient = useSelectionStore((s) => s.selectIngredient);
  const job = useJobStore(
    useShallow((s) => ({
      status: s.status,
      jobType: s.jobType,
      stages: s.stages,
      currentStage: s.currentStage,
      candidateIds: s.candidateIds,
    })),
  );
  const selectedCandidate = useSelectionStore((s) => s.selectedCandidateId);
  const cutaway = useSelectionStore((s) => s.cutaway);
  const [flows, setFlows] = useState<Flow[]>([]);
  /** On-demand rendering: keep asking for frames while a pour is in flight. */
  useInvalidateWhile(flows.length > 0);

  const lines = useMemo(() => validated?.lines ?? [], [validated]);
  /**
   * A bin is "pending" from the moment it is dropped until the debounced
   * validation snapshot contains it (guide §12.3). The solid style is only
   * ever drawn from `validated`.
   */
  const pendingIds = useMemo(() => {
    const known = new Set(lines.map((l) => l.ingredient_id));
    return new Set(
      draft.map((l) => l.ingredient_id).filter((id) => !known.has(id)),
    );
  }, [draft, lines]);
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
  const stationStatusMap = stationStatuses({
    jobType: job.jobType,
    status: job.status,
    stages: job.stages,
    currentStage: job.currentStage,
  });
  const mixingStatus = stationStatusMap.mixing;
  const totalInvalid = validated ? !validated.result.valid : false;
  // Job stage colour takes precedence; otherwise flag an invalid total in amber.
  const vesselHighlight =
    mixingStatus || (running && !isTerminal(job.status))
      ? theme[stageColorKey(mixingStatus ?? "active")]
      : totalInvalid
        ? theme.warning
        : null;
  const candidateId = selectedCandidate ?? job.candidateIds.at(-1) ?? null;

  /** A bin pressed in the scene starts a drag (the pointer layer takes over). */
  const beginBinDrag = (id: string) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const label = catalog[id]?.common_name ?? id;
    useDragStore.getState().begin({
      kind: "bin",
      id,
      source: "scene",
      origin: { x: e.clientX, y: e.clientY },
      pointerId: e.pointerId,
      label,
    });
  };

  return (
    <group>
      {/* Floor with a soft vignette; the grid was removed (guide §12.4). */}
      <Floor theme={theme} />
      <ContactShadows
        position={[2, 0.02, 0]}
        scale={26}
        blur={2.6}
        opacity={theme.dark ? 0.6 : 0.38}
        far={5}
        resolution={512}
        frames={1}
        key={`contact-${lines.length}`}
      />

      <group
        position={VESSEL_POSITION}
        onClick={(e) => {
          // Click-to-place: clicking the vessel places the held ingredient.
          if (!held) return;
          e.stopPropagation();
          void placeHeld(
            held,
            "vessel",
            useFormulationStore.getState().catalog,
          );
        }}
      >
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
        <DropRing theme={theme} />
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
            pending={pendingIds.has(line.ingredient_id)}
            draftPercent={
              draft.find((l) => l.ingredient_id === line.ingredient_id)
                ?.percent ?? null
            }
            theme={theme}
            reducedMotion={reducedMotion}
            onSelect={selectIngredient}
            onBeginDrag={(e) => beginBinDrag(line.ingredient_id)(e)}
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
        statuses={stationStatusMap}
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
