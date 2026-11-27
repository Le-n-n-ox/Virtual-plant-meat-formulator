"use client";

import { MonitorIcon, PaletteIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMounted } from "@/hooks/use-mounted";
import { THEMES, getTheme } from "@/lib/themes";
import { ThemeSwatch } from "./theme-swatch";

/**
 * Compact theme menu for top bars. `className` reaches the trigger, which is
 * how the two headers that use it raise its hit area to 44px below `lg`.
 */
export function ThemeSwitcher({ className }: { className?: string }) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = mounted ? getTheme(resolvedTheme) : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label="Change colour theme"
            className={className}
          />
        }
      >
        {current ? (
          <ThemeSwatch theme={current} className="size-4" />
        ) : (
          <PaletteIcon />
        )}
        <span className="hidden sm:inline">{current?.label ?? "Theme"}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={mounted ? theme : undefined}
            onValueChange={(value) => setTheme(String(value))}
          >
            <DropdownMenuRadioItem value="system">
              <MonitorIcon />
              <span>System (Lab / Lab Night)</span>
            </DropdownMenuRadioItem>
            <DropdownMenuSeparator />
            {THEMES.map((t) => (
              <DropdownMenuRadioItem key={t.id} value={t.id}>
                <ThemeSwatch theme={t} className="size-4" />
                <span className="flex flex-col">
                  <span>{t.label}</span>
                  <span className="text-caption text-muted-foreground">
                    {t.mode === "dark" ? "Dark" : "Light"}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
