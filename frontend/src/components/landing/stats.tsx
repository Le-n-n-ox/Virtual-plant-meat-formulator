"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    if (!inView) return;
    let raf = 0;
    const duration = 1400;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(to * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, to]);

  return (
    <span ref={ref} className="tabular-nums">
      {value.toFixed(decimals)}
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
          <dt className="text-sm text-muted-foreground">{s.label}</dt>
        </div>
      ))}
    </dl>
  );
}
