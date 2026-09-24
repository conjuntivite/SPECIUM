import { useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleExclamation, faAsterisk, faArrowRightArrowLeft, faLightbulb,
  faRobot, faGears, faCircleCheck, faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { auditQuotePdf, createProduct, getCategories, getResources } from '@/lib/api'
import { useCategories } from '@/hooks/useCategories'
import { dedupeUnsatisfiedSuggestions } from '@/lib/suggestions'
import { ProductFormDialog } from '@/components/products/ProductFormDialog'

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

function EngineFindingRow({ req, onSelect }) {
  const style = suggestionStyle(req)
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(req)}
        className={`w-full rounded-md border-l-2 bg-foreground/4 px-3 py-2 text-left transition-colors hover:bg-foreground/8 ${style.border}`}
      >
        <span className="mb-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <FontAwesomeIcon icon={style.icon} className="size-3" /> {style.kind}
        </span>
        <p className="text-sm">{req.reason || req.label}</p>
      </button>
    </li>
  )
}

// Formata o `provides`/`requirements` cru da categoria (mesmo formato de categoryResourceSeed.js)
// pra prosa curta no detalhe do achado — resourceLabelByKey traduz a chave técnica (network.gigabit_port)
// pro rótulo da aba Recursos.
function formatProvides(category, resourceLabelByKey) {
  if (!category?.provides?.length) return 'Nada.'
  return category.provides.map((p) => `${p.amount}× ${resourceLabelByKey.get(p.resource) || p.resource}`).join(', ')
}

function formatRequirement(req, resourceLabelByKey) {
  if (req.type === 'presence') return req.label
  if (req.type === 'capacity') return `${req.label} (${req.unitsPerItem}/un.)`
  return `${req.label}: ${req.options.map((o) => o.type === 'presence' ? o.candidates.join(' ou ') : (resourceLabelByKey.get(o.resource) || o.resource)).join(' ou ')}`
}

function formatRequirements(category, resourceLabelByKey) {
  if (!category?.requirements?.length) return 'Nada.'
  return category.requirements.map((r) => formatRequirement(r, resourceLabelByKey)).join('; ')
}

// Linha "Fulano de tal × 3 = 3" (presença) ou "× 3 un × 1/un = 3" (capacidade) — as duas seções do
// dialog de detalhe (demanda e oferta) usam o mesmo formato, só troca o rótulo do multiplicador.
// Quando `items` vem preenchido (só na seção "Quem exige"), a linha vira botão: clicar expande os
// itens do PDF que bateram com essa categoria — pedido pra não ficar só no total agregado ("Controladora
// de Acesso × 7" sem saber quais 7 itens do orçamento original são esses).
function BreakdownRow({ entry, items, expanded, onToggle }) {
  const perUnit = entry.unitsPerItem ?? entry.amount
  const matches = items ? items.filter((i) => i.category === entry.category) : []
  const row = (
    <span className="flex w-full items-baseline justify-between gap-2">
      <span>{entry.label} <span className="text-muted-foreground">× {entry.quantity}</span></span>
      <span className="text-muted-foreground">
        {perUnit != null ? `${perUnit}/un. = ${entry.subtotal}` : entry.quantity}
      </span>
    </span>
  )
  return (
    <li className="text-xs">
      {items ? (
        <button type="button" onClick={() => onToggle(entry.category)} className="w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-foreground/8">
          {row}
        </button>
      ) : <div className="px-1 py-0.5">{row}</div>}
      {expanded ? (
        <ul className="ml-2 mt-1 flex flex-col gap-0.5 border-l border-foreground/10 pl-2 text-muted-foreground">
          {matches.length
            ? matches.map((m, i) => (<li key={i}>{m.quantity}x {m.name}</li>))
            : <li>Nenhum item do PDF bateu com essa categoria (nome não reconhecido).</li>}
        </ul>
      ) : null}
    </li>
  )
}

