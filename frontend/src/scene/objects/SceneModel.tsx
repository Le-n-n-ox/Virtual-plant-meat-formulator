"use client";

import { Suspense, useMemo, type ReactNode } from "react";
import { useGLTF } from "@react-three/drei";
import { Mesh, type MeshStandardMaterial } from "three";
import { SceneErrorBoundary } from "../SceneErrorBoundary";

export interface SceneModelProps {
  /** Public URL of the GLB, e.g. "/scene/assets/mixing-vessel/mixing-vessel.glb". */
  url: string;
  /** Shown while the GLB downloads. */
  placeholder: ReactNode;
  /**
   * Shown if the GLB cannot be loaded, so a missing asset degrades to the
   * procedural geometry instead of losing the object.
   */
  fallback: ReactNode;
  /**
   * Maps a Blender material name to a theme colour, e.g.
   * `{ PattyCrust: theme.product }`. Keeps a GLB on the same tokens as the
   * procedural geometry it replaces.
   */
  tints?: Record<string, string>;
}

function LoadedModel({
  url,
  tints,
}: {
  url: string;
  tints?: Record<string, string>;
}) {
  const { scene } = useGLTF(url);
  // useGLTF caches a single object per URL; clone it so several instances of
  // the same asset (e.g. every ingredient bin) can be mounted at once.
  const clone = useMemo(() => {
    const copy = scene.clone(true);
    copy.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const materials = (
        Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      ) as MeshStandardMaterial[];
      let glass = false;
      for (const material of materials) {
        const tint = tints?.[material.name];
        if (tint && material.color) material.color.set(tint);
        if (material.transparent && material.opacity < 0.6) glass = true;
      }
      // Glass must not cast a solid shadow; the shells should.
      mesh.castShadow = !glass;
      mesh.receiveShadow = true;
    });
    return copy;
  }, [scene, tints]);
  return <primitive object={clone} />;
}

/**
 * Loads a Blender-authored GLB from src/scene/assets. The asset shows a
 * placeholder while loading and the procedural geometry if it fails, so the
 * scene never loses an object and the 2D fallback still covers total failure.
 */
export function SceneModel({
  url,
  placeholder,
  fallback,
  tints,
}: SceneModelProps) {
  return (
    <SceneErrorBoundary fallback={fallback} label={`Scene asset ${url}`}>
      <Suspense fallback={placeholder}>
        <LoadedModel url={url} tints={tints} />
      </Suspense>
    </SceneErrorBoundary>
  );
}

/** Warms the useGLTF cache for the assets the scene mounts on first paint. */
export function preloadSceneAssets(urls: string[]) {
  for (const url of urls) void useGLTF.preload(url);
}
