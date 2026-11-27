import type { ReactNode } from "react";
import { SiteHeader } from "@/components/landing/site-header";

/**
 * Public pages (no sign-in). Reuses the landing page's header so a signed-out
 * visitor gets the same navigation, and keeps a short footer with the labelling
 * rule the guide requires on this page.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <div className="flex-1">{children}</div>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-caption text-muted-foreground sm:flex-row sm:items-center sm:px-6">
          <span>
            3D visuals are illustrative and are not physical simulations.
          </span>
          <span className="sm:ml-auto">
            Data values belong to their cited sources and licences.
          </span>
        </div>
      </footer>
    </div>
  );
}
