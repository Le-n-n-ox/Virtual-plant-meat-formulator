"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useTheme } from "next-themes";
import type { Mesh, MeshStandardMaterial } from "three";
import { THEMES } from "@/lib/themes";
import { SceneErrorBoundary } from "@/scene/SceneErrorBoundary";
import { SceneLights } from "@/scene/SceneCanvas";
import { PantryShelf } from "@/scene/drag/PantryShelf";
import { Bench } from "@/scene/objects/Bench";
import { applyMaterialTints, useSceneTheme } from "@/scene/theme/sceneTheme";
import type { IngredientListItem } from "@/types";

/**
 * Look-development page (guide §12.10 step 6): one model under the real scene
 * lighting, with the six themes on a cycle. Blender's viewport uses different
 * tone mapping and lighting from the web scene, so assets are judged here.
 */

const ASSETS = [
  { id: "bench", label: "Bench", url: "/scene/assets/bench/bench.glb" },
  { id: "crops", label: "Crops", url: "/scene/assets/crops/crops.glb" },
  {
    id: "ingredient-bin",
    label: "Ingredient bin",
    url: "/scene/assets/ingredient-bin/ingredient-bin.glb",
  },
  {
    id: "mixing-vessel",
    label: "Mixing vessel",
    url: "/scene/assets/mixing-vessel/mixing-vessel.glb",
  },
  {
    id: "processing-line",
    label: "Processing line",
    url: "/scene/assets/processing-line/processing-line.glb",
  },
  {
    id: "candidate-patty",
    label: "Candidate patty",
    url: "/scene/assets/candidate-patty/patty.glb",
  },
] as const;

/**
 * The composed bench: `Bench` plus `PantryShelf` with real crop models on its
 * sockets. This is the view to judge the drag-and-drop bench in, because the
 * individual assets say nothing about how container, topper and socket line up.
 */
const COMPOSED_ID = "pantry-bench";

type AssetId = (typeof ASSETS)[number]["id"] | typeof COMPOSED_ID;

/** Stand-in crops, so the lab needs no backend. */
const LAB_CROPS: IngredientListItem[] = [
  ["Sorghum flour", "Sorghum", "flour"],
  ["Cowpea, whole", "Cowpea", "raw"],
  ["Green gram", "Green gram", "raw"],
  ["Maize meal", "Maize", "flour"],
  ["Groundnut oil", "Groundnut", "oil"],
  ["Millet, soaked", "Millet", "soaked"],
  ["Pigeon pea isolate", "Pigeon pea", "protein isolate"],
  ["Sesame seed", "Sesame", "raw"],
].map(([common_name, crop, form], index) => ({
  id: `lab_${index}`,
  common_name,
  crop,
  form,
  scientific_name: null,
  moisture_basis: "as is",
  source: { id: "lab", name: "Scene lab" },
  protein_g_per_100g: null,
  has_amino_acids: false,
}));

function ComposedBench() {
  const theme = useSceneTheme();
  return (
    <group>
      <Bench theme={theme} />
      <PantryShelf
        items={LAB_CROPS}
        inDraft={new Set([LAB_CROPS[3].id])}
        theme={theme}
        reducedMotion={false}
      />
    </group>
  );
}

function LabModel({ url }: { url: string }) {
  const theme = useSceneTheme();
  const { scene } = useGLTF(url);
  const clone = useMemo(() => {
    const copy = scene.clone(true);
    applyMaterialTints(copy, theme);
    copy.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const materials = (
        Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      ) as MeshStandardMaterial[];
      let glass = false;
      for (const material of materials) {
        if (material.transparent && material.opacity < 0.6) glass = true;
      }
      mesh.castShadow = !glass;
      mesh.receiveShadow = true;
    });
    return copy;
  }, [scene, theme]);
  return <primitive object={clone} />;
}

export function SceneLab() {
  const [assetId, setAssetId] = useState<AssetId>(COMPOSED_ID);
  const asset = ASSETS.find((a) => a.id === assetId) ?? ASSETS[0];
  const { theme, setTheme } = useTheme();
  const sceneTheme = useSceneTheme();
  const current = THEMES.find((t) => t.id === theme);

  return (
    <main className="flex h-dvh flex-col gap-3 p-4">
      <header className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-h3 font-semibold tracking-tight">Scene lab</h1>
          <p className="text-caption text-muted-foreground">
            Development only · one model under the real lighting · six themes
          </p>
        </div>
        <label className="flex items-center gap-2 text-small">
          Model
          <select
            value={assetId}
            onChange={(e) => setAssetId(e.target.value as AssetId)}
            className="rounded-md border bg-background px-2 py-1"
          >
            <option value={COMPOSED_ID}>Pantry bench (composed)</option>
            {ASSETS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-small">
          Theme
          <select
            value={theme ?? "light"}
            onChange={(e) => setTheme(e.target.value)}
            className="rounded-md border bg-background px-2 py-1"
          >
            {THEMES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <span className="text-caption text-muted-foreground">
          {current?.label ?? ""} · drag to orbit · the model is tinted by
          material name
        </span>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border bg-card">
        <SceneErrorBoundary
          label="Scene lab"
          fallback={
            <p className="p-4 text-small">The model could not be loaded.</p>
          }
        >
          <Canvas
            shadows
            dpr={[1, 2]}
            camera={{ position: [6, 6, 10], fov: 32, near: 0.1, far: 120 }}
          >
            <SceneLights theme={sceneTheme} />
            <Suspense fallback={null}>
              {assetId === COMPOSED_ID ? (
                <ComposedBench />
              ) : (
                <LabModel url={asset.url} />
              )}
            </Suspense>
          </Canvas>
        </SceneErrorBoundary>
      </div>
    </main>
  );
}