function RequirementDetailDialog({ req, onClose, categoriesByValue, resourceLabelByKey, items }) {
  const [expandedCategory, setExpandedCategory] = useState(null)
  useEffect(() => { setExpandedCategory(null) }, [req])

  const equipmentValues = useMemo(() => {
    if (!req) return []
    const values = new Set([
      ...(req.demandBreakdown || []).map((e) => e.category),
      ...(req.supplyBreakdown || []).map((e) => e.category),
    ])
    return [...values]
  }, [req])

  return (
    <Dialog open={!!req} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-md sm:max-w-md">
        {req ? (
          <>
            <DialogHeader>
              <DialogTitle>{req.label}</DialogTitle>
              <DialogDescription>{req.reason}</DialogDescription>
            </DialogHeader>

            <div className="flex max-h-[65vh] flex-col gap-3 overflow-y-auto pr-1">
              <div>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Quem exige (demanda: {req.need ?? '—'})</h4>
                {req.demandBreakdown?.length ? (
                  <ul className="flex flex-col gap-1 rounded-md bg-foreground/4 p-2">
                    {req.demandBreakdown.map((e, i) => (
                      <BreakdownRow
                        key={i} entry={e} items={items}
                        expanded={expandedCategory === e.category}
                        onToggle={(c) => setExpandedCategory((current) => (current === c ? null : c))}
                      />
                    ))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Nenhum item do orçamento gera essa demanda.</p>}
              </div>

              <div>
                <h4 className="mb-1 text-xs font-semibold text-muted-foreground">O que já tenho instalado (oferta: {req.have ?? '—'})</h4>
                {req.supplyBreakdown?.length ? (
                  <ul className="flex flex-col gap-1 rounded-md bg-foreground/4 p-2">
                    {req.supplyBreakdown.map((e, i) => (<BreakdownRow key={i} entry={e} />))}
                  </ul>
                ) : <p className="text-xs text-muted-foreground">Nenhum equipamento do orçamento fornece isso hoje.</p>}
              </div>

              {equipmentValues.length ? (
                <div>
                  <h4 className="mb-1 text-xs font-semibold text-muted-foreground">Ficha de cada equipamento envolvido</h4>
                  <ul className="flex flex-col gap-2">
                    {equipmentValues.map((value) => {
                      const category = categoriesByValue.get(value)
                      return (
                        <li key={value} className="rounded-md bg-foreground/4 p-2 text-xs">
                          <p className="mb-1 font-semibold">{category?.label || value}</p>
                          <p><span className="text-muted-foreground">Fornece:</span> {formatProvides(category, resourceLabelByKey)}</p>
                          <p><span className="text-muted-foreground">Exige:</span> {formatRequirements(category, resourceLabelByKey)}</p>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export function QuotePdfAuditView() {
  const catalog = useCategories()
  const categoryLabels = useMemo(
    () => Object.fromEntries(catalog.flatMap((group) => group.items.map((item) => [item.value, item.label]))),
    [catalog]
  )
  // Cópia crua (com provides[]/requirements[]) só pra montar a ficha do detalhe do achado — a
  // useCategories() acima já existe pra rotular itens não reconhecidos, mas descarta esses campos.
  const [categoriesByValue, setCategoriesByValue] = useState(new Map())
  const [resourceLabelByKey, setResourceLabelByKey] = useState(new Map())
  useEffect(() => {
    getCategories().then((data) => setCategoriesByValue(new Map((data.categories || []).map((c) => [c.value, c])))).catch(() => {})
    getResources().then((data) => setResourceLabelByKey(new Map((data.resources || []).map((r) => [r.key, r.label])))).catch(() => {})
  }, [])
  const [selectedFinding, setSelectedFinding] = useState(null)

  // Item do PDF sem categoria batida no cadastro — o vendedor cotou algo que ainda não existe como
  // Produto no sistema. Deixa cadastrar na hora (mesmo dialog/CRUD da aba Produtos) em vez de anotar
  // o nome e ir cadastrar depois em outra aba.
  const [createTarget, setCreateTarget] = useState(null)
  const [registeredNames, setRegisteredNames] = useState(new Set())

  async function handleCreateProduct(form) {
    await createProduct(form)
    setRegisteredNames((prev) => new Set(prev).add(createTarget.name))
    setCreateTarget(null)
  }

  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState(0)
  const progressTimerRef = useRef(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => () => clearInterval(progressTimerRef.current), [])

  function handleFileChange(e) {
    const chosen = e.target.files?.[0]
    setResult(null)
    setError('')
    setFile(chosen || null)
    setFileName(chosen?.name || '')
  }

  // Não dá pra saber o progresso real (é 1 request só, com extração do PDF + 2 chamadas de IA
  // sequenciais por trás) — avança suave até 92% enquanto espera (etapas encolhem o passo à medida
  // que se aproxima, nunca "trava" visualmente) e só bate 100% quando a resposta chega de verdade.
  const PROGRESS_CAP = 92
  async function handleAnalyze() {
    if (!file) { setError('Escolha um arquivo PDF.'); return }
    setLoading(true)
    setError('')
    setResult(null)
    setRegisteredNames(new Set())
    setProgress(0)
    clearInterval(progressTimerRef.current)
    progressTimerRef.current = setInterval(() => {
      setProgress((p) => (p >= PROGRESS_CAP ? p : p + (PROGRESS_CAP - p) * 0.08))
    }, 200)
    try {
      const data = await auditQuotePdf(file)
      clearInterval(progressTimerRef.current)
      setProgress(100)
      setResult(data)
      setTimeout(() => setLoading(false), 300)
    } catch (err) {
      clearInterval(progressTimerRef.current)
      setError(err.message || 'Erro ao validar o orçamento.')
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
        {loading ? (
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-200 ease-linear"
                style={{ width: `${Math.round(progress)}%` }}
              />
            </div>
            <p className="mt-1 text-right text-xs text-muted-foreground">{Math.round(progress)}%</p>
          </div>
        ) : null}
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
                {engineFindings.map((req) => (<EngineFindingRow key={req.key} req={req} onSelect={setSelectedFinding} />))}
              </ul>
            ) : (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <FontAwesomeIcon icon={faCircleCheck} className="size-3.5 text-flow-green" />
                Nenhuma pendência encontrada nos itens reconhecidos.
              </p>
            )}
            {unrecognizedItems.length ? (
              <div className="mt-2">
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 size-3 shrink-0 text-flow-amber" />
                  {unrecognizedItems.length} item(ns) do PDF não bateram com nenhuma categoria do cadastro,
                  então não entraram nessa checagem. Se for um produto de verdade, cadastre pra manter o catálogo atualizado:
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 pl-4.5">
                  {unrecognizedItems.map((item, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 text-xs">
                      <span>{item.quantity}x {item.name}</span>
                      {registeredNames.has(item.name) ? (
                        <span className="flex shrink-0 items-center gap-1 text-flow-green">
                          <FontAwesomeIcon icon={faCircleCheck} className="size-3" /> Cadastrado
                        </span>
                      ) : (
                        <Button type="button" variant="secondary" size="sm" className="h-6 shrink-0 px-2 text-xs" onClick={() => setCreateTarget(item)}>
                          + Cadastrar produto
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
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

      <RequirementDetailDialog
        req={selectedFinding}
        onClose={() => setSelectedFinding(null)}
        items={result?.items || []}
        categoriesByValue={categoriesByValue}
        resourceLabelByKey={resourceLabelByKey}
      />

      <ProductFormDialog
        open={!!createTarget}
        product={null}
        initialValues={{ model: createTarget?.name || '' }}
        onOpenChange={(open) => { if (!open) setCreateTarget(null) }}
        onSubmit={handleCreateProduct}
      />
    </div>
  )
}
