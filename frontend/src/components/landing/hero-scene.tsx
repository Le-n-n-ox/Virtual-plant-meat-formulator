"use client";

import { Float, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { type Group, type InstancedMesh, Object3D } from "three";
import { useReducedMotionPreference } from "@/scene/hooks/useSceneEnvironment";
import { MixingVessel } from "@/scene/objects/MixingVessel";
import { type SceneTheme, useSceneTheme } from "@/scene/theme/sceneTheme";

const SEEDS_PER_CROP = 22;
const dummy = new Object3D();

/** Decorative landing-page scene. Theme-adaptive; static under reduced motion. */
export default function HeroScene() {
  const theme = useSceneTheme();
  const reducedMotion = useReducedMotionPreference();
  return (
    <Canvas
      flat
      dpr={[1, 2]}
      frameloop={reducedMotion ? "demand" : "always"}
      camera={{ position: [0, 3.4, 9.6], fov: 36 }}
      gl={{ alpha: true, antialias: true }}
      aria-hidden
    >
      <ambientLight intensity={theme.ambient + 0.1} />
      <hemisphereLight args={[theme.glass, theme.floor, 0.6]} />
      <directionalLight position={[4, 8, 5]} intensity={theme.key_light} />
      <directionalLight
        position={[-5, 3, -3]}
        intensity={theme.key_light * 0.35}
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
        <Product theme={theme} reducedMotion={reducedMotion} />
      </Rig>
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
          radius: 2.3 + index * 0.28 + r(1) * 0.35,
          height: -0.2 + r(2) * 2.0,
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

function Product({
  theme,
  reducedMotion,
}: {
  theme: SceneTheme;
  reducedMotion: boolean;
}) {
  return (
    <Float
      speed={reducedMotion ? 0 : 1.4}
      rotationIntensity={reducedMotion ? 0 : 0.5}
      floatIntensity={reducedMotion ? 0 : 0.6}
    >
      <group position={[2.1, 1.7, 0.4]} rotation={[0.35, -0.6, 0.15]}>
        <RoundedBox args={[1.3, 0.42, 0.8]} radius={0.14} smoothness={4}>
          <meshStandardMaterial color={theme.product} roughness={0.75} />
        </RoundedBox>
        {Array.from({ length: 6 }, (_, i) => (
          <mesh key={i} position={[0, 0.215, -0.28 + i * 0.11]}>
            <boxGeometry args={[1.0, 0.012, 0.025]} />
            <meshStandardMaterial color={theme.bg} transparent opacity={0.35} />
          </mesh>
        ))}
      </group>
    </Float>
  );
}
