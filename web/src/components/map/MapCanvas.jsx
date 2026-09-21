import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MapContainer, Marker, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet'
import { maplibreGL } from '@maplibre/maplibre-gl-leaflet'
import { setWorkerUrl } from 'maplibre-gl'
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'
import { icon as faIconToSvg } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLink, faLocationDot } from '@fortawesome/free-solid-svg-icons'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'maplibre-gl/dist/maplibre-gl.css'
import { getProductIcon } from '@/lib/productIcons'
import { IconPicker } from '@/components/ui/icon-picker'
import { CoverageFields, CoverageOverlay } from '@/components/map/CoverageOverlay'
import { geoFrame } from '@/lib/coverage'

// Dentro de um bundler, import.meta.url não resolve o worker do maplibre-gl de forma confiável —
// precisa apontar explicitamente pro chunk que o Vite gera (?worker&url, não só ?url, senão o
// worker perde o maplibre-gl-shared.mjs irmão dele e falha calado no primeiro import).
setWorkerUrl(maplibreWorkerUrl)

// Trocado de Google Maps (satélite + Static Maps API) pra OpenStreetMap + Leaflet (open-source),
// a pedido do usuário — nenhum provedor de satélite testado (Google, Mapbox) fica de fato livre de
// cartão/conta na prática. OSM é mapa de ruas/quadras, não foto aérea, mas é 100% sem key/conta.
// Base de tiles trocada de raster puro (tile.openstreetmap.org, que pede uso moderado — arriscado
// pra uma ferramenta comercial) pro OpenFreeMap: mesmos dados OSM, tiles vetoriais (MapLibre GL),
// hospedagem patrocinada (Cloudflare) pensada pra uso em produção, sem key/conta/limite.
// Diferença de fundo do motor anterior: aqui os ícones ficam ancorados em lat/lng real, não em
// posição de tela — sobrevivem a pan/zoom do mapa.

const OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'

// Ponte maplibre-gl-leaflet: planta o mapa vetorial (MapLibre GL) dentro do mesmo Leaflet que já
// desenha os marcadores/linhas — nenhum outro código de interação precisou mudar.
function OpenFreeMapLayer() {
  const map = useMap()
  useEffect(() => {
    const layer = maplibreGL({
      style: OPENFREEMAP_STYLE,
      attribution: 'OpenFreeMap &copy; OpenMapTiles Data from OpenStreetMap',
    }).addTo(map)
    // O canvas do MapLibre nasce com o tamanho que o container tinha no instante do addTo — se o
    // layout (flex/fullscreen) ainda não tinha assentado, ele fica "mudo" (nenhum tile é pedido)
    // até o usuário mexer no zoom/pan (confirmado: um clique manual no zoom já destrava o
    // render). map.invalidateSize() (nível Leaflet) não é suficiente porque a ponte só resincroniza
    // no evento de move/zoom, não no de resize — por isso chama resize() direto na instância
    // MapLibre por baixo.
    const raf = requestAnimationFrame(() => layer.getMaplibreMap().resize())
    return () => { cancelAnimationFrame(raf); map.removeLayer(layer) }
  }, [map])
  return null
}

// Ícone do marcador reaproveita o mesmo catálogo do cadastro de produto (lib/productIcons.js) —
// cada item do orçamento já carrega o `icon` escolhido lá, então o mapa não precisa de um
// catálogo próprio de "tipos" fixos (câmera/rack) como antes. `childCount` é o selo numérico que
// avisa "isto é um container, clique pra ver o que tem dentro".
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

// Flag do endereço do cliente — maior e vermelha pra não confundir com os ícones de equipamento
// (âmbar). Geocodificação pode errar pro lado errado da rua/quadra, por isso ela é arrastável: o
// usuário corrige a posição exata na hora de montar o mapa.
const ADDRESS_ICON = L.divIcon({
  html: `<div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:9999px 9999px 9999px 0;transform:rotate(45deg);background:#ef4444;filter:drop-shadow(0 2px 4px rgba(0,0,0,.6))"><span style="transform:rotate(-45deg);width:16px;height:16px;color:#fff">${faIconToSvg(faLocationDot).html[0]}</span></div>`,
  className: '',
  iconSize: [34, 34],
  iconAnchor: [17, 34],
})

