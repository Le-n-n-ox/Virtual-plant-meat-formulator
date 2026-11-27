import {
  BookOpenIcon,
  BoxesIcon,
  ChartColumnIcon,
  CpuIcon,
  FlaskConicalIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  SettingsIcon,
  WheatIcon,
} from "lucide-react";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon },
  {
    href: "/formulations",
    label: "Workspace",
    icon: FlaskConicalIcon,
    match: "/formulations",
  },
  { href: "/ingredients", label: "Ingredients", icon: WheatIcon },
  { href: "/compare", label: "Compare", icon: BoxesIcon },
  // A bar-chart glyph, because the collapsed rail shows the icon on its own.
  { href: "/analytics", label: "Analytics", icon: ChartColumnIcon },
  { href: "/jobs", label: "Jobs", icon: ListChecksIcon },
  { href: "/models", label: "Models", icon: CpuIcon },
  { href: "/methodology", label: "Methodology", icon: BookOpenIcon },
] as const;

export const SETTINGS_ITEM = {
  href: "/settings",
  label: "Settings",
  icon: SettingsIcon,
};
