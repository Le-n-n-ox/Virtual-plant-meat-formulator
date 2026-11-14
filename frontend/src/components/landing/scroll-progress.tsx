"use client";

import { motion, useScroll, useSpring } from "motion/react";

/** Thin gradient bar that tracks page scroll. Decorative only. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 140,
    damping: 30,
    mass: 0.3,
  });
  return (
    <motion.div
      aria-hidden
      className="scroll-progress bg-gradient-to-r from-[var(--scene-glow)] to-[var(--scene-crop-2)]"
      style={{ scaleX }}
    />
  );
}
