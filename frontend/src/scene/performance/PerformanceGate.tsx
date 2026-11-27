"use client";

import { PerformanceMonitor } from "@react-three/drei";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { useThree } from "@react-three/fiber";
import {
  applyPerformanceEvent,
  dprSteps,
  initialPerformance,
} from "./performancePolicy";

/**
 * The performance ladder (guide §12.11): lower the device pixel ratio first,
 * then turn off real-time shadows, and only then give up on 3D and switch to
 * the 2D view — always with a visible explanation, never silently.
 *
 * `PerformanceMonitor` from drei is driven from inside the canvas because it
 * needs the frame loop; the decisions live in `performancePolicy` so they can be
 * unit-tested, and the outcomes are handed back up through callbacks.
 */
export interface PerformanceGateProps {
  /** Highest DPR this device should use (2 desktop, 1.5 phone). */
  baseDpr: number;
  /** Optional: called as the DPR ladder steps down. */
  onDprChange?: (dpr: number) => void;
  onShadowsOff: () => void;
  onGiveUp: () => void;
  children: ReactNode;
}

export function PerformanceGate({
  baseDpr,
  onDprChange,
  onShadowsOff,
  onGiveUp,
  children,
}: PerformanceGateProps) {
  const setDpr = useThree((s) => s.setDpr);
  const steps = useMemo(() => dprSteps(baseDpr), [baseDpr]);
  const state = useRef(initialPerformance());
  const [gaveUp, setGaveUp] = useState(false);
  const [, forceRender] = useState(0);

  const handle = useCallback(
    (event: "decline" | "incline") => {
      const previous = state.current;
      const next = applyPerformanceEvent(previous, event, steps);
      if (next === previous) return;
      state.current = next;
      forceRender((n) => n + 1);
      if (next.step !== previous.step) {
        setDpr(steps[next.step]);
        onDprChange?.(steps[next.step]);
      }
      if (previous.shadows && !next.shadows) onShadowsOff();
      if (next.gaveUp) {
        setGaveUp(true);
        onGiveUp();
      }
    },
    [steps, setDpr, onDprChange, onShadowsOff, onGiveUp],
  );

  const handleDecline = useCallback(() => handle("decline"), [handle]);
  const handleIncline = useCallback(() => handle("incline"), [handle]);

  if (gaveUp) return null;

  return (
    <PerformanceMonitor
      onDecline={handleDecline}
      onIncline={handleIncline}
      flipflops={6}
    >
      {children}
    </PerformanceMonitor>
  );
}
