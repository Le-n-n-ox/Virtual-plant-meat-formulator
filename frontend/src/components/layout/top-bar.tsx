"use client";

import { MenuIcon } from "lucide-react";
import { Suspense, useState } from "react";
import { JobStatusChip } from "@/components/jobs/job-status";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppNav } from "./app-sidebar";
import { Brand } from "./brand";

export function TopBar() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open navigation"
            />
          }
        >
          <MenuIcon />
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 bg-sidebar p-4 text-sidebar-foreground"
        >
          <SheetHeader className="p-0">
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <Brand />
          </SheetHeader>
          <Suspense>
            <AppNav onNavigate={() => setOpen(false)} />
          </Suspense>
        </SheetContent>
      </Sheet>
      <Brand className="lg:hidden" href="/dashboard" />
      <div className="ml-auto flex items-center gap-1.5">
        <JobStatusChip className="hidden sm:inline-flex" />
        <ThemeSwitcher />
      </div>
    </header>
  );
}
