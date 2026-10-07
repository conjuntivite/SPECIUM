import * as React from "react"
import { cn } from "cn"

function Textarea({
  className,
  ...props
}) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "w-full min-w-0 rounded-md border border-input bg-bg-elevated px-3 py-2 text-base transition-colors outline-none tabular-nums placeholder:text-fg-muted hover:border-fg-secondary focus-visible:border-fg-primary focus-visible:ring-3 focus-visible:ring-fg-primary/14 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-border-subtle disabled:bg-border-subtle disabled:text-fg-muted aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
