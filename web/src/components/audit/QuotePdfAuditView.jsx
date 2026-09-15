import { useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleExclamation, faAsterisk, faArrowRightArrowLeft, faLightbulb,
  faRobot, faGears, faCircleCheck, faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { auditQuotePdf } from '@/lib/api'
import { useCategories } from '@/hooks/useCategories'
import { dedupeUnsatisfiedSuggestions } from '@/lib/suggestions'

const SEVERITY_STYLES = {
  critical: { border: 'border-l-flow-red', icon: faCircleExclamation, kind: 'Sem isso não liga' },
  optional: { border: 'border-l-flow-orange', icon: faArrowRightArrowLeft, kind: 'Alternativa (opcional)' },
  essential: { border: 'border-l-flow-amber', icon: faAsterisk, kind: 'Essencial' },
  recommended: { border: 'border-l-flow-gray', icon: faLightbulb, kind: 'Recomendado' },
}

function suggestionStyle(req) {
  if (req.severity === 'critical') return SEVERITY_STYLES.critical
  if (req.essential) return SEVERITY_STYLES.essential
  if (req.severity === 'optional') return SEVERITY_STYLES.optional
  return SEVERITY_STYLES.recommended
}

function EngineFindingRow({ req }) {
  const style = suggestionStyle(req)
  return (
    <li className={`rounded-md border-l-2 bg-white/4 px-3 py-2 ${style.border}`}>
      <span className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <FontAwesomeIcon icon={style.icon} className="size-3" /> {style.kind}
      </span>
      <p className="text-sm">{req.reason || req.label}</p>
    </li>
  )
}

export function QuotePdfAuditView() {
  const catalog = useCategories()
  const categoryLabels = useMemo(
    () => Object.fromEntries(catalog.flatMap((group) => group.items.map((item) => [item.value, item.label]))),
    [catalog]
  )
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  function handleFileChange(e) {
    const chosen = e.target.files?.[0]
    setResult(null)
    setError('')
    setFile(chosen || null)
    setFileName(chosen?.name || '')
  }

  async function handleAnalyze() {
    if (!file) { setError('Escolha um arquivo PDF.'); return }
    setLoading(true)
    setError('')
    setResult(null)
    try {
      setResult(await auditQuotePdf(file))
    } catch (err) {
      setError(err.message || 'Erro ao validar o orçamento.')
    } finally {
      setLoading(false)
    }
  }

  const engineFindings = useMemo(
    () => (result ? dedupeUnsatisfiedSuggestions(result.engineResult?.requirements_by_category) : []),
    [result]
  )
  const unrecognizedItems = useMemo(
    () => (result ? result.items.filter((item) => !item.category) : []),
    [result]
  )

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">Validar orçamento (PDF)</h2>
        <p className="text-sm text-muted-foreground">
          Envie o PDF do orçamento gerado pelo sistema SERVICE. O motor de regras (o mesmo do
          orçamento no canvas) cruza os itens com o cadastro de categorias, e uma IA dá uma segunda
          opinião livre sobre o conjunto.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card/60 p-3 text-sm">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,application/pdf"
          onChange={handleFileChange}
          className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground"
        />
        {fileName ? <p className="mt-1.5 text-xs text-muted-foreground">Selecionado: {fileName}</p> : null}
        <Button type="button" className="mt-3" onClick={handleAnalyze} disabled={loading || !file}>
          {loading ? 'Analisando...' : 'Analisar orçamento'}
        </Button>
      </div>

      {error ? (
        <Alert variant="destructive" className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {result ? (
        <div className="mt-6 flex flex-col gap-6">
          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FontAwesomeIcon icon={faGears} className="size-3.5" /> Motor de regras
            </h3>
            {engineFindings.length ? (
              <ul className="flex flex-col gap-1.5">
                {engineFindings.map((req) => (<EngineFindingRow key={req.key} req={req} />))}
              </ul>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FontAwesomeIcon icon={faCircleCheck} className="size-3.5 text-flow-green" />
                Nenhuma pendência encontrada nos itens reconhecidos.
              </p>
            )}
            {unrecognizedItems.length ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 size-3 shrink-0 text-flow-amber" />
                {unrecognizedItems.length} item(ns) do PDF não bateram com nenhuma categoria do cadastro,
                então não entraram nessa checagem: {unrecognizedItems.map((i) => i.name).join('; ')}.
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <FontAwesomeIcon icon={faRobot} className="size-3.5" /> IA — segunda opinião
            </h3>
            <div className="rounded-xl border border-border bg-card/60 p-3 text-sm whitespace-pre-line">
              {result.aiAudit}
            </div>
          </div>

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none">
              Ver os {result.items.length} item(ns) que a IA leu do PDF
            </summary>
            <ul className="mt-2 flex flex-col gap-1">
              {result.items.map((item, i) => (
                <li key={i}>
                  {item.quantity}x {item.name} → {item.category ? (categoryLabels[item.category] || item.category) : 'não reconhecido'}
                </li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}
    </div>
  )
}
