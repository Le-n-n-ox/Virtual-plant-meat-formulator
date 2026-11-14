"use client";

import {
  ContactShadows,
  Environment,
  Float,
  Grid,
  Lightformer,
  Sparkles,
} from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  CanvasTexture,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
  Object3D,
} from "three";
import { useReducedMotionPreference } from "@/scene/hooks/useSceneEnvironment";
import { CandidateProduct } from "@/scene/objects/CandidateProduct";
import { MixingVessel } from "@/scene/objects/MixingVessel";
import { type SceneTheme, useSceneTheme } from "@/scene/theme/sceneTheme";

const SEEDS_PER_CROP = 18;
const dummy = new Object3D();

function glowTexture(color: string, alpha: number): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const g = canvas.getContext("2d");
  if (g) {
    const c = color.replace("#", "");
    const r = parseInt(c.slice(0, 2), 16);
    const gg = parseInt(c.slice(2, 4), 16);
    const b = parseInt(c.slice(4, 6), 16);
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, `rgba(${r}, ${gg}, ${b}, ${alpha})`);
    grad.addColorStop(1, `rgba(${r}, ${gg}, ${b}, 0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Decorative landing-page scene. Theme-adaptive; static under reduced motion. */
export default function HeroScene() {
  const theme = useSceneTheme();
  const reducedMotion = useReducedMotionPreference();
  const backdrop = useMemo(
    () => glowTexture(theme.glow, theme.dark ? 0.4 : 0.3),
    [theme.glow, theme.dark],
  );

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ position: [0, 3.4, 9.6], fov: 36 }}
      gl={{ alpha: true, antialias: true }}
      aria-hidden
    >
      <ambientLight intensity={theme.ambient + 0.15} />
      <hemisphereLight args={[theme.glass, theme.floor, 0.6]} />
      <directionalLight
        position={[4, 8, 5]}
        intensity={theme.key_light}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight
        position={[-5, 3, -3]}
        intensity={theme.key_light * 0.35}
      />
      <Environment key={theme.key} resolution={256} frames={1}>
        <Lightformer
          intensity={2}
          position={[0, 6, 0]}
          rotation-x={Math.PI / 2}
          scale={[10, 10, 1]}
          color={theme.glass}
        />
        <Lightformer
          intensity={1.2}
          position={[-5, 2, 2]}
          rotation-y={Math.PI / 2}
          scale={[7, 4, 1]}
          color={theme.glow}
        />
        <Lightformer
          intensity={1}
          position={[5, 3, -2]}
          rotation-y={-Math.PI / 2}
          scale={[7, 4, 1]}
          color={theme.accent}
        />
      </Environment>

      {/* Soft glow behind the composition */}
      <mesh position={[0, 1.2, -6]} scale={[16, 9, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={backdrop} transparent depthWrite={false} />
      </mesh>

      {/* Grounding: floor disc, grid and contact shadow */}
      <mesh
        position={[0, -1.14, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <circleGeometry args={[5.4, 72]} />
        <meshStandardMaterial color={theme.floor} roughness={0.95} />
      </mesh>
      <Grid
        position={[0, -1.13, 0]}
        args={[12, 12]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor={theme.grid}
        sectionSize={2}
        sectionThickness={1}
        sectionColor={theme.gridStrong}
        fadeDistance={11}
        fadeStrength={1.4}
        infiniteGrid={false}
      />
      <ContactShadows
        position={[0, -1.12, 0]}
        scale={13}
        blur={2.6}
        far={4}
        opacity={theme.dark ? 0.6 : 0.4}
        resolution={256}
        frames={reducedMotion ? 1 : Infinity}
      />

      <Rig reducedMotion={reducedMotion}>
        <group position={[0, -1.1, 0]}>
          <MixingVessel
            contents={theme.crops
              .slice(0, 3)
              .map((color, i) => ({ color, weight: [45, 30, 25][i] }))}
            working
            highlight={theme.accent}
            theme={theme}
            reducedMotion={reducedMotion}
          />
        </group>
        {theme.crops.map((color, i) => (
          <SeedRing
            key={i}
            index={i}
            color={color}
            reducedMotion={reducedMotion}
          />
        ))}
        <Float
          speed={reducedMotion ? 0 : 1.4}
          rotationIntensity={reducedMotion ? 0 : 0.5}
          floatIntensity={reducedMotion ? 0 : 0.6}
        >
          <group position={[2.35, 1.0, 0.35]} scale={1.2}>
            <CandidateProduct theme={theme} reducedMotion={reducedMotion} />
          </group>
        </Float>
      </Rig>

      {/* Decorative scan rings on the vessel rim */}
      <ScanRing theme={theme} reducedMotion={reducedMotion} delay={0} />
      <ScanRing theme={theme} reducedMotion={reducedMotion} delay={1.5} />

      {!reducedMotion && (
        <Sparkles
          count={36}
          scale={[9, 5, 7]}
          position={[0, 1.6, 0]}
          size={2}
          speed={0.2}
          color={theme.glow}
          opacity={0.4}
        />
      )}
    </Canvas>
  );
}

function Rig({
  children,
  reducedMotion,
}: {
  children: React.ReactNode;
  reducedMotion: boolean;
}) {
  const group = useRef<Group>(null);
  useFrame(({ pointer }, delta) => {
    const g = group.current;
    if (!g || reducedMotion) return;
    const k = 1 - Math.exp(-delta * 2.5);
    g.rotation.y += (pointer.x * 0.35 - g.rotation.y) * k;
    g.rotation.x += (-pointer.y * 0.12 - g.rotation.x) * k;
  });
  return <group ref={group}>{children}</group>;
}

/** Expanding ring that reads as a scan pulse. Decorative only. */
function ScanRing({
  theme,
  reducedMotion,
  delay,
}: {
  theme: SceneTheme;
  reducedMotion: boolean;
  delay: number;
}) {
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    const t = reducedMotion ? 0 : ((clock.elapsedTime + delay) % 3) / 3;
    if (mesh.current) mesh.current.scale.setScalar(1 + t * 0.55);
    if (material.current) material.current.opacity = (1 - t) * 0.45;
  });

  return (
    <mesh ref={mesh} position={[0, 0.54, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.5, 1.58, 72]} />
      <meshBasicMaterial
        ref={material}
        color={theme.accent}
        transparent
        opacity={0.4}
        toneMapped={false}
        depthWrite={false}
      />
    </mesh>
  );
}

function SeedRing({
  index,
  color,
  reducedMotion,
}: {
  index: number;
  color: string;
  reducedMotion: boolean;
}) {
  const mesh = useRef<InstancedMesh>(null);
  const seeds = useMemo(
    () =>
      Array.from({ length: SEEDS_PER_CROP }, (_, i) => {
        const r = (n: number) => {
          const x =
            Math.sin((index + 1) * 97.13 + i * 13.37 + n * 7.7) * 43758.5453;
          return x - Math.floor(x);
        };
        return {
          angle: (i / SEEDS_PER_CROP) * Math.PI * 2 + index * 0.6,
          radius: 3.0 + index * 0.32 + r(1) * 0.35,
          height: 0.35 + r(2) * 2.0,
          speed: 0.12 + r(3) * 0.08,
          size: 0.06 + r(4) * 0.05,
          tilt: r(5) * Math.PI,
        };
      }),
    [index],
  );

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = reducedMotion ? 0 : clock.elapsedTime;
    seeds.forEach((s, i) => {
      const a = s.angle + t * s.speed * (index % 2 ? 1 : -1);
      dummy.position.set(
        Math.cos(a) * s.radius,
        s.height + Math.sin(t * 0.8 + i) * 0.08,
        Math.sin(a) * s.radius,
      );
      dummy.rotation.set(s.tilt + t * 0.3, a, 0);
      dummy.scale.set(s.size * 1.4, s.size, s.size);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, SEEDS_PER_CROP]}
      frustumCulled={false}
    >
      <sphereGeometry args={[1, 14, 14]} />
      <meshStandardMaterial color={color} roughness={0.55} />
    </instancedMesh>
  );
}
