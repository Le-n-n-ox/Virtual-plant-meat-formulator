"use client";

import { CROPS } from "@/lib/landing-content";
import { cropVar } from "@/scene/theme/sceneTheme";

/**
 * Infinite marquee of the indigenous crops. Purely decorative; pauses on
 * hover and is hidden from screen readers (the same list appears in the
 * "Crops" section with full labels).
 */
export function CropMarquee() {
  const items = [...CROPS, ...CROPS];
  return (
    <div
      aria-hidden
      className="relative overflow-hidden border-y bg-muted/30 py-4"
    >
      <div className="animate-marquee flex w-max gap-3 pr-3">
        {items.map((crop, i) => (
          <span
            key={`${crop}-${i}`}
            className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-sm whitespace-nowrap"
          >
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: cropVar(i % 6) }}
            />
            {crop}
          </span>
        ))}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent" />
    </div>
  );
}
