"use client";

import { useGLTF } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import {
  type BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { SceneErrorBoundary } from "../SceneErrorBoundary";
import type { SceneTheme } from "../theme/sceneTheme";
import {
  CONTAINER_NODE,
  containerForForm,
  topperColor,
  topperForCrop,
} from "../cropModels";

export const CROPS_URL = "/scene/assets/crops/crops.glb";

export interface CropModelProps {
  /** Ingredient form: picks the container (crate, sack, jar, bottle). */
  form?: string | null;
  /** Crop name: picks the topper, else `Crop_Generic`. */
  crop?: string | null;
  theme: SceneTheme;
  /** Translucent while a dropped ingredient awaits validation (guide §12.3). */
  opacity?: number;
}

/**
 * One ingredient as a physical object: a container chosen by the ingredient's
 * form with a heap of its crop on top (guide §12.8). The catalogue holds
 * hundreds of foods, so crops are not modelled one by one — this is the
 * container-plus-topper scheme the asset kit was built for.
 *
 * `crops.glb` lays every container and topper out in a row along X so they can
 * be picked by name; both parts are re-centred on the group origin here, with
 * their authored heights kept, so the pair stands correctly on a socket.
 */
function LoadedCropModel({ form, crop, theme, opacity = 1 }: CropModelProps) {
  const { scene } = useGLTF(CROPS_URL);
  const containerName = CONTAINER_NODE[containerForForm(form)];
  const topperName = topperForCrop(crop);

  const built = useMemo(() => {
    const group = new Group();
    const transparent = opacity < 1;

    const container = flattenPart(scene, containerName);
    let rim = 0.5;
    if (container) {
      const material = new MeshStandardMaterial({
        // A shade off the bench's own surface tone. The containers stay
        // neutral — crops are the only saturated things in the scene (guide
        // §12.4) — but they need to separate from the shelf they stand on.
        color: containerTone(theme.surface),
        roughness: 0.62,
        transparent,
        opacity,
        depthWrite: !transparent,
      });
      container.computeBoundingBox();
      rim = container.boundingBox?.max.y ?? rim;
      group.add(meshFor(container, material, transparent));
    }

    const topper = flattenPart(scene, topperName);
    if (topper) {
      // The toppers share one `MAT_Natural` in the asset, so each crop's own
      // colour is set per instance here (guide §12.9, "MAT_Crop … per
      // instance"). These are the only untinted colours in the scene.
      const material = new MeshStandardMaterial({
        color: topperColor(topperName),
        roughness: 0.78,
        transparent,
        opacity,
        depthWrite: !transparent,
      });
      const mesh = meshFor(topper, material, transparent);
      // Every heap is authored at the crate's rim, so a taller container (a
      // sack, jar or bottle) would swallow it. Seat the heap on whichever
      // container it was paired with, nestled slightly into the opening.
      topper.computeBoundingBox();
      const base = topper.boundingBox?.min.y ?? 0;
      mesh.position.y = rim - base - 0.06;
      group.add(mesh);
    }

    return group;
  }, [scene, containerName, topperName, theme.surface, opacity]);

  return <primitive object={built} />;
}

/**
 * The container's own tone: the theme's surface, stepped away from it so the
 * container reads as a different material from the shelf. Light themes darken,
 * dark themes lighten, so the separation survives all six.
 */
function containerTone(surface: string): Color {
  const colour = new Color(surface);
  const lightness = colour.getHSL({ h: 0, s: 0, l: 0 }).l;
  return colour.offsetHSL(0, 0.01, lightness > 0.5 ? -0.09 : 0.08);
}

/** One mesh from a merged geometry, with shadows unless it is see-through. */
function meshFor(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  transparent: boolean,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = !transparent;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Merged geometry for one named part of `crops.glb`, in the group's own space.
 *
 * A topper is nine separate grain meshes in the asset; merging them means a
 * pantry of eight crops costs 16 draw calls rather than 80, which is what keeps
 * the scene inside the budget in guide §12.8. The result is cached per part
 * name and shared by every instance, so the eight shelf crops and the carried
 * one reuse the same geometry.
 */
const mergedParts = new Map<string, BufferGeometry | null>();

function flattenPart(scene: Object3D, name: string): BufferGeometry | null {
  const cached = mergedParts.get(name);
  if (cached !== undefined) return cached;

  const source = scene.getObjectByName(name);
  if (!source) {
    mergedParts.set(name, null);
    return null;
  }

  // Bake each mesh's own transform in, relative to the part's root, then drop
  // the asset's row offset in X and Z so the part stands on the origin.
  const root = source.clone(true);
  root.position.set(0, root.position.y, 0);
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();

  const geometries: BufferGeometry[] = [];
  root.traverse((child: Object3D) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
    // Merging needs one attribute set; UVs and colours are unused here.
    for (const attribute of Object.keys(geometry.attributes)) {
      if (attribute !== "position" && attribute !== "normal") {
        geometry.deleteAttribute(attribute);
      }
    }
    geometries.push(geometry);
  });

  const merged =
    geometries.length === 0
      ? null
      : geometries.length === 1
        ? geometries[0]
        : mergeGeometries(geometries, false);
  // The part keeps its authored height: the topper rests on the container rim.
  merged?.translate(0, root.position.y, 0);
  mergedParts.set(name, merged);
  return merged;
}

/** Crate-sized stand-in while the asset loads or if it cannot be loaded. */
function CropFallback({
  theme,
  crop,
  opacity = 1,
}: {
  theme: SceneTheme;
  crop?: string | null;
  opacity?: number;
}) {
  const transparent = opacity < 1;
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.62, 0.5, 0.62]} />
        <meshStandardMaterial
          color={theme.surface}
          roughness={0.7}
          transparent={transparent}
          opacity={opacity}
        />
      </mesh>
      <mesh position={[0, 0.54, 0]} castShadow>
        <sphereGeometry args={[0.2, 16, 12]} />
        <meshStandardMaterial
          color={topperColor(topperForCrop(crop))}
          roughness={0.85}
          transparent={transparent}
          opacity={opacity}
        />
      </mesh>
    </group>
  );
}

export function CropModel(props: CropModelProps) {
  const fallback = (
    <CropFallback
      theme={props.theme}
      crop={props.crop}
      opacity={props.opacity}
    />
  );
  return (
    <SceneErrorBoundary fallback={fallback} label="Scene asset crops.glb">
      <Suspense fallback={fallback}>
        <LoadedCropModel {...props} />
      </Suspense>
    </SceneErrorBoundary>
  );
}
