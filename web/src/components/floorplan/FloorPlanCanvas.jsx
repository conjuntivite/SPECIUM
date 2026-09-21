import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Marker, Polyline, Popup, useMapEvents } from 'react-leaflet'
import { icon as faIconToSvg } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faChevronUp, faLink, faRuler } from '@fortawesome/free-solid-svg-icons'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getProductIcon } from '@/lib/productIcons'
import { IconPicker } from '@/components/ui/icon-picker'
import { CoverageFields, CoverageLegend, CoverageOverlay } from '@/components/map/CoverageOverlay'
import { PAPER_LONG_SIDE_M, planFrame, pxPerMeterFromDrawingScale } from '@/lib/coverage'

// Alternativa ao mapa geográfico (MapCanvas): mesma interação (posicionar item, trocar ícone,
// ligar com linha, ponto de dobra), mas em cima de uma imagem enviada pelo consultor (planta
// baixa) em vez de tiles do OpenStreetMap. `L.CRS.Simple` faz o Leaflet tratar coordenadas como
// pixel plano da imagem — os markers/lines guardam { lat, lng } igual ao mapa, só que aqui lat/lng
// é linha/coluna da imagem, não latitude/longitude real. Nenhuma outra peça da interação muda por
// causa disso — o mesmo `e.latlng` de clique/drag do Leaflet já sai no espaço de coordenadas certo.
// ponytail: bastante duplicado de MapCanvas.jsx (markers/lines/waypoints são quase idênticos) —
// aceitável enquanto só existem esses dois consumidores; extrair um hook compartilhado se um
// terceiro tipo de canvas aparecer.

