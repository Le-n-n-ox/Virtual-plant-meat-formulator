"use client";

import { Canvas, useThree } from "@react-three/fiber";
import {
  ContactShadows,
  Environment,
  Lightformer,
  OrbitControls,
} from "@react-three/drei";
import { useCallback, useEffect, useRef } from "react";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CandidateProduct } from "@/scene/objects/CandidateProduct";
import { useReducedMotionPreference } from "@/scene/hooks/useSceneEnvironment";
import { useSceneTheme } from "@/scene/theme/sceneTheme";

export const HOME_VIEW = {
  position: [2.6, 2.0, 3.2] as const,
  target: [0, 0.9, 0] as const,
};

export interface ViewportPair {
  camera: Camera | null;
  controls: OrbitControlsImpl | null;
}

/**
 * A single candidate 3D viewport. Used twice on the compare page; the camera
 * lock copies the orbit position and target between the two. Controls and
 * camera are handed back through callbacks so no ref is mutated from a child.
 */
export function CandidateViewport({
  label,
  onControlsReady,
  onCameraReady,
  onUserView,
  resetToken,
}: {
  label: string;
  onControlsReady: (controls: OrbitControlsImpl | null) => void;
  onCameraReady: (camera: Camera | null) => void;
  onUserView: () => void;
  /** Changing this resets the viewport to the shared home view. */
  resetToken: number;
}) {
  const theme = useSceneTheme();
  const reducedMotion = useReducedMotionPreference();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-caption font-medium text-muted-foreground">
        Candidate {label}
      </span>
      <div className="h-64 overflow-hidden rounded-lg border">
        <Canvas
          shadows
          dpr={[1, 2]}
          frameloop={reducedMotion ? "demand" : "always"}
          camera={{
            position: [
              HOME_VIEW.position[0],
              HOME_VIEW.position[1],
              HOME_VIEW.position[2],
            ],
            fov: 40,
          }}
          aria-hidden
        >
          <color attach="background" args={[theme.bg]} />
          <ambientLight intensity={theme.ambient} />
          <directionalLight
            position={[4, 6, 4]}
            intensity={theme.key_light}
            castShadow
          />
          <Environment resolution={128} frames={1}>
            <Lightformer
              intensity={2}
              position={[0, 5, 0]}
              rotation-x={Math.PI / 2}
              scale={[8, 8, 1]}
              color={theme.glass}
            />
          </Environment>
          <CandidateProduct theme={theme} reducedMotion={reducedMotion} />
          <ContactShadows
            position={[0, -0.01, 0]}
            scale={6}
            blur={2.4}
            opacity={theme.dark ? 0.6 : 0.4}
            far={4}
          />
          <Rig
            onControlsReady={onControlsReady}
            onCameraReady={onCameraReady}
            onUserView={onUserView}
            resetToken={resetToken}
          />
        </Canvas>
      </div>
    </div>
  );
}

function Rig({
  onControlsReady,
  onCameraReady,
  onUserView,
  resetToken,
}: {
  onControlsReady: (controls: OrbitControlsImpl | null) => void;
  onCameraReady: (camera: Camera | null) => void;
  onUserView: () => void;
  resetToken: number;
}) {
  const camera = useThree((s) => s.camera);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);

  useEffect(() => {
    onCameraReady(camera);
  }, [camera, onCameraReady]);

  const handleControls = useCallback(
    (instance: OrbitControlsImpl | null) => {
      controlsRef.current = instance;
      onControlsReady(instance);
    },
    [onControlsReady],
  );

  // Reset to the shared home view when the parent asks for it.
  useEffect(() => {
    const ctl = controlsRef.current;
    if (!ctl) return;
    ctl.target.set(...HOME_VIEW.target);
    ctl.update();
  }, [resetToken]);

  return (
    <OrbitControls
      ref={handleControls}
      enablePan={false}
      minDistance={1.5}
      maxDistance={8}
      onChange={onUserView}
    />
  );
}

/**
 * Copies one viewport's camera onto the other while the lock is engaged.
 *
 * `OrbitControls.update()` fires a `change` event, which would call back into
 * this function from the other viewport and recurse forever. The depth guard
 * breaks that loop: the echo of a sync is ignored.
 */
let syncDepth = 0;

export function syncView(lock: boolean, from: ViewportPair, to: ViewportPair) {
  if (!lock || syncDepth > 0) return;
  const sourceCamera = from.camera;
  const sourceControls = from.controls;
  const targetCamera = to.camera;
  const targetControls = to.controls;
  if (!sourceCamera || !sourceControls || !targetCamera || !targetControls)
    return;
  syncDepth++;
  try {
    targetCamera.position.copy(sourceCamera.position);
    targetControls.target.copy(sourceControls.target);
    targetControls.update();
  } finally {
    syncDepth--;
  }
}
