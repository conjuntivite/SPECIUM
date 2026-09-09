const LEGEND_ITEMS = [
  { dot: 'bg-slate-600', label: 'Ainda sem vínculo' },
  { dot: 'bg-flow-green', label: 'Vinculado a outro card' },
  { dot: 'bg-flow-red', label: 'Sem isso não liga' },
  { dot: 'bg-flow-amber', label: 'Sugestão essencial' },
  { dot: 'bg-flow-orange', label: 'Alternativa (opcional)' },
  { dot: 'bg-flow-gray', label: 'Sugestão recomendada' },
]

export function FlowLegend({ compact = false }) {
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-3' : 'mb-4 flex flex-wrap gap-5 text-sm text-muted-foreground'}>
      {LEGEND_ITEMS.map((entry) => (
        <span key={entry.label} className="flex items-center gap-1.5" title={compact ? entry.label : undefined}>
          <span className={`size-2.5 shrink-0 rounded-full ${entry.dot}`} />
          {!compact ? entry.label : null}
        </span>
      ))}
    </div>
  )
}
