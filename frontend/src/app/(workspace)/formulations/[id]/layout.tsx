import type { ReactNode } from "react";
import { Suspense } from "react";
import { FormulationSession } from "@/components/formulation/formulation-session";
import { WorkspaceTabs } from "@/components/formulation/workspace-tabs";
import { WorkspaceScene } from "@/scene/WorkspaceScene";

/**
 * Two-pane workspace. The scene lives in the layout so it stays mounted (and
 * never reloads) while the user switches between tabs.
 */
export default function FormulationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="grid gap-4 p-3 sm:p-5 xl:h-[calc(100svh-3.5rem)] xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <Suspense>
        <FormulationSession />
      </Suspense>
      <WorkspaceScene className="min-h-[520px] xl:h-full" />
      <section
        aria-label="Workspace tab content"
        className="flex min-h-0 flex-col rounded-xl border bg-card"
      >
        <Suspense fallback={<div className="h-10 border-b" />}>
          <WorkspaceTabs />
        </Suspense>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
      </section>
    </div>
  );
}
