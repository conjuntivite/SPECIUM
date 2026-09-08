import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowRightArrowLeft, faAsterisk, faLightbulb, faCircleExclamation, faPlus } from '@fortawesome/free-solid-svg-icons'

const SEVERITY_STYLES = {
  critical: { border: 'border-l-flow-red', bg: 'bg-flow-red/12', icon: faCircleExclamation, kind: 'Sem isso não liga' },
  optional: { border: 'border-l-flow-orange', bg: '', icon: faArrowRightArrowLeft, kind: 'Alternativa (opcional)' },
  essential: { border: 'border-l-flow-amber', bg: '', icon: faAsterisk, kind: 'Essencial' },
}

function suggestionStyle(req) {
  if (req.severity === 'critical') return SEVERITY_STYLES.critical
  if (req.severity === 'optional') return SEVERITY_STYLES.optional
  if (req.essential) return SEVERITY_STYLES.essential
  return { border: 'border-l-flow-gray', bg: '', icon: faLightbulb, kind: 'Recomendado' }
}

function SuggestionCard({ req, onAdd }) {
  const [dragging, setDragging] = useState(false)
  const style = suggestionStyle(req)
  return (
    <div
      draggable
      title={`${req.label} — ${req.reason || ''}`}
      onDragStart={(e) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ key: req.key, label: req.label, categories: req.categories }))
        e.dataTransfer.effectAllowed = 'copy'
        setDragging(true)
      }}
      onDragEnd={() => setDragging(false)}
      className={`relative w-[110px] shrink-0 cursor-grab select-none rounded-md border-l-2 px-1.5 py-1 transition-opacity active:cursor-grabbing ${style.border} ${style.bg || 'bg-white/4'} ${dragging ? 'opacity-40' : ''}`}
    >
      <button
        type="button"
        title="Adicionar ao quadro"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => onAdd(req)}
        className="absolute right-1 top-1 flex size-3.5 items-center justify-center rounded-full bg-white/10 text-muted-foreground transition-colors hover:bg-flow-green hover:text-flow-green-text"
      >
        <FontAwesomeIcon icon={faPlus} className="size-2.5" />
      </button>
      <span className="mb-0.5 block truncate pr-4 text-xs font-semibold">{req.label}</span>
      <span className="mb-0.5 flex items-center gap-1 truncate text-[0.65rem] text-muted-foreground">
        <FontAwesomeIcon icon={style.icon} className="size-3 shrink-0" /> {style.kind}
      </span>
      <span className="line-clamp-2 text-[0.65rem] leading-snug text-muted-foreground">{req.reason || ''}</span>
    </div>
  )
}

export function SuggestionsStrip({ suggestions, onAdd }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-white/[0.02] px-2.5 py-2">
      <div className="w-[110px] shrink-0">
        <h3 className="text-xs font-bold">Sugestões</h3>
        <p className="text-[0.65rem] leading-snug text-muted-foreground">Arraste ou clique no +.</p>
      </div>
      {suggestions.length ? (
        <div className="flex flex-1 items-stretch gap-1.5 overflow-x-auto pb-1">
          {suggestions.map((req) => (
            <SuggestionCard key={req.key} req={req} onAdd={onAdd} />
          ))}
        </div>
      ) : (
        <p className="whitespace-nowrap text-xs text-muted-foreground">Nenhuma sugestão pendente.</p>
      )}
    </div>
  )
}
