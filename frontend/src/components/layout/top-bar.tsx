"use client";

import { LogOutIcon } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { JobStatusChip } from "@/components/jobs/job-status";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { TOUCH_TARGET } from "./touch-target";

export function TopBar() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
      {/* One control for both layouts: below lg it opens the sheet, above it
          collapses the sidebar to its icon rail. Ctrl/⌘ B does the same. */}
      <SidebarTrigger
        aria-label="Toggle navigation"
        title="Toggle navigation (Ctrl/⌘ B)"
        className={cn(TOUCH_TARGET, "shrink-0")}
      />
      {/*
       * This row has one side that may give up width and one that may not. The
       * brand is the flexible side, so it carries `min-w-0` and truncates
       * inside; the controls are fixed, so the cluster carries `shrink-0`.
       * Without that pairing the wordmark sets the row's floor and a 360 px
       * screen scrolls sideways — the same fault the landing header had.
       */}
      <Brand className="min-w-0 lg:hidden" href="/dashboard" />
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <JobStatusChip className="hidden sm:inline-flex" />
        <ThemeSwitcher className={TOUCH_TARGET} />
        {/* A display name is free text from the backend, so it is capped and
            clipped rather than left to widen the fixed side of the row. */}
        <div className="ml-1 hidden max-w-40 flex-col items-end leading-tight sm:flex">
          <span className="w-full truncate text-right text-caption font-medium">
            {user.display_name}
          </span>
          <span className="w-full truncate text-right text-caption text-muted-foreground">
            {user.role}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Sign out"
          title="Sign out"
          onClick={() => void logout()}
          className={TOUCH_TARGET}
        >
          <LogOutIcon />
        </Button>
      </div>
    </header>
  );
}
