"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The landing page's bands, in page order. Every `id` here must exist on the
 * page: the nav highlights whichever one is in view, and tests/e2e walk each
 * anchor. Sections without a pill (the stats band, the closing call to action)
 * are deliberate — the nav is a table of contents, not a list of every anchor.
 */
export const SECTIONS = [
  { id: "hero", label: "Overview" },
  { id: "how-it-works", label: "How it works" },
  { id: "who-its-for", label: "Who it is for" },
  { id: "principles", label: "Principles" },
  { id: "event-flow", label: "Live 3D" },
  { id: "crops", label: "Crops" },
  { id: "provenance", label: "Data sources" },
  { id: "themes", label: "Themes" },
] as const;

const SECTION_IDS = SECTIONS.map((s) => s.id);

/** Tracks which page section is in view so the nav can highlight it. */
export function useActiveSection(ids: string[] = SECTION_IDS) {
  const [active, setActive] = useState<string>(ids[0] ?? "");
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id);
        }
      },
      { rootMargin: "-35% 0px -55% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

/**
 * Sticky pill navigation under the header. Clicking smooth-scrolls to the
 * section; the active pill follows scroll position.
 */
export function SectionNav() {
  const active = useActiveSection();
  return (
    <div className="sticky top-16 z-30 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div
        role="navigation"
        aria-label="Landing sections"
        className="mx-auto flex max-w-6xl gap-1.5 overflow-x-auto px-4 py-2 sm:px-6"
      >
        {SECTIONS.map((s) => {
          const current = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={current ? "true" : undefined}
              className={cn(
                "relative shrink-0 rounded-full px-3 py-1.5 text-small whitespace-nowrap transition-colors outline-none focus-visible:bg-muted",
                current
                  ? "font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              {current && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}
