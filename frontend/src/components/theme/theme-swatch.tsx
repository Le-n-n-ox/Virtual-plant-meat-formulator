import { cn } from "@/lib/utils";
import type { ThemeDefinition } from "@/lib/themes";

/** Small four-colour preview of a theme. Decorative; always pair with a label. */
export function ThemeSwatch({
  theme,
  className,
}: {
  theme: ThemeDefinition;
  className?: string;
}) {
  const [bg, surface, primary, accent] = theme.swatches;
  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-flex size-5 shrink-0 overflow-hidden rounded-full ring-1 ring-foreground/15",
        className,
      )}
      style={{ background: bg }}
    >
      <span
        className="absolute inset-y-0 left-0 w-1/2"
        style={{ background: surface }}
      />
      <span
        className="absolute right-0 bottom-0 size-1/2 rounded-tl-full"
        style={{ background: primary }}
      />
      <span
        className="absolute top-0 right-0 size-1/2 rounded-bl-full"
        style={{ background: accent }}
      />
    </span>
  );
}
