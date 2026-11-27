"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Brand } from "@/components/layout/brand";
import { TOUCH_ROW, TOUCH_TARGET } from "@/components/layout/touch-target";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { useActiveSection } from "./section-nav";

const LINKS = [
  { href: "#principles", label: "Principles" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#themes", label: "Themes" },
  { href: "#crops", label: "Crops" },
  { href: "/methodology", label: "Methodology" },
];

export function SiteHeader() {
  const active = useActiveSection();
  const [open, setOpen] = useState(false);
  const motionTokens = useMotion();

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/*
       * Three things keep this row inside 360 px, and it needed all three: the
       * brand may shrink (`min-w-0` here, truncating inside `Brand`), the
       * right-hand cluster may not (`shrink-0`), and below `sm` the cluster
       * holds nothing but the theme menu and the menu button. With the sign-in
       * pair still in the row the header was two pixels wider than the
       * viewport, which put a horizontal scrollbar on every page using this
       * header, not just the landing page.
       */}
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <div className="min-w-0 shrink">
          <Brand />
        </div>
        <nav
          aria-label="Site"
          className="hidden items-center gap-5 text-small text-muted-foreground lg:flex"
        >
          {LINKS.map((l) => {
            const current =
              l.href.startsWith("#") && active === l.href.slice(1);
            return (
              <a
                key={l.href}
                href={l.href}
                aria-current={current ? "true" : undefined}
                className={cn(
                  "relative transition-colors hover:text-foreground",
                  current && "font-medium text-foreground",
                )}
              >
                {l.label}
                {current && (
                  <span className="absolute inset-x-0 -bottom-1.5 h-0.5 rounded-full bg-primary" />
                )}
              </a>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <ThemeSwitcher className={TOUCH_TARGET} />
          {/*
           * Both links step aside below `sm` and reappear in the menu panel.
           * "Open workspace" is 128 px of fixed width, and keeping it here was
           * what left the brand too little room to render at 360 px: the row
           * came to 2 px more than the viewport. In the panel the same link is
           * the full width of the sheet and the first thing under the links,
           * so the primary action is more prominent on a phone, not less.
           */}
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              TOUCH_ROW,
              "hidden sm:inline-flex",
            )}
          >
            Sign in
          </Link>
          <Link
            href="/dashboard"
            className={cn(
              buttonVariants({ size: "sm" }),
              TOUCH_ROW,
              "hidden sm:inline-flex",
            )}
          >
            Open workspace
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-label="Toggle menu"
            onClick={() => setOpen((o) => !o)}
            className={cn(
              buttonVariants({ variant: "outline", size: "icon" }),
              TOUCH_TARGET,
              "lg:hidden",
            )}
          >
            {open ? (
              <XIcon className="size-4" aria-hidden />
            ) : (
              <MenuIcon className="size-4" aria-hidden />
            )}
          </button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.nav
            aria-label="Mobile"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={motionTokens.enter}
            className="overflow-hidden border-t border-border/60 lg:hidden"
          >
            {/*
             * The panel hangs off a sticky header, so it cannot be scrolled
             * with the page: on a landscape phone its own last row would be
             * unreachable. Capped at the viewport below the 4rem row and given
             * its own scroller instead.
             */}
            <div className="flex max-h-[calc(100svh-4rem)] flex-col gap-1 overflow-y-auto px-4 py-3">
              {LINKS.map((l) => {
                const current =
                  l.href.startsWith("#") && active === l.href.slice(1);
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    aria-current={current ? "true" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "focus-ring flex items-center rounded-md px-3 text-small transition-colors",
                      TOUCH_ROW,
                      current
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {l.label}
                  </a>
                );
              })}
              <div className="mt-2 flex flex-col gap-2 border-t border-border/60 pt-3 sm:hidden">
                <Link
                  href="/dashboard"
                  onClick={() => setOpen(false)}
                  className={cn(buttonVariants(), TOUCH_ROW, "w-full")}
                >
                  Open workspace
                </Link>
                <Link
                  href="/login"
                  onClick={() => setOpen(false)}
                  className={cn(
                    buttonVariants({ variant: "outline" }),
                    TOUCH_ROW,
                    "w-full",
                  )}
                >
                  Sign in
                </Link>
              </div>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
