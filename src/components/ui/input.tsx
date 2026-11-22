import * as React from "react"
import { cn } from "cn"

// MASTER.md §7: surface, border-input; hover border text-secondary; ring on focus;
// error = danger border + aria-invalid. Text stays 16px (--text-base) at every width.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "min-h-9 w-full min-w-0 rounded-lg border border-border-input bg-surface px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-text-muted hover:border-text-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:text-text-disabled aria-invalid:border-danger",
        className
      )}
      {...props}
    />
  )
}

export { Input }
