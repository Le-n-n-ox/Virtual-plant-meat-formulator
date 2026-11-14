import type { ReactNode } from "react";
import { Suspense } from "react";
import { AuthGuard } from "@/components/auth/auth-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-svh">
        <Suspense
          fallback={
            <div className="hidden w-60 shrink-0 border-r bg-sidebar lg:block" />
          }
        >
          <AppSidebar />
        </Suspense>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex-1">{children}</div>
        </div>
      </div>
    </AuthGuard>
  );
}