// Ponto de dobra no meio de uma ligação — um "puxador" pequeno e neutro (mesmo amarelo da linha),
// bem menor que os ícones de equipamento pra não competir visualmente com eles.
// Alvo de arraste (iconSize) é maior que o desenho visível do puxador — ícone só de 14px é tão
// difícil de acertar quanto a linha fina era; o padding transparente ao redor conta pro hit-test do
// Leaflet sem deixar o puxador parecendo maior do que é.
const WAYPOINT_ICON = L.divIcon({
  html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><div style="width:14px;height:14px;border-radius:9999px;background:#facc15;border:2px solid rgba(10,13,20,.9);box-shadow:0 1px 3px rgba(0,0,0,.5)"></div></div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
})

// Waypoints de uma linha em ordem — leitura tolerante ao formato antigo (`waypoint` único, de antes
// de suportar vários pontos) pra não perder dobra já salva num orçamento existente.
function lineWaypoints(line) {
  return line.waypoints || (line.waypoint ? [line.waypoint] : [])
}

// Clique no mapa enquanto um item do orçamento está armado na paleta vira um marcador ali — mais
// simples que soltar (drag HTML5) em cima de um mapa Leaflet.
function ClickToPlace({ armedItemId, onPlace }) {
  useMapEvents({
    click(e) {
      if (typeof armedItemId === 'number') onPlace(armedItemId, e.latlng)
    },
  })
  return null
}

