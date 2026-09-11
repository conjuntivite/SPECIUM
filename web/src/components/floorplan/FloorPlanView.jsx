import { useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faArrowUpFromBracket, faExternalLinkAlt } from '@fortawesome/free-solid-svg-icons'
import { FloorPlanCanvas } from './FloorPlanCanvas'

// Serviço externo gratuito pra converter DWG (AutoCAD) em PDF/imagem antes do upload — o sistema
// não converte DWG sozinho (formato CAD binário proprietário, sem lib leve pra isso), então o
// consultor faz essa etapa por fora quando o arquivo não for PNG/JPG.
const DWG_CONVERTER_URL = 'https://www.freepdfconvert.com/pt/autocad-para-pdf'
const ACCEPTED_TYPES = ['image/png', 'image/jpeg']

export function FloorPlanView({ budgetId, floorPlan, items, onSetItemIcon, floorPlanLayout, onChangeFloorPlanLayout, onUpload, onBackToCanvas }) {
  const fileInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileChange(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // permite escolher o mesmo arquivo de novo depois de um erro
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Envie um arquivo PNG ou JPG.')
      return
    }
    setError('')
    setUploading(true)
    try {
      await onUpload(file)
    } catch (err) {
      setError(err.message || 'Não foi possível enviar a planta baixa.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40">
      {floorPlan ? (
        <FloorPlanCanvas
          budgetId={budgetId}
          floorPlan={floorPlan}
          items={items}
          onSetItemIcon={onSetItemIcon}
          floorPlanLayout={floorPlanLayout}
          onChange={onChangeFloorPlanLayout}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-4 bg-flow-canvas p-4">
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            Envie uma imagem da planta baixa (PNG ou JPG) pra posicionar câmera, rack e outros equipamentos em cima dela — mesmas ferramentas do mapa (desenhar ligação, soltar item, trocar ícone).
          </p>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileChange} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 rounded-full border border-border bg-card/90 px-4 py-2 text-sm font-medium backdrop-blur transition-colors hover:bg-secondary disabled:pointer-events-none disabled:opacity-50"
          >
            <FontAwesomeIcon icon={faArrowUpFromBracket} className="size-4" /> {uploading ? 'Enviando...' : 'Enviar planta baixa'}
          </button>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <a
            href={DWG_CONVERTER_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs text-muted-foreground underline decoration-dotted hover:text-foreground"
          >
            Arquivo em DWG? Converter para PDF/imagem <FontAwesomeIcon icon={faExternalLinkAlt} className="size-3" />
          </a>
        </div>
      )}

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
