import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { MapCanvas } from './MapCanvas'

export function MapView({ budgetId, lat, lng, items, onSetItemIcon, mapLayout, onChangeMapLayout, onBackToCanvas }) {
  return (
    <div className="fixed inset-0 z-40">
      <MapCanvas budgetId={budgetId} lat={lat} lng={lng} items={items} onSetItemIcon={onSetItemIcon} mapLayout={mapLayout} onChange={onChangeMapLayout} />

      {/* Leaflet põe seu controle de zoom no canto superior esquerdo com z-index alto — o botão de
          voltar fica no canto oposto (direita) pra não ficar escondido atrás dele. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1100] flex justify-end p-4">
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
