import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/server/actions/auth";

export function SignOutButton({ rail = false }: { rail?: boolean }) {
  return (
    <form action={signOut}>
      <button
        type="submit"
        title={rail ? "יציאה" : undefined}
        className={cn(
          "flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-base text-text-secondary transition-colors hover:bg-surface hover:text-text-primary",
          rail && "max-xl:justify-center max-xl:px-0",
        )}
      >
        <LogOut aria-hidden className="size-5 shrink-0 rtl:-scale-x-100" />
        <span className={cn(rail && "max-xl:sr-only")}>יציאה</span>
      </button>
    </form>
  );
}
