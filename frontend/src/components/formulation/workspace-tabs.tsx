"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

const TABS = [
  { segment: "", label: "Editor" },
  { segment: "nutrition", label: "Nutrition" },
  { segment: "texture", label: "Texture" },
  { segment: "optimize", label: "Optimize" },
  { segment: "candidates", label: "Candidates" },
  { segment: "report", label: "Report" },
  { segment: "versions", label: "Versions" },
];

export function WorkspaceTabs() {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const base = `/formulations/${id}`;
  const motionTokens = useMotion();

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
              "relative px-3 py-2 text-small whitespace-nowrap transition-colors outline-none focus-visible:bg-muted",
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
                // The underline slides between tabs on the shared settle
                // spring; with reduced motion it is drawn under the new tab at
                // once, so the current section stays legible either way.
                transition={motionTokens.settle}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
