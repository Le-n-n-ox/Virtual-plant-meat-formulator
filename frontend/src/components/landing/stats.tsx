"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useMotion } from "@/lib/motion";

function Counter({
  to,
  decimals = 0,
  suffix = "",
}: {
  to: number;
  decimals?: number;
  suffix?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const [value, setValue] = useState(0);
  // The count-up is a decorative flourish, so it runs on the flourish token.
  // Reduced motion resolves that to no duration at all.
  const duration = useMotion().ms.flourish;

  useEffect(() => {
    if (!inView || duration === 0) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // The same deceleration as MOTION_EASE_OUT, applied to the value.
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to, duration]);

  return (
    <span ref={ref} className="font-numeric">
      {/* With no duration to count over, the figure is simply printed. */}
      {(duration === 0 ? to : value).toFixed(decimals)}
      {suffix}
    </span>
  );
}

const STATS = [
  { value: 8, suffix: "", label: "Indigenous crops in the demo catalogue" },
  { value: 100, suffix: "%", label: "Of each value traced to a source" },
  {
    value: 3,
    suffix: "",
    label: "Job types: nutrition, texture, optimization",
  },
  { value: 6, suffix: "", label: "Themes shared by the UI and the 3D scene" },
];

/** Animated proof points. The numbers are static product facts, not metrics. */
export function Stats() {
  return (
    <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {STATS.map((s) => (
        <div key={s.label} className="flex flex-col gap-1">
          <dd className="text-gradient text-3xl font-semibold tracking-tight sm:text-4xl">
            <Counter to={s.value} suffix={s.suffix} />
          </dd>
          <dt className="text-small text-muted-foreground">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}