function buildMarkerIcon(item, highlighted, childCount) {
  const svg = faIconToSvg(getProductIcon(item.icon)).html[0]
  const ring = highlighted ? 'box-shadow:0 0 0 3px #facc15;' : ''
  const badge = childCount > 0
    ? `<span style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:9999px;background:#facc15;color:#1a1400;font:700 10px/16px sans-serif;text-align:center;">${childCount}</span>`
    : ''
  return L.divIcon({
    html: `<div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:rgba(10,13,20,.85);color:#fbbf24;${ring}filter:drop-shadow(0 1px 3px rgba(0,0,0,.7))"><span style="width:15px;height:15px">${svg}</span>${badge}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  })
}

const WAYPOINT_ICON = L.divIcon({
  html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:14px;border-radius:9999px;background:#facc15;border:2px solid rgba(10,13,20,.9);box-shadow:0 1px 3px rgba(0,0,0,.5)"></div></div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

function lineWaypoints(line) {
  return line.waypoints || (line.waypoint ? [line.waypoint] : [])
}

function ClickToPlace({ armedItemId, onPlace, onScalePoint }) {
  useMapEvents({
    click(e) {
      if (typeof armedItemId === 'number') onPlace(armedItemId, e.latlng)
      else if (armedItemId === 'scale') onScalePoint(e.latlng)
    },
  })
  return null
}

export function FloorPlanCanvas({ budgetId, floorPlan, items, coverageByItemId, onSetItemIcon, floorPlanLayout, onChange }) {
  const bounds = useMemo(() => [[0, 0], [floorPlan.height, floorPlan.width]], [floorPlan.height, floorPlan.width])

  const [markers, setMarkers] = useState(() => floorPlanLayout.markers || [])
  const [lines, setLines] = useState(() => floorPlanLayout.lines || [])
  const [armedItemId, setArmedItemId] = useState(null) // null | number (id do item) | 'link' | 'scale'
  const [linkFromId, setLinkFromId] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(true)
  const nextIdRef = useRef(1)

  // Escala da planta (pixels por metro), definida pelo consultor medindo uma distância conhecida na
  // imagem. Sem ela a área de cobertura (em metros) não tem como ser desenhada. Vai junto no layout.
  const [pxPerMeter, setPxPerMeter] = useState(() => floorPlanLayout.pxPerMeter || null)
  const pxPerMeterRef = useRef(pxPerMeter)
  const [scalePoints, setScalePoints] = useState([]) // até 2 pontos clicados enquanto armedItemId === 'scale'
  const [scaleMeters, setScaleMeters] = useState('')
  const [drawingScale, setDrawingScale] = useState(null) // formulário "escala do desenho": null | { ratio, paper }
  const frame = useMemo(() => (pxPerMeter ? planFrame(pxPerMeter) : null), [pxPerMeter])

  const emit = useCallback(
    (nextMarkers, nextLines, scale = pxPerMeterRef.current) => onChange({ markers: nextMarkers, lines: nextLines, pxPerMeter: scale }),
    [onChange]
  )

  const addScalePoint = useCallback((latlng) => {
    setScalePoints((prev) => (prev.length >= 2 ? prev : [...prev, { lat: latlng.lat, lng: latlng.lng }]))
  }, [])

  const scalePixelDistance = scalePoints.length === 2
    ? Math.hypot(scalePoints[1].lat - scalePoints[0].lat, scalePoints[1].lng - scalePoints[0].lng)
    : 0

  function commitScale(next) {
    pxPerMeterRef.current = next
    setPxPerMeter(next)
    emit(markers, lines, next)
    setScalePoints([])
    setScaleMeters('')
    setDrawingScale(null)
    setArmedItemId(null)
  }

  function applyScale() {
    const meters = Number(scaleMeters.replace(',', '.'))
    if (!(meters > 0) || !(scalePixelDistance > 0)) return
    commitScale(scalePixelDistance / meters)
  }

  function applyDrawingScale() {
    const next = pxPerMeterFromDrawingScale(floorPlan.width, floorPlan.height, PAPER_LONG_SIDE_M[drawingScale.paper], Number(drawingScale.ratio))
    if (next) commitScale(next)
  }

  const updateMarker = useCallback((id, patch) => {
    setMarkers((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      emit(next, lines)
      return next
    })
  }, [emit, lines])

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  const childrenByContainer = useMemo(() => {
    const map = new Map()
    items.forEach((item) => {
      if (item.containerId == null) return
      if (!map.has(item.containerId)) map.set(item.containerId, [])
      map.get(item.containerId).push(item)
    })
    return map
  }, [items])

  const placeableItems = useMemo(
    () => items.filter((item) => item.containerId == null),
    [items]
  )

  const placedCountByItemId = useMemo(() => {
    const counts = new Map()
    markers.forEach((m) => counts.set(m.itemId, (counts.get(m.itemId) || 0) + 1))
    return counts
  }, [markers])

  const placeMarker = useCallback((itemId, latlng) => {
    const item = itemsById.get(itemId)
    if (!item) return
    const placed = markers.filter((m) => m.itemId === itemId).length
    if (placed >= item.quantity) { setArmedItemId(null); return }
    const marker = { id: `marker-${Date.now()}-${nextIdRef.current++}`, itemId, lat: latlng.lat, lng: latlng.lng }
    const next = [...markers, marker]
    setMarkers(next)
    emit(next, lines)
    if (placed + 1 >= item.quantity) setArmedItemId(null)
  }, [emit, lines, markers, itemsById])

  const removeMarker = useCallback((id) => {
    setMarkers((prev) => {
      const next = prev.filter((m) => m.id !== id)
      setLines((prevLines) => {
        const nextLines = prevLines.filter((l) => l.fromId !== id && l.toId !== id)
        emit(next, nextLines)
        return nextLines
      })
      return next
    })
    setLinkFromId((current) => (current === id ? null : current))
  }, [emit])

  const moveMarker = useCallback((id, newLat, newLng) => {
    setMarkers((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, lat: newLat, lng: newLng } : m))
      emit(next, lines)
      return next
    })
  }, [emit, lines])

  const handleMarkerClick = useCallback((id) => {
    if (armedItemId !== 'link') return
    setLinkFromId((current) => {
      if (!current) return id
      if (current === id) return null
      setLines((prev) => {
        const next = [...prev, { id: `line-${Date.now()}`, fromId: current, toId: id }]
        emit(markers, next)
        return next
      })
      return null
    })
  }, [armedItemId, emit, markers])

  const byId = Object.fromEntries(markers.map((m) => [m.id, m]))

  function closestSegmentIndex(point, vertices) {
    let bestIndex = 0
    let bestDistSq = Infinity
    for (let i = 0; i < vertices.length - 1; i++) {
      const a = vertices[i], b = vertices[i + 1]
      const dx = b.lng - a.lng, dy = b.lat - a.lat
      const lengthSq = dx * dx + dy * dy
      let t = lengthSq === 0 ? 0 : ((point.lng - a.lng) * dx + (point.lat - a.lat) * dy) / lengthSq
      t = Math.max(0, Math.min(1, t))
      const projLng = a.lng + t * dx, projLat = a.lat + t * dy
      const distSq = (point.lng - projLng) ** 2 + (point.lat - projLat) ** 2
      if (distSq < bestDistSq) { bestDistSq = distSq; bestIndex = i }
    }
    return bestIndex
  }

  const addLineWaypoint = useCallback((lineId, latlng) => {
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l
        const from = byId[l.fromId], to = byId[l.toId]
        if (!from || !to) return l
        const waypoints = lineWaypoints(l)
        const segmentIndex = closestSegmentIndex(latlng, [from, ...waypoints, to])
        const nextWaypoints = [...waypoints.slice(0, segmentIndex), { lat: latlng.lat, lng: latlng.lng }, ...waypoints.slice(segmentIndex)]
        return { ...l, waypoints: nextWaypoints, waypoint: undefined }
      })
      emit(markers, next)
      return next
    })
  }, [emit, markers, byId])

  const moveLineWaypoint = useCallback((lineId, waypointIndex, newLat, newLng) => {
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l
        const waypoints = lineWaypoints(l).map((w, i) => (i === waypointIndex ? { lat: newLat, lng: newLng } : w))
        return { ...l, waypoints, waypoint: undefined }
      })
      emit(markers, next)
      return next
    })
  }, [emit, markers])

  const removeLineWaypoint = useCallback((lineId, waypointIndex) => {
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l
        const waypoints = lineWaypoints(l).filter((_, i) => i !== waypointIndex)
        return { ...l, waypoints, waypoint: undefined }
      })
      emit(markers, next)
      return next
    })
  }, [emit, markers])

  return (
    <div className="relative size-full">
      <MapContainer crs={L.CRS.Simple} bounds={bounds} minZoom={-10} maxZoom={4} className="size-full bg-flow-canvas">
        <ImageOverlay url={floorPlan.path} bounds={bounds} />
        <ClickToPlace armedItemId={armedItemId} onPlace={placeMarker} onScalePoint={addScalePoint} />
        {armedItemId === 'scale' ? (
          <>
            {scalePoints.length === 2 ? (
              <Polyline positions={scalePoints.map((p) => [p.lat, p.lng])} pathOptions={{ color: '#facc15', weight: 2, dashArray: '6 6', interactive: false }} />
            ) : null}
            {scalePoints.map((p, i) => (
              <CircleMarker key={i} center={[p.lat, p.lng]} radius={5} pathOptions={{ color: '#1a1400', weight: 2, fillColor: '#facc15', fillOpacity: 1, interactive: false }} />
            ))}
          </>
        ) : null}
        {lines.map((line) => {
          const from = byId[line.fromId]
          const to = byId[line.toId]
          if (!from || !to) return null
          const waypoints = lineWaypoints(line)
          const positions = [[from.lat, from.lng], ...waypoints.map((w) => [w.lat, w.lng]), [to.lat, to.lng]]
          return (
            <Fragment key={line.id}>
              <Polyline
                positions={positions}
                pathOptions={{ color: '#000', weight: 20, opacity: 0 }}
                eventHandlers={{
                  click: (e) => { if (armedItemId == null) addLineWaypoint(line.id, e.latlng) },
                }}
              />
              <Polyline positions={positions} pathOptions={{ color: '#facc15', weight: 3, interactive: false }} />
              {waypoints.map((waypoint, index) => (
                <Marker
                  key={index}
                  position={[waypoint.lat, waypoint.lng]}
                  icon={WAYPOINT_ICON}
                  draggable={armedItemId !== 'link'}
                  eventHandlers={{
                    dragend: (e) => {
                      const { lat: newLat, lng: newLng } = e.target.getLatLng()
                      moveLineWaypoint(line.id, index, newLat, newLng)
                    },
                    contextmenu: (e) => { e.originalEvent.preventDefault(); removeLineWaypoint(line.id, index) },
                  }}
                />
              ))}
            </Fragment>
          )
        })}
        {markers.map((marker) => {
          const item = itemsById.get(marker.itemId)
          if (!item) return null
          const children = childrenByContainer.get(item.id) || []
          const coverageShape = coverageByItemId?.get(item.id)
          return (
            <Fragment key={marker.id}>
            {coverageShape && frame ? (
              <CoverageOverlay
                marker={marker}
                coverage={coverageShape}
                frame={frame}
                draggable={armedItemId !== 'link'}
                onChange={(patch) => updateMarker(marker.id, patch)}
              />
            ) : null}
            <Marker
              position={[marker.lat, marker.lng]}
              icon={buildMarkerIcon(item, marker.id === linkFromId, children.length)}
              draggable={armedItemId !== 'link'}
              eventHandlers={{
                click: () => handleMarkerClick(marker.id),
                dragend: (e) => {
                  const { lat: newLat, lng: newLng } = e.target.getLatLng()
                  moveMarker(marker.id, newLat, newLng)
                },
                contextmenu: (e) => { e.originalEvent.preventDefault(); removeMarker(marker.id) },
              }}
            >
              {(children.length || (coverageShape && frame)) && armedItemId !== 'link' ? (
                <Popup>
                  {coverageShape && frame ? <CoverageFields marker={marker} coverage={coverageShape} onChange={(patch) => updateMarker(marker.id, patch)} /> : null}
                  {children.length ? <p className="mb-1 font-medium">{item.title} — equipamentos dentro</p> : null}
                  <ul className="flex flex-col gap-1">
                    {children.map((child) => (
                      <li key={child.id} className="flex items-center gap-1.5">
                        <IconPicker value={child.icon} onChange={(icon) => onSetItemIcon(child.id, icon)} />
                        <span>{child.title} × {child.quantity}</span>
                      </li>
                    ))}
                  </ul>
                </Popup>
              ) : null}
            </Marker>
            </Fragment>
          )
        })}
      </MapContainer>

      {frame && markers.some((m) => coverageByItemId?.get(m.itemId)?.shape === 'camera') ? <CoverageLegend /> : null}

      {/* Painel único, pequeno e recolhível — a planta é o foco, então a lista de equipamentos não
          pode cobrir uma fatia dela. Título truncado (tooltip mostra inteiro); a contagem fica sempre visível. */}
      <div className="pointer-events-auto absolute bottom-4 left-4 z-[1000] flex max-h-[45vh] w-[200px] flex-col rounded-lg border border-border bg-card/85 text-xs backdrop-blur">
        <button
          type="button"
          onClick={() => setPaletteOpen((open) => !open)}
          className="flex items-center justify-between px-2 py-1.5 font-medium"
        >
          Equipamentos
          <FontAwesomeIcon icon={paletteOpen ? faChevronDown : faChevronUp} className="size-3" />
        </button>
        {paletteOpen ? (
        <div className="flex flex-col gap-1 overflow-y-auto p-1 pt-0">
        {!placeableItems.length ? (
          <p className="px-1 text-muted-foreground">Nenhum equipamento neste orçamento ainda.</p>
        ) : null}
        {placeableItems.map((item) => {
          const placed = placedCountByItemId.get(item.id) || 0
          const remaining = item.quantity - placed
          return (
            <div
              key={item.id}
              className={`flex items-center gap-1 rounded-md border py-0.5 pr-1.5 pl-0.5 transition-colors ${
                armedItemId === item.id ? 'border-amber-400 bg-amber-400/90 text-black' : 'border-border'
              }`}
            >
              <IconPicker compact value={item.icon} onChange={(icon) => onSetItemIcon(item.id, icon)} />
              <button
                type="button"
                disabled={remaining <= 0}
                title={`${item.title} (${placed}/${item.quantity})${armedItemId === item.id ? ' — clique na planta' : ''}`}
                onClick={() => setArmedItemId((current) => (current === item.id ? null : item.id))}
                className="flex min-w-0 flex-1 items-center gap-1 text-left disabled:pointer-events-none disabled:opacity-50 hover:underline"
              >
                <span className="truncate">{item.title}</span>
                <span className="ml-auto shrink-0 tabular-nums">{placed}/{item.quantity}</span>
              </button>
            </div>
          )
        })}
        {coverageByItemId?.size && !pxPerMeter ? (
          <p className="px-1 text-muted-foreground">Defina a escala pra ver a área de cobertura.</p>
        ) : null}
        {armedItemId === 'scale' && scalePoints.length === 2 ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-2">
            <label className="flex flex-wrap items-center gap-2">
              Distância real entre os pontos
              <input
                autoFocus
                inputMode="decimal"
                value={scaleMeters}
                onChange={(e) => setScaleMeters(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') applyScale() }}
                className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-right"
              />
              m
            </label>
            <div className="flex gap-2">
              <button type="button" onClick={applyScale} className="rounded-full bg-amber-400 px-3 py-1 font-medium text-black hover:bg-amber-300">Aplicar</button>
              <button type="button" onClick={() => { setScalePoints([]); setScaleMeters(''); setArmedItemId(null) }} className="rounded-full border border-border px-3 py-1 hover:bg-secondary">Cancelar</button>
            </div>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => { setArmedItemId((current) => (current === 'scale' ? null : 'scale')); setScalePoints([]); setScaleMeters(''); setLinkFromId(null); setDrawingScale(null) }}
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left font-medium transition-colors ${
            armedItemId === 'scale' ? 'border-amber-400 bg-amber-400/90 text-black' : 'border-border hover:bg-secondary'
          }`}
        >
          <FontAwesomeIcon icon={faRuler} className="size-3.5 shrink-0" />{' '}
          {armedItemId === 'scale'
            ? scalePoints.length === 2 ? 'Informe a distância' : `Escala — clique no ${scalePoints.length ? '2º' : '1º'} ponto`
            : pxPerMeter ? 'Refazer medindo' : 'Medir escala'}
        </button>
        {/* A planta já traz "ESCALA 1:25" no carimbo — informar isso é mais rápido que medir uma cota. */}
        <button
          type="button"
          onClick={() => { setDrawingScale((current) => (current ? null : { ratio: '25', paper: 'A4' })); setArmedItemId(null); setScalePoints([]); setScaleMeters('') }}
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left font-medium transition-colors ${
            drawingScale ? 'border-amber-400 bg-amber-400/90 text-black' : 'border-border hover:bg-secondary'
          }`}
        >
          <FontAwesomeIcon icon={faRuler} className="size-3.5 shrink-0" /> Escala do desenho (1:N)
        </button>
        {drawingScale ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-2">
            <label className="flex items-center gap-1.5">
              Escala 1:
              <input
                autoFocus
                inputMode="numeric"
                value={drawingScale.ratio}
                onChange={(e) => setDrawingScale((s) => ({ ...s, ratio: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') applyDrawingScale() }}
                className="w-14 rounded border border-border bg-background px-1.5 py-0.5 text-right"
              />
            </label>
            <label className="flex items-center gap-1.5">
              Folha
              <select
                value={drawingScale.paper}
                onChange={(e) => setDrawingScale((s) => ({ ...s, paper: e.target.value }))}
                className="rounded border border-border bg-background px-1 py-0.5"
              >
                {Object.keys(PAPER_LONG_SIDE_M).map((paper) => <option key={paper} value={paper}>{paper}</option>)}
              </select>
            </label>
            <p className="text-muted-foreground">Vale quando a imagem é a folha inteira. Se cortada, use "Medir escala".</p>
            <div className="flex gap-2">
              <button type="button" onClick={applyDrawingScale} className="rounded-full bg-amber-400 px-3 py-1 font-medium text-black hover:bg-amber-300">Aplicar</button>
              <button type="button" onClick={() => setDrawingScale(null)} className="rounded-full border border-border px-3 py-1 hover:bg-secondary">Cancelar</button>
            </div>
          </div>
        ) : null}
        {pxPerMeter ? <p className="px-1 text-muted-foreground">Escala atual: 10 m ≈ {Math.round(pxPerMeter * 10)} px</p> : null}
        <button
          type="button"
          onClick={() => { setArmedItemId((current) => (current === 'link' ? null : 'link')); setLinkFromId(null) }}
          disabled={markers.length < 2}
          className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-left font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${
            armedItemId === 'link' ? 'border-amber-400 bg-amber-400/90 text-black' : 'border-border hover:bg-secondary'
          }`}
        >
          <FontAwesomeIcon icon={faLink} className="size-3.5 shrink-0" /> {armedItemId === 'link' ? (linkFromId ? 'Clique no 2º ícone' : 'Clique no 1º ícone') : 'Ligar com linha'}
        </button>
        </div>
        ) : null}
      </div>

      <details className="pointer-events-auto absolute bottom-4 right-4 z-[1000] max-w-[260px] rounded-lg bg-card/85 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
        <summary className="cursor-pointer select-none text-right font-medium">Ajuda</summary>
        <p className="mt-1 text-right">
        A quantidade em cada botão é a do orçamento — some pra 0/N quando todos já foram colocados. Clique num ícone com selo pra ver o que tem dentro dele. Botão direito remove. Arrastar move a posição (desligado enquanto "Ligar com linha" está ativo). Clique numa linha de ligação pra criar um ponto de dobra; arraste o ponto pra ajustar, botão direito nele remove a dobra. Equipamento com área de cobertura: arraste o ponto amarelo na ponta pra ajustar direção e alcance, ou clique no ícone pra digitar os valores (precisa da escala definida).
        </p>
      </details>
    </div>
  )
}
