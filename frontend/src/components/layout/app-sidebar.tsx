"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { useReducedMotionPreference } from "@/scene/hooks/useSceneEnvironment";
import { BrandMark, Brand } from "./brand";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";
import { TOUCH_ROW, TOUCH_TARGET } from "./touch-target";

/**
 * The workspace sidebar, built on the shadcn sidebar primitives.
 *
 * `collapsible="icon"` gives the icon rail; `SidebarProvider` in the workspace
 * layout owns the open state and persists it in the `sidebar_state` cookie, so
 * the server renders the right width on the first paint and there is no flash.
 * It also binds Ctrl/⌘ B. Below `lg` the same markup is shown as a sheet, which
 * `Sidebar` handles through `useIsMobile` — there is no separate mobile nav.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const { state, isMobile, setOpenMobile } = useSidebar();
  const reducedMotion = useReducedMotionPreference();
  const collapsed = state === "collapsed" && !isMobile;

  const isActive = (href: string, match?: string) =>
    pathname === href ||
    pathname.startsWith(`${match ?? href}/`) ||
    pathname === match;

  /** Navigating inside the sheet should close it; on desktop there is no sheet. */
  const closeIfMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  const item = (
    href: string,
    label: string,
    Icon: typeof SETTINGS_ITEM.icon,
    match?: string,
  ) => {
    const active = isActive(href, match);
    return (
      <SidebarMenuItem key={href}>
        <SidebarMenuButton
          isActive={active}
          // Shown only while the rail is collapsed, and never on the sheet.
          tooltip={label}
          // 44px rows on the sheet, where the pointer is a finger; the 32px
          // desktop row is unchanged. Nine of these stack up, so the height
          // comes from a minimum and the sheet scrolls rather than each row
          // being padded until the list no longer fits.
          className={TOUCH_ROW}
          render={
            <Link
              href={href}
              onClick={closeIfMobile}
              aria-current={active ? "page" : undefined}
            >
              <Icon aria-hidden />
              {/* The label stays in the DOM when collapsed so the link keeps
                  the same accessible name in both states; the tooltip shows
                  it on screen. */}
              <span className={cn(collapsed && "sr-only")}>{label}</span>
            </Link>
          }
        />
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar
      collapsible="icon"
      // Everything that moves in here is a CSS transition — the rail's width,
      // a row's padding, a hover colour — and globals.css already zeroes those
      // for the OS `prefers-reduced-motion`. This hands the same rule the app's
      // own Settings > Motion > Reduce choice, which no media query can see.
      data-reduce-motion={reducedMotion ? "true" : undefined}
    >
      <SidebarHeader>
        <div className="flex items-center gap-1">
          {collapsed ? (
            <Link
              href="/"
              onClick={closeIfMobile}
              className="flex flex-1 justify-center py-1"
            >
              <BrandMark />
              <span className="sr-only">Plant-Meat Virtual Formulator</span>
            </Link>
          ) : (
            <Brand className="min-w-0 flex-1 px-1.5" />
          )}
          {/*
           * The sheet needs a way out that is not "guess that the strip of
           * backdrop beside me is tappable": `Sidebar` hides the sheet's own
           * 28px close button, and on a 360px screen that strip is 72px wide.
           * Desktop has no sheet, so this control does not exist there.
           */}
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close navigation"
              onClick={() => setOpenMobile(false)}
              className={cn(
                TOUCH_TARGET,
                "shrink-0 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <XIcon />
            </Button>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* The shadcn slots are plain divs, so the landmark is declared here;
            without it the main navigation stops being reachable by role. */}
        <nav aria-label="Main">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map((n) =>
                  item(
                    n.href,
                    n.label,
                    n.icon,
                    "match" in n ? n.match : undefined,
                  ),
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>

      <SidebarFooter>
        <nav aria-label="Settings">
          <SidebarMenu>
            {item(SETTINGS_ITEM.href, SETTINGS_ITEM.label, SETTINGS_ITEM.icon)}
          </SidebarMenu>
        </nav>
      </SidebarFooter>

      {/* Drag/click the border to collapse. Keyboard users have Ctrl/⌘ B and
          the trigger in the top bar, so the rail itself is not focusable. */}
      <SidebarRail />
    </Sidebar>
  );
}
