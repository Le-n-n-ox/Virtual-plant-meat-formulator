import type { ReactNode } from "react";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { AuthGuard } from "@/components/auth/auth-provider";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

/**
 * This layout reads a cookie, which cannot be prerendered into a static shell,
 * so the workspace blocks on the server instead (Next.js "building" guide, the
 * `[block]` option). Streaming it behind Suspense would prerender an expanded
 * sidebar and then correct it — the flash this cookie exists to avoid — and
 * `use cache` does not apply to per-request reads. Nothing under `(workspace)`
 * is publicly cacheable anyway: every route here requires a signed-in user.
 */
export const instant = false;

/** Where `SidebarProvider` stores the open state. */
const SIDEBAR_COOKIE_NAME = "sidebar_state";

export default async function WorkspaceLayout({
  children,
}: {
  children: ReactNode;
}) {
  // Read the collapse choice on the server so the first paint already has the
  // right width. Doing this on the client would render expanded and then jump.
  const cookieStore = await cookies();
  const saved = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value;
  const defaultOpen = saved === undefined ? true : saved === "true";

  return (
    <AuthGuard>
      <SidebarProvider defaultOpen={defaultOpen}>
        <Suspense
          fallback={
            <div className="hidden w-(--sidebar-width) shrink-0 border-r bg-sidebar lg:block" />
          }
        >
          <AppSidebar />
        </Suspense>
        <SidebarInset className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <div className="flex-1">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </AuthGuard>
  );
}
