import { Search } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { SEARCH_NAV } from "./nav-items";

/**
 * Global search (MASTER.md §6). A plain GET form to /search, so it works without JavaScript.
 * In the icon rail (768–1279px) it collapses to a link to the search page.
 */
export function SearchField({ id, rail = false }: { id: string; rail?: boolean }) {
  return (
    <>
      <form
        action={SEARCH_NAV.href}
        role="search"
        className={cn("relative px-1", rail && "max-xl:hidden")}
      >
        <label htmlFor={id} className="sr-only">
          חיפוש משימות ופרויקטים
        </label>
        <Search
          aria-hidden
          className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-text-muted"
        />
        <Input id={id} name="q" type="search" dir="auto" placeholder="חיפוש" className="ps-8" />
      </form>
      {rail ? (
        <Link
          href={SEARCH_NAV.href}
          title={SEARCH_NAV.label}
          className="flex min-h-10 items-center justify-center rounded-md text-text-secondary hover:bg-surface hover:text-text-primary xl:hidden"
        >
          <Search aria-hidden className="size-5" />
          <span className="sr-only">{SEARCH_NAV.label}</span>
        </Link>
      ) : null}
    </>
  );
}
