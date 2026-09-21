// Geometria da área de cobertura (câmera, central de alarme sem fio...) desenhada em cima do mapa ou
// da planta baixa. Tudo aqui é puro (sem Leaflet/React) — o "frame" traduz entre o espaço de
// coordenadas do canvas ({ lat, lng }) e metros ao redor do ponto do equipamento, então o mesmo
// cálculo serve pro mapa geográfico e pra planta em pixels.
// Direção (heading) em graus, 0 = pra cima/norte, sentido horário. Ângulo só vale pro cone.

// Formas: 'cone' (setor com direção), 'circle' (360°) e 'camera' (cone com faixas de cor por
// densidade de pixels — precisa da resolução, ver DENSITY_BANDS).
export const COVERAGE_DEFAULTS = { heading: 0, range: 15, angle: 90, resolution: 1920 }
export const COVERAGE_LIMITS = { range: [1, 500], angle: [10, 350] }

// Resolução = pixels na horizontal do sensor. Lista do seletor do popup (label = como o mercado chama).
export const RESOLUTIONS = [
  [1280, '1MP (720p)'], [1920, '2MP (1080p)'], [2304, '3MP'], [2560, '4MP'], [2592, '5MP'], [3072, '6MP'], [3840, '8MP (4K)'],
]
const WIDTH_BY_MP = { 1: 1280, 2: 1920, 3: 2304, 4: 2560, 5: 2592, 6: 3072, 8: 3840 }

// Resolução padrão do equipamento a partir do título do orçamento ("Câmera IP 4MP PoE" → 2560).
// Sem sinal no título cai no padrão (Full HD) — o consultor ajusta no popup.
export function resolutionFromTitle(title) {
  const t = String(title || '').toLowerCase()
  const mp = t.match(/\b(\d{1,2})\s*mp\b/)
  if (mp && WIDTH_BY_MP[mp[1]]) return WIDTH_BY_MP[mp[1]]
  if (/\b4k\b/.test(t)) return 3840
  if (/\bhd\b/.test(t) && !/full\s?hd/.test(t)) return 1280
  return COVERAGE_DEFAULTS.resolution
}

// Faixas de densidade de pixels (px/m) da norma IEC 62676-4, da mais nítida (perto) pra mais fraca.
export const DENSITY_BANDS = [
  { ppm: 250, color: '#22c55e', label: 'Identificar' },
  { ppm: 125, color: '#facc15', label: 'Reconhecer' },
  { ppm: 62.5, color: '#fb923c', label: 'Observar' },
  { ppm: 25, color: '#ef4444', label: 'Detectar' },
]

const METERS_PER_DEGREE = 111320
const toRad = (deg) => (deg * Math.PI) / 180

// Mapa: lat/lng reais. Aproximação plana ao redor do ponto — sobra pra alcance de dezenas de metros.
export const geoFrame = {
  toMeters: (c, p) => ({ x: (p.lng - c.lng) * METERS_PER_DEGREE * Math.cos(toRad(c.lat)), y: (p.lat - c.lat) * METERS_PER_DEGREE }),
  fromMeters: (c, { x, y }) => ({ lat: c.lat + y / METERS_PER_DEGREE, lng: c.lng + x / (METERS_PER_DEGREE * Math.cos(toRad(c.lat))) }),
}

// Planta baixa (L.CRS.Simple): lat = linha (cresce pra cima), lng = coluna, em pixels da imagem.
export const planFrame = (pxPerMeter) => ({
  toMeters: (c, p) => ({ x: (p.lng - c.lng) / pxPerMeter, y: (p.lat - c.lat) / pxPerMeter }),
  fromMeters: (c, { x, y }) => ({ lat: c.lat + y * pxPerMeter, lng: c.lng + x * pxPerMeter }),
})

// Escala impressa no desenho ("ESCALA 1:25") → px/m. O arquivo de imagem não guarda o tamanho do
// papel nem o DPI, então assume que a imagem é a folha inteira: o lado maior da imagem vale o lado
// maior do papel × N. Se a imagem foi recortada, o resultado sai errado — daí a medição manual
// (dois cliques + distância real) continuar existindo como conferência/alternativa.
export const PAPER_LONG_SIDE_M = { A4: 0.297, A3: 0.42, A2: 0.594, A1: 0.841, A0: 1.189 }
export function pxPerMeterFromDrawingScale(widthPx, heightPx, paperLongSideM, ratio) {
  if (!(ratio > 0) || !(paperLongSideM > 0)) return null
  return Math.max(widthPx, heightPx) / (paperLongSideM * ratio)
}

