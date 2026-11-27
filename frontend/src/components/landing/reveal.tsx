"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { useMotion } from "@/lib/motion";

/**
 * Fade/slide-in on scroll.
 *
 * The reduced-motion case is handled through `useMotion` rather than
 * `MotionConfig reducedMotion="user"`, because the preferences store's
 * "Reduce" setting has to be honoured as well as the media query. The initial
 * state is then the finished state, so the content is never briefly hidden.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const motionTokens = useMotion();
  const rest = { opacity: 1, y: 0 };
  return (
    <motion.div
      className={className}
      initial={motionTokens.reduced ? rest : { opacity: 0, y: 16 }}
      whileInView={rest}
      viewport={{ once: true, margin: "-60px" }}
      transition={{
        ...motionTokens.enter,
        delay: motionTokens.reduced ? 0 : delay,
      }}
    >
      {children}
    </motion.div>
  );
}
