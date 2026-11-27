"use client";

import { motion, useScroll, useSpring } from "motion/react";
import { MOTION_SPRING_SETTLE, useMotion } from "@/lib/motion";

/** Thin gradient bar that tracks page scroll. Decorative only. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const motionTokens = useMotion();
  // The shared settle spring smooths the raw scroll value so the bar glides
  // instead of stepping. Under reduced motion the bar follows the scroll
  // position exactly: still accurate, but nothing animates on its own.
  const smoothed = useSpring(scrollYProgress, MOTION_SPRING_SETTLE);
  const scaleX = motionTokens.reduced ? scrollYProgress : smoothed;
  return (
    <motion.div
      aria-hidden
      className="scroll-progress bg-gradient-to-r from-[var(--scene-glow)] to-[var(--scene-crop-2)]"
      style={{ scaleX }}
    />
  );
}
