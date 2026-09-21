import { useMemo, useState } from 'react'
import { Marker, Polygon } from 'react-leaflet'
import L from 'leaflet'
import {
  COVERAGE_LIMITS, DENSITY_BANDS, RESOLUTIONS, bandLimits, coverageBands, coverageFromHandle, coverageHandle, coverageOf, coveragePolygon, pixelDensity,
} from '@/lib/coverage'

// Área de cobertura de um equipamento (câmera, central de alarme sem fio...) — usada igual pelo
// MapCanvas e pelo FloorPlanCanvas; só o `frame` (metros <-> coordenadas do canvas) muda entre eles.
// `coverage` = { shape: 'cone' | 'circle' | 'camera', resolution } (resolution = padrão vindo do título do item).

const HANDLE_ICON = L.divIcon({
  html: `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center"><div style="width:12px;height:12px;border-radius:9999px;background:#facc15;border:2px solid rgba(10,13,20,.9);box-shadow:0 1px 3px rgba(0,0,0,.5);cursor:grab"></div></div>`,
  className: '',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
})

// Legenda das cores do cone da câmera (mesmas faixas e opacidade de coverageBands). Fica sobre o canvas, fora do Leaflet.
// top-28 = abaixo dos botões "Trocar planta baixa" / "Voltar ao orçamento" do FloorPlanView (canto superior direito, z-[1100]).
export function CoverageLegend() {
  return (
    <details open className="pointer-events-auto absolute top-28 right-4 z-[1000] rounded-lg border border-border bg-card/85 px-2 py-1 text-xs backdrop-blur">
      <summary className="cursor-pointer select-none font-medium">Cores da câmera</summary>
      <p className="mt-1 text-muted-foreground">Densidade de pixels — IEC 62676-4:2025</p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {DENSITY_BANDS.map(({ ppm, color, label }) => (
          <li key={ppm} className="flex items-center gap-1.5">
            <span className="size-3 shrink-0 rounded-sm border border-white/30" style={{ background: color, opacity: 0.8 }} />
            {label}
            <span className="ml-auto pl-2 tabular-nums text-muted-foreground">≥ {ppm} px/m</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

// `interactive: false` no polígono: ele fica só como desenho — clique nele tem que continuar
// chegando no mapa (colocar equipamento) e nos ícones por baixo.
export function CoverageOverlay({ marker, coverage: { shape, resolution }, frame, draggable, onChange }) {
  const [preview, setPreview] = useState(null) // alcance/direção enquanto o puxador é arrastado
  const live = preview ? { ...marker, ...preview } : marker
  const handle = coverageHandle(marker, shape, frame)
  // Array com identidade estável: o Marker do react-leaflet compara `position` por referência e chama
  // setLatLng quando muda — um array novo a cada render (o `setPreview` do arraste renderiza a cada
  // movimento) puxava o puxador de volta pro lugar antigo no meio do gesto, e ao soltar o clique
  // caía no mapa (colocando outro equipamento) em vez de terminar o arraste.
  const handlePosition = useMemo(() => [handle.lat, handle.lng], [handle.lat, handle.lng])
  const fromDrag = (e) => coverageFromHandle(marker, shape, frame, e.target.getLatLng())

  return (
    <>
      {shape === 'camera' ? (
        <>
          {coverageBands(live, frame, resolution).map(({ color, positions }) => (
            <Polygon key={color} positions={positions} pathOptions={{ stroke: false, fillColor: color, fillOpacity: 0.4, interactive: false }} />
          ))}
          <Polygon
            positions={coveragePolygon(live, shape, frame)}
            pathOptions={{ color: '#ffffff', weight: 1, opacity: 0.6, fill: false, interactive: false }}
          />
        </>
      ) : (
        <Polygon
          positions={coveragePolygon(live, shape, frame)}
          pathOptions={{ color: '#facc15', weight: 1.5, fillColor: '#facc15', fillOpacity: 0.22, interactive: false }}
        />
      )}
      <Marker
        position={handlePosition}
        icon={HANDLE_ICON}
        draggable={draggable}
        eventHandlers={{
          drag: (e) => setPreview(fromDrag(e)),
          dragend: (e) => { onChange(fromDrag(e)); setPreview(null) },
        }}
      />
    </>
  )
}

function NumberField({ label, unit, value, limits, onCommit }) {
  const rounded = Math.round(value)
  const commit = (e) => {
    const next = Number(e.target.value)
    if (Number.isFinite(next) && e.target.value !== '') onCommit(limits ? Math.min(limits[1], Math.max(limits[0], next)) : next)
  }
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      {label}
      <span className="flex items-center gap-1">
        {/* key muda quando o puxador é arrastado — o campo (não controlado, pra dar pra digitar
            sem o valor "pular" pro limite no meio do número) recarrega com o valor novo. */}
        <input
          key={rounded}
          type="number"
          defaultValue={rounded}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
          className="w-16 rounded border border-gray-300 bg-white px-1.5 py-0.5 text-right text-black"
        />
        {unit}
      </span>
    </label>
  )
}

// Campos numéricos do popup do marker (dentro de <Popup> — o popup do Leaflet é sempre branco, então
// os campos usam cores fixas em vez dos tokens de tema, que ficam ilegíveis no tema escuro) — o puxador no mapa faz o mesmo de forma
// visual, aqui é pra acertar valor exato.
export function CoverageFields({ marker, coverage: { shape, resolution: defaultResolution }, onChange }) {
  const { heading, range, angle, resolution } = coverageOf(marker, defaultResolution)
  return (
    <div className="mb-2 flex flex-col gap-1.5">
      <p className="font-medium">Área de cobertura</p>
      <NumberField label="Alcance" unit="m" value={range} limits={COVERAGE_LIMITS.range} onCommit={(v) => onChange({ range: v })} />
      {shape !== 'circle' ? (
        <>
          <NumberField label={shape === 'camera' ? 'Ângulo de visão' : 'Ângulo'} unit="°" value={angle} limits={COVERAGE_LIMITS.angle} onCommit={(v) => onChange({ angle: v })} />
          <NumberField label="Direção" unit="°" value={heading} onCommit={(v) => onChange({ heading: ((v % 360) + 360) % 360 })} />
        </>
      ) : null}
      {shape === 'camera' ? (
        <>
          <label className="flex items-center justify-between gap-2 text-sm">
            Resolução
            <select
              value={RESOLUTIONS.some(([width]) => width === resolution) ? resolution : ''}
              onChange={(e) => onChange({ resolution: Number(e.target.value) })}
              className="rounded border border-gray-300 bg-white px-1.5 py-0.5 text-black"
            >
              {RESOLUTIONS.some(([width]) => width === resolution) ? null : <option value="">{resolution}px</option>}
              {RESOLUTIONS.map(([width, text]) => <option key={width} value={width}>{text}</option>)}
            </select>
          </label>
          <ul className="flex flex-col gap-0.5 text-xs text-gray-700">
            <li className="font-medium">Densidade de pixels — IEC 62676-4:2025</li>
            {bandLimits(marker, defaultResolution).map(({ ppm, color, label, distance }) => (
              <li key={ppm} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm" style={{ background: color }} />
                {label} (≥{ppm} px/m): até {distance.toFixed(1)} m
              </li>
            ))}
            <li>No alcance ({Math.round(range)} m): {Math.round(pixelDensity(resolution, angle, range))} px/m</li>
          </ul>
        </>
      ) : null}
    </div>
  )
}