export function MapCanvas({ budgetId, lat, lng, items, coverageByItemId, onSetItemIcon, mapLayout, onChange }) {
  const [markers, setMarkers] = useState(() => mapLayout.markers || [])
  const [lines, setLines] = useState(() => mapLayout.lines || [])
  // Posição ajustável da flag do endereço — só existe estado próprio depois que o usuário arrasta
  // (mapLayout.addressPoint). Antes disso o ponto é derivado direto de lat/lng a cada render — nunca
  // fica "preso" num valor nulo capturado antes do orçamento (assíncrono) terminar de carregar.
  const [addressOverride, setAddressOverride] = useState(() => mapLayout.addressPoint || null)
  const addressPoint = addressOverride || (Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null)
  const [armedItemId, setArmedItemId] = useState(null) // null | number (id do item) | 'link'
  const [linkFromId, setLinkFromId] = useState(null)
  const nextIdRef = useRef(1)

  // Orçamento trocado (voltou pra lista e abriu outro) — recarrega o layout salvo dele.
  useEffect(() => {
    setMarkers(mapLayout.markers || [])
    setLines(mapLayout.lines || [])
    setAddressOverride(mapLayout.addressPoint || null)
    setLinkFromId(null)
    setArmedItemId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetId])

  const emit = useCallback(
    (nextMarkers, nextLines, nextAddressPoint) => onChange({ markers: nextMarkers, lines: nextLines, addressPoint: nextAddressPoint }),
    [onChange]
  )

  const moveAddressPoint = useCallback((newLat, newLng) => {
    const next = { lat: newLat, lng: newLng }
    setAddressOverride(next)
    emit(markers, lines, next)
  }, [emit, markers, lines])

  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  // Só equipamento solto (sem containerId) vira ícone próprio no mapa — o que está dentro de um
  // container (ex: câmera dentro do Rack) fica englobado no ícone do container, mesma regra que já
  // vale no canvas do orçamento. A lista de conteúdo aparece no popup ao clicar no ícone.
  // ponytail: só olha um nível (containerId direto) — container dentro de container (Rack dentro de
  // Rack) esconde os netos, já que o Rack filho nunca ganha ícone próprio. Resolver subindo a cadeia
  // até a raiz visível (mesma lógica de nearestVisibleAncestorId em useBudget.js) se isso aparecer.
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
    if (placed >= item.quantity) { setArmedItemId(null); return } // limite já atingido — ignora o clique
    const marker = { id: `marker-${Date.now()}-${nextIdRef.current++}`, itemId, lat: latlng.lat, lng: latlng.lng }
    const next = [...markers, marker]
    setMarkers(next)
    emit(next, lines, addressPoint)
    if (placed + 1 >= item.quantity) setArmedItemId(null) // acabou a cota deste item — desarma sozinho
  }, [emit, lines, markers, itemsById, addressPoint])

  const removeMarker = useCallback((id) => {
    setMarkers((prev) => {
      const next = prev.filter((m) => m.id !== id)
      setLines((prevLines) => {
        const nextLines = prevLines.filter((l) => l.fromId !== id && l.toId !== id)
        emit(next, nextLines, addressPoint)
        return nextLines
      })
      return next
    })
    setLinkFromId((current) => (current === id ? null : current))
  }, [emit, addressPoint])

  const moveMarker = useCallback((id, newLat, newLng) => {
    setMarkers((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, lat: newLat, lng: newLng } : m))
      emit(next, lines, addressPoint)
      return next
    })
  }, [emit, lines, addressPoint])

  // Direção/alcance/ângulo da área de cobertura — guardados no próprio marker, ao lado de lat/lng.
  const updateMarker = useCallback((id, patch) => {
    setMarkers((prev) => {
      const next = prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
      emit(next, lines, addressPoint)
      return next
    })
  }, [emit, lines, addressPoint])

  // Modo "Ligar" explícito (botão na paleta, mesmo padrão do armar item) — arrastar fica
  // desligado enquanto ele está ativo (ver `draggable` no Marker abaixo), pra um clique de ligar
  // nunca ser engolido pelo gesto de arrastar do Leaflet.
  const handleMarkerClick = useCallback((id) => {
    if (armedItemId !== 'link') return
    setLinkFromId((current) => {
      if (!current) return id
      if (current === id) return null
      setLines((prev) => {
        const next = [...prev, { id: `line-${Date.now()}`, fromId: current, toId: id }]
        emit(markers, next, addressPoint)
        return next
      })
      return null
    })
  }, [armedItemId, emit, markers, addressPoint])

  const byId = Object.fromEntries(markers.map((m) => [m.id, m]))

  // Ponto de dobra da ligação: clicar num trecho da linha cria um vértice ali — acha o segmento mais
  // próximo do clique (entre A, cada dobra existente e B) e insere o novo ponto exatamente nesse
  // trecho, então quantos pontos o usuário quiser, não só um. Distância aproximada (lat/lng como
  // plano) é suficiente aqui — é só pra escolher ENTRE QUAL PAR de vértices o clique caiu, não pra
  // medir metros reais.
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
      emit(markers, next, addressPoint)
      return next
    })
  }, [emit, markers, addressPoint, byId, lineWaypoints])

  const moveLineWaypoint = useCallback((lineId, waypointIndex, newLat, newLng) => {
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l
        const waypoints = lineWaypoints(l).map((w, i) => (i === waypointIndex ? { lat: newLat, lng: newLng } : w))
        return { ...l, waypoints, waypoint: undefined }
      })
      emit(markers, next, addressPoint)
      return next
    })
  }, [emit, markers, addressPoint, lineWaypoints])

  const removeLineWaypoint = useCallback((lineId, waypointIndex) => {
    setLines((prev) => {
      const next = prev.map((l) => {
        if (l.id !== lineId) return l
        const waypoints = lineWaypoints(l).filter((_, i) => i !== waypointIndex)
        return { ...l, waypoints, waypoint: undefined }
      })
      emit(markers, next, addressPoint)
      return next
    })
  }, [emit, markers, addressPoint, lineWaypoints])

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return (
      <div className="flex size-full items-center justify-center bg-flow-canvas">
        <p className="max-w-sm rounded-xl border border-border bg-card/90 p-4 text-center text-sm text-muted-foreground">
          Este orçamento ainda não tem um endereço geocodificado.
        </p>
      </div>
    )
  }

  return (
    <div className="relative size-full">
      <MapContainer center={[lat, lng]} zoom={19} maxZoom={20} className="size-full">
        <OpenFreeMapLayer />
        <ClickToPlace armedItemId={armedItemId} onPlace={placeMarker} />
        {lines.map((line) => {
          const from = byId[line.fromId]
          const to = byId[line.toId]
          if (!from || !to) return null
          const waypoints = lineWaypoints(line)
          const positions = [[from.lat, from.lng], ...waypoints.map((w) => [w.lat, w.lng]), [to.lat, to.lng]]
          return (
            <Fragment key={line.id}>
              {/* Linha "de acerto" invisível e bem mais grossa por baixo — clicar exatamente em cima
                  de um traço de 3px é difícil demais; essa aqui recebe o clique, a visível (interactive
                  desligado) só desenha. */}
              <Polyline
                positions={positions}
                pathOptions={{ color: '#000', weight: 20, opacity: 0 }}
                eventHandlers={{
                  // Só cria dobra fora de qualquer modo armado (colocar equipamento/ligar) — clique
                  // "normal" na linha, em qualquer trecho dela, mesmo que já tenha outras dobras.
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
        {addressPoint ? (
          <Marker
            position={[addressPoint.lat, addressPoint.lng]}
            icon={ADDRESS_ICON}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat: newLat, lng: newLng } = e.target.getLatLng()
                moveAddressPoint(newLat, newLng)
              },
            }}
          >
            <Popup>Endereço do cliente — arraste a flag se o mapa marcou o ponto errado.</Popup>
          </Marker>
        ) : null}
        {markers.map((marker) => {
          const item = itemsById.get(marker.itemId)
          if (!item) return null // item foi removido do orçamento depois de já colocado no mapa
          const children = childrenByContainer.get(item.id) || []
          const coverageShape = coverageByItemId?.get(item.id)
          return (
            <Fragment key={marker.id}>
            {coverageShape ? (
              <CoverageOverlay
                marker={marker}
                coverage={coverageShape}
                frame={geoFrame}
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
              {(children.length || coverageShape) && armedItemId !== 'link' ? (
                <Popup>
                  {coverageShape ? <CoverageFields marker={marker} coverage={coverageShape} onChange={(patch) => updateMarker(marker.id, patch)} /> : null}
                  {children.length ? <p className="mb-1 font-medium">{item.title} — equipamentos dentro</p> : null}
                  <ul className="flex flex-col gap-1">
                    {children.map((child) => (
                      <li key={child.id} className="flex items-center gap-1.5">
                        {/* IconPicker já mostra o ícone atual (ou o box padrão) na própria face do botão —
                            sempre clicável pra trocar, tenha ícone definido ou não. Item guardado dentro de
                            um container nunca vira botão próprio na paleta (fica englobado no ícone do
                            pai), então esta é a única forma de editar o ícone dele. */}
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
              {/* IconPicker já mostra o ícone atual (ou o box padrão) na própria face do botão — sempre
                  clicável pra trocar, tenha ícone vindo do cadastro do produto ou não. */}
              <IconPicker value={item.icon} onChange={(icon) => onSetItemIcon(item.id, icon)} />

              <button
                type="button"
                disabled={remaining <= 0}
                onClick={() => setArmedItemId((current) => (current === item.id ? null : item.id))}
                className="disabled:pointer-events-none disabled:opacity-50 hover:underline"
              >
                {item.title} ({placed}/{item.quantity}){armedItemId === item.id ? ' — clique no mapa' : ''}
              </button>
            </div>
          )
        })}
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
        A quantidade em cada botão é a do orçamento — some pra 0/N quando todos já foram colocados. Clique num ícone com selo pra ver o que tem dentro dele. Botão direito remove. Arrastar move a posição (desligado enquanto "Ligar com linha" está ativo). Clique numa linha de ligação pra criar um ponto de dobra; arraste o ponto pra ajustar, botão direito nele remove a dobra. Equipamento com área de cobertura: arraste o ponto amarelo na ponta pra ajustar direção e alcance, ou clique no ícone pra digitar os valores.
      </p>
    </div>
  )
}
