"use client";

import dynamic from "next/dynamic";
import { useWebGLSupport } from "@/scene/hooks/useSceneEnvironment";
import { cropVar } from "@/scene/theme/sceneTheme";

const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => <StaticHero />,
});

/** 2D stand-in used during loading and when WebGL is unavailable. */
function StaticHero() {
  return (
    <svg viewBox="0 0 400 320" className="size-full" aria-hidden>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle
          key={i}
          cx={200 + Math.cos(i * 1.05) * (110 + i * 6)}
          cy={170 + Math.sin(i * 1.05) * (70 + i * 4)}
          r={9}
          fill={cropVar(i)}
        />
      ))}
      <path
        d="M140 150 L155 250 L245 250 L260 150 Z"
        fill="var(--scene-metal)"
      />
      <ellipse
        cx="200"
        cy="150"
        rx="60"
        ry="10"
        fill="var(--scene-accent)"
        opacity="0.6"
      />
    </svg>
  );
}

export function HeroVisual() {
  const webgl = useWebGLSupport();
  return (
    <div className="relative aspect-[5/4] w-full">
      {webgl ? <HeroScene /> : <StaticHero />}
      <span className="absolute right-2 bottom-2 rounded-full border bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
        Illustrative visual
      </span>
    </div>
  );
}
