import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { getMapConfig } from '@/lib/api'
import { FloorPlanView } from '@/components/floorplan/FloorPlanView'
import { MapCanvas } from './MapCanvas'

const MODES = [['map', 'Mapa'], ['satellite', 'Satélite'], ['floorplan', 'Planta baixa']]

// Tela única do local: Mapa, Satélite e Planta baixa trocam por um seletor dentro dela (antes eram
// dois botões no orçamento + um toggle no mapa). Mapa/Satélite dependem de endereço; a planta não.
export function MapView({ budgetId, lat, lng, items, coverageByItemId, onSetItemIcon, mapLayout, onChangeMapLayout, floorPlan, floorPlanLayout, onChangeFloorPlanLayout, onUploadFloorPlan, readOnly, onBackToCanvas }) {
  const [arcgisKey, setArcgisKey] = useState(null)
  // null = automático: satélite se tem endereço, senão planta (o orçamento carrega assíncrono, então
  // não dá pra decidir isso no primeiro render).
  const [chosenMode, setChosenMode] = useState(null)
  const hasAddress = Number.isFinite(lat) && Number.isFinite(lng)
  const mode = !hasAddress ? 'floorplan' : chosenMode || 'satellite'

  useEffect(() => {
    getMapConfig().then((config) => setArcgisKey(config.arcgisKey)).catch(() => setArcgisKey(null))
  }, [])

  function disabledReason(value) {
    if (value !== 'floorplan' && !hasAddress) return 'Defina o endereço no orçamento para liberar o mapa.'
    if (value === 'satellite' && !arcgisKey) return 'Satélite indisponível: ARCGIS_API_KEY não configurada no servidor.'
    return null
  }

  return (
    <div className="fixed inset-0 z-40">
      {mode === 'floorplan' ? (
        <FloorPlanView
          budgetId={budgetId}
          floorPlan={floorPlan}
          items={items}
          coverageByItemId={coverageByItemId}
          onSetItemIcon={onSetItemIcon}
          floorPlanLayout={floorPlanLayout}
          onChangeFloorPlanLayout={onChangeFloorPlanLayout}
          onUpload={onUploadFloorPlan}
          readOnly={readOnly}
        />
      ) : (
        <MapCanvas budgetId={budgetId} lat={lat} lng={lng} items={items} coverageByItemId={coverageByItemId} onSetItemIcon={onSetItemIcon} mapLayout={mapLayout} onChange={onChangeMapLayout} satellite={mode === 'satellite'} arcgisKey={arcgisKey} />
      )}

      {/* Leaflet põe seu controle de zoom no canto superior esquerdo com z-index alto — seletor e
          voltar ficam no canto oposto (direita) pra não ficar escondidos atrás dele. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex flex-wrap justify-end gap-2 p-4">
        <div className="pointer-events-auto flex rounded-full border border-border bg-card/90 p-0.5 text-sm font-medium backdrop-blur">
          {MODES.map(([value, label]) => {
            const reason = disabledReason(value)
            // Satélite sem chave cai no mapa vetorial (MapCanvas) — o botão "Mapa" é o que aparece ativo.
            const active = mode === value || (value === 'map' && mode === 'satellite' && !arcgisKey)
            return (
              <button
                key={value}
                type="button"
                disabled={Boolean(reason)}
                title={reason || undefined}
                aria-pressed={active}
                onClick={() => setChosenMode(value)}
                className={`rounded-full px-3 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onBackToCanvas}
          className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border bg-card/90 px-4 py-1.5 text-sm font-medium backdrop-blur transition-colors hover:bg-secondary"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="size-4" /> Voltar ao orçamento
        </button>
      </div>
    </div>
  )
}
