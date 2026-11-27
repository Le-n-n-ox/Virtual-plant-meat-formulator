"use client";

import { useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import { Mesh, Object3D, Vector3, type MeshStandardMaterial } from "three";
import { SceneErrorBoundary } from "../SceneErrorBoundary";
import { applyMaterialTints, type SceneTheme } from "../theme/sceneTheme";
import { setBenchSockets, type Vec3Tuple } from "./benchSockets";

export const BENCH_URL = "/scene/assets/bench/bench.glb";

/**
 * The workbench (guide §12.2): bench top, pantry shelf, return tray, product
 * board and the two compare plinths, as one Blender-authored asset. Its Empty
 * sockets are registered with `benchSockets` on load, so the drop targets and
 * the pantry slots read their positions from the asset instead of repeating
 * them in code.
 */
function LoadedBench({ theme }: { theme: SceneTheme }) {
  const { scene } = useGLTF(BENCH_URL);

  const prepared = useMemo(() => {
    const copy = scene.clone(true);
    applyMaterialTints(copy, theme);

    const sockets: Record<string, Vec3Tuple> = {};
    const world = new Vector3();
    copy.updateWorldMatrix(true, true);
    copy.traverse((child: Object3D) => {
      if (child.name.startsWith("Socket_")) {
        child.getWorldPosition(world);
        sockets[child.name] = [world.x, world.y, world.z];
        return;
      }
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const materials = (
        Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      ) as MeshStandardMaterial[];
      // The bench is what everything else sits on, so it takes shadows but
      // only the raised parts cast them.
      mesh.receiveShadow = true;
      mesh.castShadow = materials.every((m) => !m.transparent);
      for (const material of materials) {
        // A fully metallic surface has no diffuse component, so any face the
        // three lightformers miss renders black — the plinth sides did. Keep
        // the satin-metal look but leave a diffuse floor, because §12.4 rules
        // out pure black anywhere in the scene.
        if (material.metalness > 0.9) material.metalness = 0.62;
      }
    });
    setBenchSockets(sockets);
    return copy;
  }, [scene, theme]);

  return <primitive object={prepared} />;
}

/**
 * Procedural stand-in: a bench top and a shelf slab, so a failed asset load
 * still gives the objects a surface to stand on rather than leaving them
 * floating. The sockets keep their authored positions in that case.
 */
function BenchFallback({ theme }: { theme: SceneTheme }) {
  return (
    <group>
      <mesh position={[0.8, -0.21, 0]} receiveShadow>
        <boxGeometry args={[14.6, 0.42, 7.2]} />
        <meshStandardMaterial color={theme.floor} roughness={0.78} />
      </mesh>
      <mesh position={[-4.9, 0.86, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.12, 2.2]} />
        <meshStandardMaterial color={theme.surface} roughness={0.7} />
      </mesh>
      <mesh position={[2, 0.07, -2.5]} receiveShadow>
        <boxGeometry args={[1.5, 0.14, 1.1]} />
        <meshStandardMaterial color={theme.surface} roughness={0.7} />
      </mesh>
    </group>
  );
}

export function Bench({ theme }: { theme: SceneTheme }) {
  return (
    <SceneErrorBoundary
      fallback={<BenchFallback theme={theme} />}
      label="Scene asset bench.glb"
    >
      <Suspense fallback={<BenchFallback theme={theme} />}>
        <LoadedBench theme={theme} />
      </Suspense>
    </SceneErrorBoundary>
  );
}
