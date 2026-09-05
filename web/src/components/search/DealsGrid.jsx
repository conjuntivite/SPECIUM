import { Button } from '@/components/ui/button'
import { DealCard } from './DealCard'
import { PROVIDER_LABELS } from '@/data/categoryPresets'

export function DealsGrid({ data, compare }) {
  const exactDeals = data.deals || []
  const similarDeals = data.similar_deals || []
  const visibleDeals = [...exactDeals, ...similarDeals]
  const providerSuffix = PROVIDER_LABELS[data.provider] ? ` · via ${PROVIDER_LABELS[data.provider]}` : ''

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Ofertas Encontradas</h2>
        <span className="text-sm text-muted-foreground">
          {visibleDeals.length} {visibleDeals.length === 1 ? 'oferta' : 'ofertas'}
          {providerSuffix}
        </span>
      </div>

      {!visibleDeals.length ? (
        <div className="col-span-full py-8 text-center text-muted-foreground">
          <p className="mb-3">
            Nenhuma oferta foi retornada automaticamente. Tente outra busca ou confira diretamente no
            Google Shopping.
          </p>
          {data.shopping_url ? (
            <Button asChild size="sm">
              <a href={data.shopping_url} target="_blank" rel="noopener noreferrer">
                Abrir no Google Shopping
              </a>
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-4">
          {!data.exact_found ? (
            <div className="col-span-full rounded-lg bg-amber-500/10 p-3 text-center text-sm text-amber-300">
              Produto exato não encontrado. Estas são opções semelhantes.
            </div>
          ) : null}

          {visibleDeals.map((deal, index) => (
            <div key={deal.url} className="contents">
              {data.exact_found && similarDeals.length && index === exactDeals.length ? (
                <div className="col-span-full my-1 border-t border-border pt-3 text-center text-sm text-muted-foreground">
                  Ofertas semelhantes
                </div>
              ) : null}
              <DealCard
                deal={deal}
                isPrimary={data.exact_found && index === 0}
                rankLabel={data.exact_found && index < exactDeals.length ? `${index + 1}º menor preço` : null}
                checked={compare.selected.has(deal.url)}
                disabled={!compare.selected.has(deal.url) && compare.atCap}
                onToggle={compare.toggle}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