const clamp = (value, [min, max]) => Math.min(max, Math.max(min, value))
const at = (frame, center, bearing, meters) =>
  frame.fromMeters(center, { x: meters * Math.sin(toRad(bearing)), y: meters * Math.cos(toRad(bearing)) })

// Valores salvos no marker (opcionais) com o padrão por baixo — marker antigo/recém-colocado não
// tem nada disso ainda. `defaultResolution` vem do título do item (resolutionFromTitle).
export function coverageOf(marker, defaultResolution = COVERAGE_DEFAULTS.resolution) {
  return {
    heading: Number.isFinite(marker.heading) ? marker.heading : COVERAGE_DEFAULTS.heading,
    range: Number.isFinite(marker.range) ? clamp(marker.range, COVERAGE_LIMITS.range) : COVERAGE_DEFAULTS.range,
    angle: Number.isFinite(marker.angle) ? clamp(marker.angle, COVERAGE_LIMITS.angle) : COVERAGE_DEFAULTS.angle,
    resolution: Number.isFinite(marker.resolution) && marker.resolution > 0 ? marker.resolution : defaultResolution,
  }
}

// Setor com o próprio ponto do equipamento na ponta (rIn = 0) ou fatia entre dois raios (rIn > 0).
function sector(frame, marker, heading, angle, rIn, rOut) {
  const steps = Math.max(2, Math.ceil(angle / 5))
  const arc = (r, reverse) =>
    Array.from({ length: steps + 1 }, (_, i) => at(frame, marker, heading - angle / 2 + (angle * (reverse ? steps - i : i)) / steps, r))
  const points = rIn > 0 ? [...arc(rOut, false), ...arc(rIn, true)] : [{ lat: marker.lat, lng: marker.lng }, ...arc(rOut, false)]
  return points.map((p) => [p.lat, p.lng])
}

// Vértices [lat, lng] do polígono: setor (cone/câmera) ou círculo.
export function coveragePolygon(marker, shape, frame) {
  const { heading, range, angle } = coverageOf(marker)
  if (shape !== 'circle') return sector(frame, marker, heading, angle, 0, range)
  const points = []
  for (let bearing = 0; bearing < 360; bearing += 5) points.push(at(frame, marker, bearing, range))
  return points.map((p) => [p.lat, p.lng])
}

// Pixels por metro a `meters` da câmera: a cena mede 2·d·tan(ângulo/2) de largura e o sensor tem
// `resolution` pixels nela. Ângulo limitado a 170° só pra tan() não estourar (nenhuma lente passa disso).
const sceneFactor = (angle) => 2 * Math.tan((toRad(Math.min(angle, 170))) / 2)
export const pixelDensity = (resolution, angle, meters) => resolution / (meters * sceneFactor(angle))

// Até que distância cada faixa de DENSITY_BANDS vale (a última é o alcance útil de detecção).
export function bandLimits(marker, defaultResolution) {
  const { resolution, angle } = coverageOf(marker, defaultResolution)
  return DENSITY_BANDS.map((band) => ({ ...band, distance: resolution / (band.ppm * sceneFactor(angle)) }))
}

// Fatias coloridas do cone da câmera, coladas uma na outra e cortadas no alcance definido.
// Além da faixa "Detectar" (menos de 25 px/m) não desenha nada — não presta pra identificar ninguém.
export function coverageBands(marker, frame, defaultResolution) {
  const { heading, range, angle } = coverageOf(marker, defaultResolution)
  let from = 0
  const bands = []
  for (const { color, distance } of bandLimits(marker, defaultResolution)) {
    const to = Math.min(range, distance)
    if (to > from) bands.push({ color, positions: sector(frame, marker, heading, angle, from, to) })
    from = Math.max(from, to)
  }
  return bands
}

// Puxador de arrastar: na ponta do cone (mira e alcance de uma vez) ou a leste no círculo (só alcance).
export function coverageHandle(marker, shape, frame) {
  const { heading, range } = coverageOf(marker)
  return at(frame, marker, shape === 'circle' ? 90 : heading, range)
}

// Inverso do puxador: onde o usuário soltou → novo alcance (e direção, no cone).
export function coverageFromHandle(marker, shape, frame, point) {
  const { x, y } = frame.toMeters(marker, point)
  const range = clamp(Math.hypot(x, y), COVERAGE_LIMITS.range)
  if (shape === 'circle') return { range }
  return { range, heading: (((Math.atan2(x, y) * 180) / Math.PI) + 360) % 360 }
}
