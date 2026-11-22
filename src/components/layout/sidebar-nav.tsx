"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { isCurrentPath, MAIN_NAV, SETTINGS_NAV, type NavItem } from "./nav-items";

/**
 * "sidebar": full labels at ≥1280px, icon rail at 768–1279px (labels stay as accessible names).
 * "drawer": always full labels (below 768px).
 */
export type NavVariant = "sidebar" | "drawer";

type SidebarNavProps = {
  variant: NavVariant;
  onNavigate?: () => void;
  /** Rendered between the main views and Settings (MASTER.md §6). */
  search?: React.ReactNode;
};

/**
 * The nav is rendered once, in the static shell, and its links are never replaced: only the
 * current path comes from inside <Suspense> (dynamic routes resolve it at request time), through a
 * child that renders nothing. A Suspense fallback copy of the links would be swapped out when the
 * page streams in, dropping the focus of a keyboard user who had already tabbed into the nav.
 */
export function SidebarNav(props: SidebarNavProps) {
  const [pathname, setPathname] = useState<string | null>(null);
  return (
    <>
      <SidebarNavLinks {...props} pathname={pathname} />
      <Suspense fallback={null}>
        <PathnameSync onChange={setPathname} />
      </Suspense>
    </>
  );
}

function PathnameSync({ onChange }: { onChange: (pathname: string) => void }) {
  const pathname = usePathname();
  // Before paint, so aria-current never lags a navigation visibly.
  useLayoutEffect(() => onChange(pathname), [pathname, onChange]);
  return null;
}

/** The nav for a known path, or `null` (prerender fallback: no aria-current yet). */
export function SidebarNavLinks({
  variant,
  onNavigate,
  search,
  pathname,
}: SidebarNavProps & { pathname: string | null }) {
  const link = (item: NavItem) => (
    <li key={item.href}>
      <NavLink item={item} variant={variant} current={pathname !== null && isCurrentPath(item.href, pathname)} onNavigate={onNavigate} />
    </li>
  );

  return (
    <nav aria-label="ניווט ראשי" className="flex flex-1 flex-col gap-2">
      <ul className="flex flex-col gap-1">{MAIN_NAV.map(link)}</ul>
      <div role="separator" className="my-2 border-t" />
      {search}
      <ul className="flex flex-col gap-1">{link(SETTINGS_NAV)}</ul>
    </nav>
  );
}

function NavLink({
  item,
  variant,
  current,
  onNavigate,
}: {
  item: NavItem;
  variant: NavVariant;
  current: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const rail = variant === "sidebar";
  return (
    <Link
      href={item.href}
      aria-current={current ? "page" : undefined}
      title={rail ? item.label : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-10 items-center gap-3 rounded-md px-3 text-base text-text-secondary transition-colors hover:bg-surface hover:text-text-primary",
        rail && "max-xl:justify-center max-xl:px-0",
        current && "bg-primary-subtle font-semibold text-primary hover:bg-primary-subtle hover:text-primary",
      )}
    >
      <Icon aria-hidden className="size-5 shrink-0" />
      <span className={cn(rail && "max-xl:sr-only")}>{item.label}</span>
    </Link>
  );
}
