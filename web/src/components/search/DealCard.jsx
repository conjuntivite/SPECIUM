import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export function DealCard({ deal, isPrimary, rankLabel, checked, disabled, onToggle }) {
  return (
    <Card
      className={`cursor-pointer gap-3 border-border bg-card p-6 transition hover:-translate-y-1 hover:border-cyan-500/30 hover:bg-[var(--secondary)] hover:shadow-lg ${isPrimary ? 'border-[var(--primary)]/50' : ''}`}
      onClick={(e) => {
        if (e.target.closest('a') || e.target.closest('.compare-check')) return
        window.open(deal.url, '_blank', 'noopener,noreferrer')
      }}
    >
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{deal.store}</Badge>
          {rankLabel ? <Badge className="bg-badge-green/15 text-badge-green">{rankLabel}</Badge> : null}
          {deal.cost_benefit_score ? (
            <Badge className="bg-badge-green/15 font-mono text-badge-green">
              ★ {deal.cost_benefit_score.toFixed(1)} / 10
            </Badge>
          ) : null}
        </div>

        <label
          className="compare-check mb-2 flex items-center gap-2 text-sm text-muted-foreground"
          title="Selecionar para comparar ficha técnica"
        >
          <input
            type="checkbox"
            className="size-4"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onToggle(deal, e.target.checked)}
          />
          <span>Comparar ficha técnica</span>
        </label>

        <h3 className="mb-1.5 line-clamp-2 font-semibold" title={deal.title}>
          {deal.title}
        </h3>
        <p className="mb-2 line-clamp-3 text-sm text-muted-foreground">
          {deal.snippet || 'Clique para conferir os detalhes na loja.'}
        </p>
        {deal.recommendation_reason ? (
          <div className="mb-2 rounded-lg bg-white/5 p-2 text-sm">💡 {deal.recommendation_reason}</div>
        ) : null}
        {deal.installment_info ? (
          <p className="text-sm text-muted-foreground">Cartão: {deal.installment_info}</p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Preço Estimado</span>
          <span className="font-mono text-lg font-semibold">{deal.price_estimated || 'Ver no site'}</span>
        </div>
        <Button asChild size="sm">
          <a href={deal.url} target="_blank" rel="noopener noreferrer">
            Ver Oferta ↗
          </a>
        </Button>
      </div>
    </Card>
  )
}
