"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Brand } from "@/components/layout/brand";
import { ThemeSwitcher } from "@/components/theme/theme-switcher";
import { buttonVariants } from "@/components/ui/button";
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

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Brand />
        <nav
          aria-label="Site"
          className="hidden items-center gap-5 text-sm text-muted-foreground lg:flex"
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
        <div className="ml-auto flex items-center gap-2">
          <ThemeSwitcher />
          <Link
            href="/login"
            className={cn(
              buttonVariants({ variant: "ghost", size: "sm" }),
              "hidden sm:inline-flex",
            )}
          >
            Sign in
          </Link>
          <Link href="/dashboard" className={buttonVariants({ size: "sm" })}>
            Open workspace
          </Link>
          <button
            type="button"
            aria-expanded={open}
            aria-label="Toggle menu"
            onClick={() => setOpen((o) => !o)}
            className="flex size-9 items-center justify-center rounded-md border bg-background px-2 transition-colors hover:bg-muted lg:hidden"
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
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="overflow-hidden border-t border-border/60 lg:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-3">
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {l.label}
                </a>
              ))}
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
