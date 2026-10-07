import * as React from "react"
import { cn } from "cn"

function Input({
  className,
  type,
  ...props
}) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-md border border-input bg-bg-elevated px-3 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground tabular-nums placeholder:text-fg-muted hover:border-fg-secondary focus-visible:border-fg-primary focus-visible:ring-3 focus-visible:ring-fg-primary/14 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-border-subtle disabled:text-fg-muted aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
