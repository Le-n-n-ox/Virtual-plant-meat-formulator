"use client";

import dynamic from "next/dynamic";
import { useWebGLSupport } from "@/scene/hooks/useSceneEnvironment";
import { CROPS } from "@/lib/landing-content";
import { cropVar } from "@/scene/theme/sceneTheme";

const HeroScene = dynamic(() => import("./hero-scene"), {
  ssr: false,
  loading: () => (
    <div className="scene-panel flex size-full items-center justify-center">
      <div className="scene-shimmer h-10 w-2/3 rounded-full" />
    </div>
  ),
});

/** 2D stand-in used during loading and when WebGL is unavailable. */
function StaticHero() {
  return (
    <svg viewBox="0 0 400 320" className="scene-panel size-full" aria-hidden>
      <defs>
        <radialGradient id="hero-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--scene-glow)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--scene-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="320" fill="url(#hero-glow)" />
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
        fillOpacity="0.55"
        stroke="var(--scene-line)"
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
    <div className="relative aspect-[5/4] w-full overflow-hidden rounded-2xl border border-scene-line bg-scene-bg shadow-sm">
      <div className="scene-grid-lines absolute inset-0 opacity-25" />
      {webgl ? <HeroScene /> : <StaticHero />}

      {/* Live-scene chip */}
      <span className="scene-glass absolute top-2 left-2 flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground">
        <span
          aria-hidden
          className="scene-pulse size-1.5 rounded-full bg-success"
        />
        Live illustrative scene
      </span>

      {/* Crop legend */}
      <span className="scene-glass absolute bottom-2 left-2 flex items-center gap-2 rounded-full px-2 py-1 text-[11px] text-muted-foreground">
        {CROPS.slice(0, 4).map((c, i) => (
          <span key={c} className="flex items-center gap-1">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: cropVar(i) }}
            />
            <span className="hidden sm:inline">{c}</span>
          </span>
        ))}
      </span>

      <span className="absolute right-2 bottom-2 rounded-full border border-scene-line bg-background/80 px-2 py-0.5 text-[11px] text-muted-foreground backdrop-blur">
        Illustrative visual
      </span>
    </div>
  );
}
