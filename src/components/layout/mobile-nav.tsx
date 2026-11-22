"use client";

import { Menu } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SidebarNav } from "./sidebar-nav";

/** Below 768px: top-bar menu button opening the navigation drawer (MASTER.md §6, D6). */
export function MobileNav({ search, footer }: { search: React.ReactNode; footer: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="פתיחת תפריט הניווט">
          <Menu aria-hidden className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="start"
        className="w-72 gap-0 bg-surface-subtle p-3 pt-14"
        // Start on the current page's link, not the search field (which would open the
        // on-screen keyboard).
        onOpenAutoFocus={(event) => {
          const target = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>(
            '[aria-current="page"], nav a',
          );
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
      >
        <SheetTitle className="sr-only">ניווט</SheetTitle>
        <SidebarNav variant="drawer" search={search} onNavigate={() => setOpen(false)} />
        {footer}
      </SheetContent>
    </Sheet>
  );
}
