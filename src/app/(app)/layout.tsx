import { Suspense } from "react";
import { MobileNav } from "@/components/layout/mobile-nav";
import { RouteFocus } from "@/components/layout/route-focus";
import { SearchField } from "@/components/layout/search-field";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SignOutButton } from "@/components/layout/sign-out-button";
import { ToastProvider } from "@/components/ui/toast";
import { requireAuth } from "@/server/auth";

/**
 * Authenticated app shell (MASTER.md §6): sidebar at inline-start (right in RTL),
 * full at ≥1280px, icon rail at 768–1279px, top bar + drawer below 768px.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <ToastProvider>
      <a
        href="#main"
        className="fixed start-3 top-3 z-[100] -translate-y-24 rounded-md bg-primary px-4 py-2 text-on-primary focus-visible:translate-y-0"
      >
        דלג לתוכן הראשי
      </a>

      <div className="flex min-h-dvh">
        <aside
          aria-label="סרגל צד"
          className="sticky top-0 hidden h-dvh w-16 shrink-0 flex-col gap-2 overflow-y-auto border-e bg-surface-subtle p-2 md:flex xl:w-60 xl:p-3"
        >
          <SidebarNav variant="sidebar" search={<SearchField id="search-sidebar" rail />} />
          <SignOutButton rail />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b bg-surface px-2 md:hidden">
            <MobileNav
              search={<SearchField id="search-drawer" />}
              footer={<SignOutButton />}
            />
            <span className="text-md font-semibold">לוח בקרה</span>
          </header>

          <main id="main" tabIndex={-1} className="flex min-w-0 flex-1 flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
            {children}
          </main>
        </div>
      </div>

      <Suspense>
        <RouteFocus />
      </Suspense>
      {/* Verifies the session on the server for every app page; the proxy check is only optimistic. */}
      <Suspense>
        <VerifySession />
      </Suspense>
    </ToastProvider>
  );
}

async function VerifySession() {
  await requireAuth();
  return null;
}
