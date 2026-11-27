"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Group, MathUtils, type MeshBasicMaterial } from "three";
import { useDragStore } from "@/stores/dragStore";
import { useFormulationStore } from "@/stores/formulationStore";
import { useInvalidateWhile } from "../hooks/useInvalidateWhile";
import { CropModel } from "../objects/CropModel";
import { cropColor, type SceneTheme } from "../theme/sceneTheme";
import { CARRY_TOP, tiltForVelocity } from "./dragMath";
import { sceneDropTargets } from "./dropTargets";
import {
  DROP_SETTLE_MS,
  REJECT_SHAKE_MS,
  RETURN_MS,
  blobShadow,
  clamp01,
  easeOut,
  returnArc,
  settleScaleXZ,
  settleScaleY,
  shakeOffset,
  snapToward,
} from "./releaseAnimation";

const CARRY_SCALE = 1.05;

/**
 * The object under the pointer during a drag (guide §12.3, §12.5): the real
 * container-and-crop model, raised and scaled, pulled gently toward the socket
 * of whatever it is over, tilting into its direction of travel, above a blob
 * shadow that shrinks and fades as it rises.
 *
 * On release it keeps animating for a moment after the drag state has ended:
 * a dropped object settles into the socket with a squash, a cancelled one
 * returns along a low arc, and a rejected one shakes first. The drag store
 * holds that release and clears it when the animation has had its time.
 *
 * Rendered only while the pointer is inside the canvas; outside it the HTML
 * chip represents the drag instead.
 */
export function DragGhost({
  theme,
  reducedMotion,
}: {
  theme: SceneTheme;
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const inner = useRef<Group>(null);
  const shadow = useRef<Group>(null);
  const shadowMaterial = useRef<MeshBasicMaterial>(null);
  const previous = useRef<{ x: number; z: number } | null>(null);

  const phase = useDragStore((s) => s.phase);
  const world = useDragStore((s) => s.world);
  const inCanvas = useDragStore((s) => s.inCanvas);
  const kind = useDragStore((s) => s.kind);
  const id = useDragStore((s) => s.id);
  const target = useDragStore((s) => s.target);
  const release = useDragStore((s) => s.release);
  const catalog = useFormulationStore((s) => s.catalog);
  const validated = useFormulationStore((s) => s.validated);

  const carrying =
    (phase === "carry" || phase === "over-target") &&
    inCanvas &&
    world !== null;
  /** A release only animates in the canvas, and never under reduced motion. */
  const releasing = release !== null && !reducedMotion && inCanvas;
  const visible = carrying || releasing;

  // The release animation runs after the pointer is up, so it has to keep
  // asking for frames itself: the canvas sleeps as soon as the drag ends.
  useInvalidateWhile(releasing);

  useFrame((_, delta) => {
    const g = group.current;
    const innerGroup = inner.current;
    if (!g || !innerGroup) return;
    g.visible = visible;
    if (!visible) {
      previous.current = null;
      return;
    }

    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 14);

    /** Keeps the blob shadow under the object, shrinking as it rises. */
    const updateShadow = (height: number) => {
      const s = shadow.current;
      if (!s) return;
      const blob = blobShadow(Math.max(0, height), CARRY_TOP);
      s.position.set(g.position.x, 0.02, g.position.z);
      s.scale.setScalar(blob.scale);
      if (shadowMaterial.current) {
        shadowMaterial.current.opacity = blob.opacity;
      }
    };

    if (releasing && release) {
      // --- after release: settle, return arc, or shake then return ---
      const elapsed =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        release.startedAt;

      if (release.outcome === "drop") {
        const t = clamp01(elapsed / DROP_SETTLE_MS);
        const e = easeOut(Math.min(1, t * 1.6));
        g.position.set(
          release.from.x + (release.to.x - release.from.x) * e,
          release.from.y + (release.to.y - release.from.y) * e,
          release.from.z + (release.to.z - release.from.z) * e,
        );
        innerGroup.scale.set(
          settleScaleXZ(t),
          settleScaleY(t),
          settleScaleXZ(t),
        );
        g.rotation.z = 0;
      } else {
        const shakeFor = release.outcome === "reject" ? REJECT_SHAKE_MS : 0;
        if (elapsed < shakeFor) {
          const t = clamp01(elapsed / shakeFor);
          g.position.set(
            release.from.x + shakeOffset(t),
            release.from.y,
            release.from.z,
          );
          g.rotation.z = shakeOffset(t) * 0.6;
        } else {
          const t = clamp01((elapsed - shakeFor) / RETURN_MS);
          const p = returnArc(t, release.from, release.to);
          g.position.set(p.x, p.y, p.z);
          g.rotation.z = 0;
        }
        innerGroup.scale.setScalar(MathUtils.lerp(innerGroup.scale.x, 1, k));
      }

      updateShadow(g.position.y);
      return;
    }

    if (!world) return;

    // --- carrying: follow the pointer, pulled toward a target's socket ---
    const targets = sceneDropTargets({ kind });
    let point = { x: world.x, z: world.z };
    if (target) {
      const match = targets
        .filter((t) => t.id === target)
        .map((t) => ({
          t,
          d: Math.hypot(world.x - t.x, world.z - t.z),
        }))
        .sort((a, b) => a.d - b.d)[0];
      if (match) {
        point = snapToward(
          point,
          { x: match.t.x, z: match.t.z },
          match.d,
          match.t.radius ?? 0.9,
        );
      }
    }

    const vx = previous.current
      ? (point.x - previous.current.x) / Math.max(delta, 1 / 240)
      : 0;
    previous.current = { x: point.x, z: point.z };

    g.position.x = MathUtils.lerp(g.position.x, point.x, k);
    g.position.z = MathUtils.lerp(g.position.z, point.z, k);
    g.position.y = MathUtils.lerp(g.position.y, CARRY_TOP, k);
    g.rotation.z = reducedMotion
      ? 0
      : MathUtils.lerp(g.rotation.z, -tiltForVelocity(vx), k);
    const scale = target ? CARRY_SCALE * 1.04 : CARRY_SCALE;
    innerGroup.scale.setScalar(MathUtils.lerp(innerGroup.scale.x, scale, k));
    updateShadow(g.position.y);
  });

  if (!visible) return null;

  const ingredient = catalog[id];
  const index = validated?.lines.findIndex((l) => l.ingredient_id === id) ?? -1;
  const identity = index >= 0 ? cropColor(theme, index) : theme.accent;

  return (
    <>
      <group ref={shadow}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.62, 32]} />
          <meshBasicMaterial
            ref={shadowMaterial}
            color={theme.line}
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      </group>
      <group ref={group}>
        <group ref={inner}>
          {kind === "candidate" ? (
            <mesh castShadow position={[0, 0.3, 0]}>
              <boxGeometry args={[1.1, 0.42, 1.1]} />
              <meshStandardMaterial color={theme.product} roughness={0.55} />
            </mesh>
          ) : (
            <>
              <CropModel
                form={ingredient?.form}
                crop={ingredient?.crop}
                theme={theme}
              />
              {/* The identity colour that ties this crop to its bin, table row
                  and vessel ribbon, as a band around the container's foot. */}
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
                <ringGeometry args={[0.34, 0.42, 36]} />
                <meshBasicMaterial
                  color={identity}
                  transparent
                  opacity={0.9}
                  toneMapped={false}
                  depthWrite={false}
                />
              </mesh>
            </>
          )}
        </group>
      </group>
    </>
  );
}
