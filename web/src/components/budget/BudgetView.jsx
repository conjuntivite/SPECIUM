import { useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faBars, faBox, faEye, faFloppyDisk, faList, faLocationDot, faMagnifyingGlass, faMapLocationDot, faMap, faPenToSquare, faTag, faTriangleExclamation, faXmark } from '@fortawesome/free-solid-svg-icons'
import { ReactFlowProvider } from '@xyflow/react'
import { useBudget } from '@/hooks/useBudget'
import { formatBRL } from '@/lib/money'
import { FlowLegend } from './FlowLegend'
import { SuggestionsStrip } from './SuggestionsStrip'
import { BudgetCanvas } from './BudgetCanvas'
import { AddressDialog } from './AddressDialog'
import { MapView } from '@/components/map/MapView'
import { FloorPlanView } from '@/components/floorplan/FloorPlanView'

const PILL = 'flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm font-medium backdrop-blur transition-colors hover:bg-secondary'
const PILL_DISABLED = 'disabled:pointer-events-none disabled:opacity-50'

const STATUS_LABEL = { aberto: 'Aberto', negociacao: 'Em negociação', fechado: 'Fechado' }
const STATUS_OPTIONS = ['aberto', 'negociacao', 'fechado']

// Canvas ocupa a janela inteira — controles de adicionar item, zoom, verificar preços e limpar
// fluxo saíram da tela e viraram opções do menu de botão direito em cima do canvas (ver
// BudgetCanvas). O que continua visível fica flutuando por cima do canvas: legenda + total,
// listinha de sugestões e o botão pra voltar pra busca avançada.
//
// Jornada do orçamento (status): aberto / em negociação / fechado — o consultor escolhe a etapa
// no seletor da barra superior, o sistema nunca decide sozinho. "Salvar" só grava itens/posições/
// conexões (nada mais autosalva no canvas). "Cancelar" descarta o que foi mexido desde o último
// Salvar. "fechado" trava o orçamento pra só-leitura (ver `readOnly`), não dá pra reabrir por aqui.
export function BudgetView({ budgetId, initialStep, onBackToList, onSwitchToSearch, onGoToProducts, onGoToCategories }) {
  const budget = useBudget(budgetId)
  // SuggestionsStrip é irmã de BudgetCanvas aqui embaixo — o ref é o jeito de mandar o clique no
  // "+" passar pelo mesmo seletor de produto cadastrado que o menu de botão direito usa.
  const canvasRef = useRef(null)
  const [step, setStep] = useState(initialStep || 'canvas')
  const [addressDialogOpen, setAddressDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [navOpen, setNavOpen] = useState(false)

  const hasAddress = Number.isFinite(budget.lat) && Number.isFinite(budget.lng)
  // Fechado = só visualização (pedido explícito) — nada de mexer em endereço, itens, ligações ou
  // etapa a partir daqui; o servidor também recusa (updateBudgetForUser/setBudgetAddressForUser),
  // isto aqui só evita oferecer um botão que ia dar erro.
  const readOnly = budget.status === 'fechado'

  async function handleSave() {
    setSaving(true)
    try {
      await budget.save()
      onBackToList()
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    budget.discard()
    onBackToList()
  }

  if (step === 'map') {
    return (
      <MapView
        budgetId={budgetId}
        lat={budget.lat}
        lng={budget.lng}
        items={budget.items}
        onSetItemIcon={budget.setItemIcon}
        mapLayout={budget.mapLayout}
        onChangeMapLayout={budget.setMapLayout}
        onBackToCanvas={() => setStep('canvas')}
      />
    )
  }

  if (step === 'floorplan') {
    return (
      <FloorPlanView
        budgetId={budgetId}
        floorPlan={budget.floorPlan}
        items={budget.items}
        onSetItemIcon={budget.setItemIcon}
        floorPlanLayout={budget.floorPlanLayout}
        onChangeFloorPlanLayout={budget.setFloorPlanLayout}
        onUpload={budget.uploadFloorPlan}
        onBackToCanvas={() => setStep('canvas')}
      />
    )
  }

  return (
    <div className="fixed inset-0 z-40">
      <ReactFlowProvider>
        <BudgetCanvas ref={canvasRef} budget={budget} onGoToProducts={onGoToProducts} readOnly={readOnly} />
        <AddressDialog
          budgetId={budgetId}
          open={addressDialogOpen}
          onOpenChange={setAddressDialogOpen}
          isEditing={hasAddress}
          initialClientName={budget.clientName}
          initialAddress={budget.address}
          initialNumber={budget.number}
          onSaved={(updatedBudget) => {
            budget.applyAddress(updatedBudget)
            setAddressDialogOpen(false)
            if (!hasAddress) setStep('map') // primeira vez que o endereço é definido já leva pro mapa; editar depois não navega sozinho
          }}
        />

        {/* pr-16 (bem além do p-4 padrão) — o botão de tema é fixed top-4 right-4 com z-50, por cima
            de tudo; sem essa folga extra à direita, o grupo de ações (Salvar por último) encosta e
            fica parcialmente escondido atrás dele. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-3 p-4 pr-16">
          <div className="pointer-events-auto relative">
            <button
              type="button"
              onClick={() => setNavOpen((o) => !o)}
              title={navOpen ? 'Fechar menu' : 'Abrir menu'}
              className={PILL}
            >
              <FontAwesomeIcon icon={navOpen ? faXmark : faBars} className="size-4" />
            </button>
            {/* Retrátil: abre de cima pra baixo por cima do resto da tela (position absolute, não
                participa do flex da barra) — max-height animado + overflow-hidden. Fora do fluxo de
                propósito: se entrasse no flex normal, abrir o menu empurraria o resto da barra. */}
            <div
              className={`absolute left-0 top-full z-20 mt-2 flex flex-col items-start gap-2 overflow-hidden transition-[max-height,opacity] duration-300 ${navOpen ? 'max-h-[320px] opacity-100' : 'max-h-0 opacity-0'}`}
            >
              <button type="button" onClick={onBackToList} className={`${PILL} whitespace-nowrap`}>
                <FontAwesomeIcon icon={faList} className="size-4" /> Meus orçamentos
              </button>
              <button type="button" onClick={onSwitchToSearch} className={`${PILL} whitespace-nowrap`}>
                <FontAwesomeIcon icon={faMagnifyingGlass} className="size-4" /> Busca avançada por item
              </button>
              <button type="button" onClick={onGoToProducts} className={`${PILL} whitespace-nowrap`}>
                <FontAwesomeIcon icon={faBox} className="size-4" /> Produtos
              </button>
              <button type="button" onClick={onGoToCategories} className={`${PILL} whitespace-nowrap`}>
                <FontAwesomeIcon icon={faTag} className="size-4" /> Categorias
              </button>
            </div>
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-4 rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur">
            <FlowLegend compact />
            {budget.total > 0 ? (
              <span className="font-mono font-bold text-flow-green">{formatBRL(budget.total)}</span>
            ) : null}
          </div>

          <div className="pointer-events-auto flex flex-wrap items-center gap-2">
            {readOnly ? (
              <span className={PILL}>{STATUS_LABEL[budget.status] || budget.status}</span>
            ) : (
              <select
                value={budget.status}
                onChange={(event) => budget.changeStatus(event.target.value)}
                title="Etapa do orçamento"
                className={`${PILL} cursor-pointer`}
              >
                {STATUS_OPTIONS.map((value) => (
                  <option key={value} value={value}>{STATUS_LABEL[value]}</option>
                ))}
              </select>
            )}

            {readOnly ? (
              hasAddress ? (
                <span className={`${PILL} max-w-[280px]`}>
                  <FontAwesomeIcon icon={faLocationDot} className="size-4 shrink-0 text-destructive" />
                  <span className="truncate">{budget.address}{budget.number ? `, ${budget.number}` : ''}</span>
                </span>
              ) : null
            ) : (
              <button
                type="button"
                onClick={() => setAddressDialogOpen(true)}
                title={hasAddress ? 'Editar endereço' : 'Definir endereço'}
                className={`${PILL} max-w-[280px]`}
              >
                <FontAwesomeIcon icon={faLocationDot} className="size-4 shrink-0 text-destructive" />
                {hasAddress ? (
                  <span className="truncate">{budget.address}{budget.number ? `, ${budget.number}` : ''}</span>
                ) : (
                  <span>Definir endereço</span>
                )}
                <FontAwesomeIcon icon={faPenToSquare} className="size-3.5 shrink-0 text-muted-foreground" />
              </button>
            )}

            {hasAddress ? (
              <button type="button" onClick={() => setStep('map')} className={PILL}>
                <FontAwesomeIcon icon={faMapLocationDot} className="size-4" /> Ver mapa
              </button>
            ) : null}

            {/* Alternativa ao mapa — não depende de endereço, o consultor pode montar a planta
                baixa a qualquer momento. */}
            <button type="button" onClick={() => setStep('floorplan')} className={PILL}>
              <FontAwesomeIcon icon={faMap} className="size-4" /> Planta baixa
            </button>

            {readOnly ? (
              <span className={PILL} title="Orçamento fechado — só visualização">
                <FontAwesomeIcon icon={faEye} className="size-4" /> Somente visualização
              </span>
            ) : (
              <>
                <button type="button" onClick={handleCancel} className={`${PILL} text-destructive`}>
                  <FontAwesomeIcon icon={faXmark} className="size-4" /> Cancelar
                </button>

                <button
                  type="button"
                  disabled={!budget.items.length || saving}
                  title={!budget.items.length ? 'Adicione ao menos um equipamento no fluxo antes' : undefined}
                  onClick={handleSave}
                  className={`${PILL} ${PILL_DISABLED} text-flow-green`}
                >
                  <FontAwesomeIcon icon={faFloppyDisk} className="size-4" /> {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Coluna direita, abaixo da barra superior — era faixa horizontal em cima do canvas antes.
            Some no modo só-visualização: são sugestões de equipamento pra ADICIONAR, sem sentido
            num orçamento fechado. */}
        {!readOnly ? (
          <div className="pointer-events-none absolute right-4 top-20 bottom-4 z-10">
            <div className="pointer-events-auto h-full">
              <SuggestionsStrip suggestions={budget.suggestions} onAdd={(req) => canvasRef.current?.addSuggestion(req)} />
            </div>
          </div>
        ) : null}

        {budget.loaded && !budget.items.length ? (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <p className="max-w-sm rounded-xl border border-border bg-card/90 p-4 text-center text-sm text-muted-foreground backdrop-blur">
              {readOnly
                ? 'Nenhum item neste orçamento.'
                : 'Nenhum item no fluxo ainda. Clique com o botão direito no canvas para adicionar o primeiro equipamento (ex: Câmera IP).'}
            </p>
          </div>
        ) : null}

        {budget.priceError ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 flex justify-center">
            <p className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-destructive/40 bg-card/90 px-4 py-1.5 text-sm text-destructive backdrop-blur">
              <FontAwesomeIcon icon={faTriangleExclamation} className="size-4" /> {budget.priceError}
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
