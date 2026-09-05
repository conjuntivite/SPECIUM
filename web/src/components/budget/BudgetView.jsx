import { useRef } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { useBudget } from '@/hooks/useBudget'
import { formatBRL } from '@/lib/money'
import { FlowLegend } from './FlowLegend'
import { SuggestionsStrip } from './SuggestionsStrip'
import { BudgetCanvas } from './BudgetCanvas'

// Canvas ocupa a janela inteira — controles de adicionar item, zoom, verificar preços e limpar
// fluxo saíram da tela e viraram opções do menu de botão direito em cima do canvas (ver
// BudgetCanvas). O que continua visível fica flutuando por cima do canvas: legenda + total,
// listinha de sugestões e o botão pra voltar pra busca avançada.
export function BudgetView({ onSwitchToSearch, onGoToProducts }) {
  const budget = useBudget()
  // SuggestionsStrip é irmã de BudgetCanvas aqui embaixo — o ref é o jeito de mandar o clique no
  // "+" passar pelo mesmo seletor de produto cadastrado que o menu de botão direito usa.
  const canvasRef = useRef(null)

  return (
    <div className="fixed inset-0 z-40">
      <ReactFlowProvider>
        <BudgetCanvas ref={canvasRef} budget={budget} onGoToProducts={onGoToProducts} />

        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="pointer-events-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onSwitchToSearch}
                className="rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm font-medium backdrop-blur hover:bg-secondary"
              >
                🔍 Busca avançada por item
              </button>
              <button
                type="button"
                onClick={onGoToProducts}
                className="rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm font-medium backdrop-blur hover:bg-secondary"
              >
                📦 Produtos
              </button>
            </div>

            <div className="pointer-events-auto flex flex-wrap items-center gap-4 rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
              <FlowLegend compact />
              {budget.total > 0 ? (
                <span className="font-mono font-bold text-flow-green">{formatBRL(budget.total)}</span>
              ) : null}
            </div>
          </div>

          <div className="pointer-events-auto">
            <SuggestionsStrip suggestions={budget.suggestions} onAdd={(req) => canvasRef.current?.addSuggestion(req)} />
          </div>
        </div>

        {!budget.items.length ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="max-w-sm rounded-xl border border-border bg-card/90 p-4 text-center text-sm text-muted-foreground backdrop-blur">
              Nenhum item no fluxo ainda. Clique com o botão direito no canvas para adicionar o
              primeiro equipamento (ex: Câmera IP).
            </p>
          </div>
        ) : null}

        {budget.priceError ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
            <p className="pointer-events-auto rounded-full border border-destructive/40 bg-card/90 px-4 py-1.5 text-sm text-destructive backdrop-blur">
              ⚠️ {budget.priceError}
            </p>
          </div>
        ) : null}

        {budget.priceLoading ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
            <p className="pointer-events-auto rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm backdrop-blur">
              Buscando preço de cada item do orçamento...
            </p>
          </div>
        ) : null}
      </ReactFlowProvider>
    </div>
  )
}
