import { Fragment, useCallback, useMemo, useRef, useState } from 'react'
import { CircleMarker, ImageOverlay, MapContainer, Marker, Polyline, Popup, useMapEvents } from 'react-leaflet'
import { icon as faIconToSvg } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink, faRuler } from '@fortawesome/free-solid-svg-icons'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { getProductIcon } from '@/lib/productIcons'
import { IconPicker } from '@/components/ui/icon-picker'
import { CoverageFields, CoverageOverlay } from '@/components/map/CoverageOverlay'
import { planFrame } from '@/lib/coverage'

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
  const nextIdRef = useRef(1)

  // Escala da planta (pixels por metro), definida pelo consultor medindo uma distância conhecida na
  // imagem. Sem ela a área de cobertura (em metros) não tem como ser desenhada. Vai junto no layout.
  const [pxPerMeter, setPxPerMeter] = useState(() => floorPlanLayout.pxPerMeter || null)
  const pxPerMeterRef = useRef(pxPerMeter)
  const [scalePoints, setScalePoints] = useState([]) // até 2 pontos clicados enquanto armedItemId === 'scale'
  const [scaleMeters, setScaleMeters] = useState('')
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

  function applyScale() {
    const meters = Number(scaleMeters.replace(',', '.'))
    if (!(meters > 0) || !(scalePixelDistance > 0)) return
    const next = scalePixelDistance / meters
    pxPerMeterRef.current = next
    setPxPerMeter(next)
    emit(markers, lines, next)
    setScalePoints([])
    setScaleMeters('')
    setArmedItemId(null)
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

      <div className="pointer-events-none absolute bottom-4 left-4 z-[1000] flex max-h-[75vh] flex-col gap-2 overflow-y-auto">
        {!placeableItems.length ? (
          <p className="pointer-events-none max-w-[230px] rounded-lg bg-card/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
            Nenhum equipamento neste orçamento ainda.
          </p>
        ) : null}
        {placeableItems.map((item) => {
          const placed = placedCountByItemId.get(item.id) || 0
          const remaining = item.quantity - placed
          return (
            <div
              key={item.id}
              className={`pointer-events-auto flex items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm font-medium backdrop-blur transition-colors ${
                armedItemId === item.id ? 'border-amber-400 bg-amber-400/90 text-black' : 'border-border bg-card/90'
              }`}
            >
              <IconPicker value={item.icon} onChange={(icon) => onSetItemIcon(item.id, icon)} />
              <button
                type="button"
                disabled={remaining <= 0}
                onClick={() => setArmedItemId((current) => (current === item.id ? null : item.id))}
                className="disabled:pointer-events-none disabled:opacity-50 hover:underline"
              >
                {item.title} ({placed}/{item.quantity}){armedItemId === item.id ? ' — clique na planta' : ''}
              </button>
            </div>
          )
        })}
        {coverageByItemId?.size && !pxPerMeter ? (
          <p className="pointer-events-none max-w-[230px] rounded-lg bg-card/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur">
            Defina a escala da planta pra ver a área de cobertura dos equipamentos.
          </p>
        ) : null}
        {armedItemId === 'scale' && scalePoints.length === 2 ? (
          <div className="pointer-events-auto flex max-w-[260px] flex-col gap-2 rounded-lg border border-border bg-card/90 p-2 text-sm backdrop-blur">
            <label className="flex items-center gap-2">
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
          onClick={() => { setArmedItemId((current) => (current === 'scale' ? null : 'scale')); setScalePoints([]); setScaleMeters(''); setLinkFromId(null) }}
          className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium backdrop-blur transition-colors ${
            armedItemId === 'scale' ? 'border-amber-400 bg-amber-400/90 text-black' : 'border-border bg-card/90 hover:bg-secondary'
          }`}
        >
          <FontAwesomeIcon icon={faRuler} className="size-4" />{' '}
          {armedItemId === 'scale'
            ? scalePoints.length === 2 ? 'Informe a distância acima' : `Definir escala — clique no ${scalePoints.length ? '2º' : '1º'} ponto`
            : pxPerMeter ? 'Escala definida — refazer' : 'Definir escala'}
        </button>
        <button
          type="button"
          onClick={() => { setArmedItemId((current) => (current === 'link' ? null : 'link')); setLinkFromId(null) }}
          disabled={markers.length < 2}
          className={`pointer-events-auto flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium backdrop-blur transition-colors disabled:pointer-events-none disabled:opacity-50 ${
            armedItemId === 'link' ? 'border-amber-400 bg-amber-400/90 text-black' : 'border-border bg-card/90 hover:bg-secondary'
          }`}
        >
          <FontAwesomeIcon icon={faLink} className="size-4" /> Ligar com linha{armedItemId === 'link' ? (linkFromId ? ' — clique no segundo ícone' : ' — clique no primeiro ícone') : ''}
        </button>
      </div>

      <p className="pointer-events-none absolute bottom-4 right-4 z-[1000] max-w-[230px] rounded-lg bg-card/80 px-2 py-1 text-right text-xs text-muted-foreground backdrop-blur">
        A quantidade em cada botão é a do orçamento — some pra 0/N quando todos já foram colocados. Clique num ícone com selo pra ver o que tem dentro dele. Botão direito remove. Arrastar move a posição (desligado enquanto "Ligar com linha" está ativo). Clique numa linha de ligação pra criar um ponto de dobra; arraste o ponto pra ajustar, botão direito nele remove a dobra. Equipamento com área de cobertura: arraste o ponto amarelo na ponta pra ajustar direção e alcance, ou clique no ícone pra digitar os valores (precisa da escala definida).
      </p>
    </div>
  )
}
