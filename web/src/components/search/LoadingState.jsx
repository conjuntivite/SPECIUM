import { Loader2 } from 'lucide-react'

export function LoadingState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <Loader2 className="size-8 animate-spin text-[var(--primary)]" />
      <p className="font-medium">{title}</p>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  )
}
