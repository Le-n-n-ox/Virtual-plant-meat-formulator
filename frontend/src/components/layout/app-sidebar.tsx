"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { NAV_ITEMS, SETTINGS_ITEM } from "./nav-items";

export function AppNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string, match?: string) =>
    pathname === href ||
    pathname.startsWith(`${match ?? href}/`) ||
    pathname === match;

  const item = (
    href: string,
    label: string,
    Icon: typeof SETTINGS_ITEM.icon,
    match?: string,
  ) => {
    const active = isActive(href, match);
    return (
      <li key={href}>
        <Link
          href={href}
          onClick={onNavigate}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-sidebar-ring/50",
            active
              ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
              : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          )}
        >
          <Icon
            className={cn("size-4", active && "text-sidebar-primary")}
            aria-hidden
          />
          {label}
        </Link>
      </li>
    );
  };

  return (
    <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
      <ul className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((n) =>
          item(n.href, n.label, n.icon, "match" in n ? n.match : undefined),
        )}
      </ul>
      <ul className="mt-auto flex flex-col gap-0.5">
        {item(SETTINGS_ITEM.href, SETTINGS_ITEM.label, SETTINGS_ITEM.icon)}
      </ul>
    </nav>
  );
}

export function AppSidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col gap-6 border-r bg-sidebar px-3 py-4 text-sidebar-foreground lg:flex">
      <Brand className="px-1.5" />
      <AppNav />
    </aside>
  );
}
