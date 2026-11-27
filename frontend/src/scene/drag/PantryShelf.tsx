"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { useRef, useState } from "react";
import { type Group, MathUtils } from "three";
import { useDragStore } from "@/stores/dragStore";
import { usePlacementStore } from "@/stores/placementStore";
import type { IngredientListItem } from "@/types";
import { useInvalidateWhile } from "../hooks/useInvalidateWhile";
import { CropModel } from "../objects/CropModel";
import {
  PANTRY_SOCKETS,
  benchSocket,
  type Vec3Tuple,
} from "../objects/benchSockets";
import type { SceneTheme } from "../theme/sceneTheme";

/**
 * The pantry (guide §12.2): a 3D mirror of the ingredient picker's current
 * search results, standing on the bench's eight pantry sockets. Each crop is a
 * drag source; a crop already in the formulation is dimmed and refuses a drag,
 * which is the "unavailable" state in §12.6.
 *
 * Click-to-place and the keyboard equivalent live in the HTML pantry panel
 * beside the canvas, so nothing here is the only way to do anything.
 */
export function PantryShelf({
  items,
  inDraft,
  theme,
  reducedMotion,
}: {
  /** Crops to show, in order; only the first eight fit on the shelf. */
  items: IngredientListItem[];
  /** Ids already in the draft: shown dimmed and not draggable. */
  inDraft: Set<string>;
  theme: SceneTheme;
  reducedMotion: boolean;
}) {
  return (
    <group>
      {items.slice(0, PANTRY_SOCKETS.length).map((item, index) => (
        <PantryCrop
          key={item.id}
          ingredient={item}
          socket={benchSocket(PANTRY_SOCKETS[index])}
          unavailable={inDraft.has(item.id)}
          theme={theme}
          reducedMotion={reducedMotion}
        />
      ))}
    </group>
  );
}

function PantryCrop({
  ingredient,
  socket,
  unavailable,
  theme,
  reducedMotion,
}: {
  ingredient: IngredientListItem;
  socket: Vec3Tuple;
  unavailable: boolean;
  theme: SceneTheme;
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  const [hovered, setHovered] = useState(false);
  const carried = useDragStore(
    (s) => s.active && s.kind === "ingredient" && s.id === ingredient.id,
  );
  const held = usePlacementStore((s) => s.held?.id === ingredient.id);

  /**
   * On-demand rendering: ask for frames only while the pop-in, hover lift or
   * hand-off to the drag ghost is still moving, then let the canvas sleep.
   */
  const [settling, setSettling] = useState(true);
  const settlingRef = useRef(true);
  useInvalidateWhile(settling);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta * 9);
    const lift = hovered && !unavailable ? 0.06 : 0;
    // The carried copy is drawn by the drag ghost, so the shelf copy drops out
    // of the way rather than being carried and left behind at once.
    const scale = carried ? 0.001 : 1;
    g.position.y = MathUtils.lerp(g.position.y, socket[1] + lift, k);
    g.scale.setScalar(MathUtils.lerp(g.scale.x, scale, k));
    const moving =
      Math.abs(g.position.y - (socket[1] + lift)) > 0.002 ||
      Math.abs(g.scale.x - scale) > 0.01;
    if (moving !== settlingRef.current) {
      settlingRef.current = moving;
      setSettling(moving);
    }
  });

  const beginDrag = (event: ThreeEvent<PointerEvent>) => {
    if (unavailable) return;
    event.stopPropagation();
    useDragStore.getState().begin({
      kind: "ingredient",
      id: ingredient.id,
      source: "pantry",
      origin: { x: event.clientX, y: event.clientY },
      pointerId: event.pointerId,
      label: ingredient.common_name,
      // Where a cancelled drag returns to (guide §12.5).
      originWorld: { x: socket[0], y: socket[1], z: socket[2] },
    });
  };

  return (
    <group
      ref={group}
      position={[socket[0], socket[1], socket[2]]}
      scale={reducedMotion ? 1 : 0.001}
      onPointerDown={beginDrag}
      onPointerOver={(event: ThreeEvent<PointerEvent>) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = unavailable ? "not-allowed" : "grab";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      <CropModel
        form={ingredient.form}
        crop={ingredient.crop}
        theme={theme}
        opacity={unavailable ? 0.35 : 1}
      />
      {/* Enlarged invisible hit volume: a draggable needs a 44 px target even
          when its model is smaller (guide §12.3). */}
      <mesh visible={false} position={[0, 0.34, 0]}>
        <boxGeometry args={[0.78, 0.86, 0.78]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {(hovered || held) && !unavailable && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
          <ringGeometry args={[0.34, 0.4, 32]} />
          <meshBasicMaterial
            color={theme.accent}
            transparent
            opacity={held ? 0.95 : 0.6}
            toneMapped={false}
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
