"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Editor" },
  { segment: "nutrition", label: "Nutrition" },
  { segment: "texture", label: "Texture" },
  { segment: "optimize", label: "Optimize" },
  { segment: "candidates", label: "Candidates" },
  { segment: "report", label: "Report" },
];

export function WorkspaceTabs() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/formulations/${id}`;

  return (
    <nav
      aria-label="Workspace sections"
      className="-mb-px flex gap-1 overflow-x-auto border-b"
    >
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = pathname === href;
        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative px-3 py-2 text-sm whitespace-nowrap transition-colors outline-none focus-visible:bg-muted",
              active
                ? "font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
            {active && (
              <motion.span
                layoutId="workspace-tab-underline"
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
