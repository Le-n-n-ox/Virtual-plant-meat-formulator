"use client";

import { CheckIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { useMounted } from "@/hooks/use-mounted";
import { THEMES } from "@/lib/themes";
import { cn } from "@/lib/utils";

/**
 * Card grid of all six themes. Each card renders a miniature of the UI using
 * that theme's own tokens (via a nested data-theme), so it previews exactly.
 */
export function ThemePicker({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const active = mounted
    ? theme === "system"
      ? resolvedTheme
      : theme
    : undefined;

  return (
    <div
      role="radiogroup"
      aria-label="Colour theme"
      className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", className)}
    >
      {THEMES.map((t) => {
        const selected = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => setTheme(t.id)}
            data-theme={t.id}
            className={cn(
              "group relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-background p-3 text-left text-foreground transition-shadow outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              selected ? "ring-2 ring-primary" : "hover:shadow-md",
            )}
          >
            <span
              aria-hidden
              className="flex h-16 gap-1.5 rounded-lg border bg-card p-2"
            >
              <span className="w-1/4 rounded-md bg-sidebar" />
              <span className="flex flex-1 flex-col gap-1.5">
                <span className="h-2 w-2/3 rounded-full bg-foreground/70" />
                <span className="h-2 w-1/2 rounded-full bg-muted-foreground/50" />
                <span className="mt-auto flex gap-1">
                  <span className="h-3 w-8 rounded-sm bg-primary" />
                  <span className="h-3 w-5 rounded-sm bg-accent" />
                  <span className="ml-auto flex gap-0.5">
                    <span className="size-3 rounded-full bg-[var(--scene-crop-1)]" />
                    <span className="size-3 rounded-full bg-[var(--scene-crop-2)]" />
                    <span className="size-3 rounded-full bg-[var(--scene-crop-3)]" />
                  </span>
                </span>
              </span>
            </span>
            <span className="flex items-start justify-between gap-2">
              <span>
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-muted-foreground">
                  {t.description}
                </span>
              </span>
              {selected && (
                <CheckIcon
                  className="size-4 shrink-0 text-primary"
                  aria-hidden
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
