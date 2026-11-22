import {
  CalendarDays,
  ChartGantt,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  Milestone,
  Search,
  Settings,
  Copy,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** MASTER.md §6 app shell, in visual (RTL) order. */
export const MAIN_NAV: readonly NavItem[] = [
  { href: "/", label: "לוח בקרה", icon: LayoutDashboard },
  { href: "/tasks", label: "משימות", icon: ListChecks },
  { href: "/projects", label: "פרויקטים", icon: FolderKanban },
  { href: "/calendar", label: "לוח שנה", icon: CalendarDays },
  { href: "/timeline", label: "גאנט", icon: ChartGantt },
  { href: "/planning", label: "תכנון שנתי", icon: Milestone },
  { href: "/templates", label: "תבניות", icon: Copy },
];

export const SEARCH_NAV: NavItem = { href: "/search", label: "חיפוש", icon: Search };
export const SETTINGS_NAV: NavItem = { href: "/settings", label: "הגדרות", icon: Settings };

/** A nav item is current for its own path and its sub-paths ("/" only for itself). */
export function isCurrentPath(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
