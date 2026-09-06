import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GroupCombobox } from './GroupCombobox'
import { ProvidesEditor, RequirementsEditor } from './RequirementsEditor'
import { useResources } from '@/hooks/useResources'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const emptyForm = { group: '', label: '', capacity: '', capacityTouched: false }

// Mesmo padrão do inferSeedCapacity em db.js: o número já está no nome ("Switch Giga 8 Portas",
// "DVR 16 Canais"), então preenchemos sozinhos em vez de pedir pra digitar de novo. Categorias sem
// esse padrão no rótulo (outros ramos: "Saco de Cimento") continuam com o campo manual normal.
function inferCapacityFromLabel(label) {
  const match = label.match(/(\d+)\s*(?:Portas|Canais)\b/i)
  return match ? match[1] : ''
}

function slugifyRequirementId(label, used) {
  const base = label.toString().trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'req'
  let id = base
  let n = 2
  while (used.has(id)) { id = `${base}-${n}`; n += 1 }
  used.add(id)
  return id
}

function cleanOption(option) {
  if (option.type === 'capacity') {
    return { type: 'capacity', resource: (option.resource || '').trim(), unitsPerItem: Math.max(1, Math.trunc(Number(option.unitsPerItem)) || 1) }
  }
  return { type: 'presence', candidates: option.candidates || [] }
}

// Só descarta linhas visivelmente abandonadas (sem recurso/rótulo preenchido) — o resto (ex.:
// presença sem nenhuma categoria candidata escolhida) segue pro backend, que recusa com uma
// mensagem clara em vez de salvar silenciosamente algo incompleto.
function cleanProvides(provides) {
  return provides
    .filter((p) => (p.resource || '').trim())
    .map((p) => ({ resource: p.resource.trim(), amount: Math.max(1, Math.trunc(Number(p.amount)) || 1) }))
}

function cleanRequirements(requirements) {
  const usedIds = new Set()
  return requirements
    .filter((r) => r.label.trim())
    .map((r) => {
      const base = { id: slugifyRequirementId(r.label, usedIds), label: r.label.trim(), critical: !!r.critical }
      if (r.type === 'anyOf') return { ...base, type: 'anyOf', options: r.options.map(cleanOption) }
      return { ...base, ...cleanOption(r) }
    })
}

export function CategoryFormDialog({ open, category, groups, categories, onOpenChange, onSubmit, onCreateGroup, onDeleteGroup }) {
  const resources = useResources()
  const [form, setForm] = useState(emptyForm)
  // [{ categoryValue, critical, alternatives: [categoryValue, ...] }] — alternatives referencia
  // outras entradas desta MESMA lista: o vínculo "resolve o conflito" entre críticas (ver abaixo).
  const [dependencies, setDependencies] = useState([])
  // Motor de recursos/capacidade (ver categoryResourceSeed.js/SPEC.md "Motor de recursos e
  // capacidade") — provides: [{resource, amount}], requirements: [{type, label, critical, ...}].
  const [provides, setProvides] = useState([])
  const [requirements, setRequirements] = useState([])
  const [copyFromValue, setCopyFromValue] = useState('')
  // Pendente até o usuário responder: { targetValue, targetLabel, existingCriticals: [{categoryValue,label}], answers }
  const [conflict, setConflict] = useState(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // A pergunta de conflito troca o conteúdo rolável do dialog por outra tela (DialogHeader/Footer
  // diferentes) — isso desmonta a div com scroll e volta com scrollTop 0. Guardamos a posição aqui
  // pra restaurar depois que a pergunta for respondida (ou cancelada), em vez de voltar pro topo.
  const scrollRef = useRef(null)
  const savedScrollTop = useRef(0)

  const ownValue = category?.value

  const otherCategories = useMemo(() => categories.filter((c) => c.value !== ownValue), [categories, ownValue])
  const labelByValue = useMemo(() => Object.fromEntries(categories.map((c) => [c.value, c.label])), [categories])
  const availableToAdd = useMemo(
    () => otherCategories.filter((c) => !dependencies.some((d) => d.categoryValue === c.value)),
    [otherCategories, dependencies]
  )
  const copyableFrom = useMemo(() => otherCategories.filter((c) => c.dependencies?.length), [otherCategories])

  useEffect(() => {
    if (open) {
      setForm(
        category
          ? { group: category.group, label: category.label, capacity: category.capacity ?? '', capacityTouched: category.capacity != null }
          : emptyForm
      )
      setDependencies((category?.dependencies || []).map((d) => ({ ...d, alternatives: [...d.alternatives] })))
      setProvides((category?.provides || []).map((p) => ({ ...p })))
      setRequirements((category?.requirements || []).map((r) => (r.type === 'anyOf' ? { ...r, options: r.options.map((o) => ({ ...o })) } : { ...r })))
      setCopyFromValue('')
      setConflict(null)
      setError('')
      savedScrollTop.current = 0
    }
  }, [open, category])

  // Restaura a posição de rolagem assim que a pergunta de conflito é respondida/cancelada e a div
  // rolável remonta — useLayoutEffect pra aplicar antes do navegador pintar o novo scroll no topo.
  useLayoutEffect(() => {
    if (!conflict && scrollRef.current) scrollRef.current.scrollTop = savedScrollTop.current
  }, [conflict])

  // Prefixo especial pra "adicionar o grupo inteiro de uma vez" no seletor de dependência nova —
  // evita clicar item por item quando o grupo tem várias variantes (ex.: Switch Giga = 4 portas).
  const GROUP_PREFIX = '__group__:'

  function addDependency(value) {
    if (!value) return
    if (value.startsWith(GROUP_PREFIX)) {
      const groupName = value.slice(GROUP_PREFIX.length)
      const values = availableToAdd.filter((c) => c.group === groupName).map((c) => c.value)
      setDependencies((deps) => [...deps, ...values.map((v) => ({ categoryValue: v, critical: false, alternatives: [] }))])
      return
    }
    setDependencies((deps) => [...deps, { categoryValue: value, critical: false, alternatives: [] }])
  }

  function removeDependency(value) {
    setDependencies((deps) =>
      deps.filter((d) => d.categoryValue !== value)
        .map((d) => ({ ...d, alternatives: d.alternatives.filter((v) => v !== value) }))
    )
  }

  // Desmarcar crítica encerra qualquer alternância envolvendo essa dependência — o motivo do vínculo
  // (resolver o conflito entre duas críticas) deixa de existir se uma delas não é mais crítica.
  function setCritical(value, critical) {
    if (!critical) {
      setDependencies((deps) => deps.map((d) => {
        if (d.categoryValue === value) return { ...d, critical: false, alternatives: [] }
        return { ...d, alternatives: d.alternatives.filter((v) => v !== value) }
      }))
      return
    }
    const existingCriticals = dependencies.filter((d) => d.critical && d.categoryValue !== value)
    if (!existingCriticals.length) {
      setDependencies((deps) => deps.map((d) => (d.categoryValue === value ? { ...d, critical: true } : d)))
      return
    }
    savedScrollTop.current = scrollRef.current?.scrollTop ?? 0
    setConflict({
      targetValue: value,
      targetLabel: labelByValue[value] || value,
      existingCriticals: existingCriticals.map((d) => ({ categoryValue: d.categoryValue, label: labelByValue[d.categoryValue] || d.categoryValue })),
      answers: Object.fromEntries(existingCriticals.map((d) => [d.categoryValue, true])),
    })
  }

  function resolveConflict() {
    const { targetValue, answers } = conflict
    const mutualPartners = Object.entries(answers).filter(([, stillCritical]) => !stillCritical).map(([value]) => value)
    setDependencies((deps) => deps.map((d) => {
      if (d.categoryValue === targetValue) {
        return { ...d, critical: true, alternatives: [...new Set([...d.alternatives, ...mutualPartners])] }
      }
      if (mutualPartners.includes(d.categoryValue)) {
        return { ...d, alternatives: [...new Set([...d.alternatives, targetValue])] }
      }
      return d
    }))
    setConflict(null)
  }

  function copyFrom(value) {
    setCopyFromValue(value)
    const source = categories.find((c) => c.value === value)
    if (!source?.dependencies) return
    setDependencies(
      source.dependencies
        .filter((d) => d.categoryValue !== ownValue)
        .map((d) => ({ ...d, alternatives: d.alternatives.filter((v) => v !== ownValue) }))
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.group.trim() || !form.label.trim()) {
      setError('Preencha o grupo e o nome da categoria.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const capacity = form.capacity === '' ? null : Math.max(1, Math.trunc(Number(form.capacity)) || 1)
      await onSubmit({
        group: form.group, label: form.label, capacity, dependencies,
        provides: cleanProvides(provides), requirements: cleanRequirements(requirements),
      })
    } catch (err) {
      setError(err.message || 'Erro ao salvar categoria.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {conflict ? (
          <>
            <DialogHeader>
              <DialogTitle>Conflito entre críticas</DialogTitle>
              <DialogDescription>
                Ao marcar <strong>{conflict.targetLabel}</strong> como crítica, as dependências abaixo
                continuam críticas quando <strong>{form.label || 'esta categoria'}</strong> e{' '}
                <strong>{conflict.targetLabel}</strong> estiverem juntas no orçamento?
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2">
              {conflict.existingCriticals.map((c) => (
                <label key={c.categoryValue} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                  {c.label}
                  <select
                    className="rounded-md border border-input bg-transparent px-2 py-1 text-sm"
                    value={conflict.answers[c.categoryValue] ? 'sim' : 'nao'}
                    onChange={(e) => setConflict((prev) => ({ ...prev, answers: { ...prev.answers, [c.categoryValue]: e.target.value === 'sim' } }))}
                  >
                    <option value="sim">Sim, continua crítica</option>
                    <option value="nao">Não, vira opcional com {conflict.targetLabel}</option>
                  </select>
                </label>
              ))}
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setConflict(null)}>Cancelar</Button>
              <Button type="button" onClick={resolveConflict}>Confirmar</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{category ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
              <DialogDescription>
                Categorias organizam o catálogo usado no orçamento e no cadastro de produtos.
              </DialogDescription>
            </DialogHeader>

            <div ref={scrollRef} className="mt-4 flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Grupo</label>
                <GroupCombobox
                  value={form.group}
                  onChange={(group) => setForm((f) => ({ ...f, group }))}
                  groups={groups}
                  onCreateGroup={onCreateGroup}
                  onDeleteGroup={onDeleteGroup}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Categoria</label>
                <Input
                  value={form.label}
                  onChange={(e) => {
                    const label = e.target.value
                    setForm((f) => {
                      if (f.capacityTouched) return { ...f, label }
                      return { ...f, label, capacity: inferCapacityFromLabel(label) }
                    })
                  }}
                  placeholder="Ex: Câmera IP PoE"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">Capacidade (opcional)</label>
                <Input
                  type="number"
                  min="1"
                  value={form.capacity}
                  onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value, capacityTouched: true }))}
                  placeholder="Ex: 16 portas, 16 canais..."
                />
                <p className="text-xs text-muted-foreground">
                  Quantas unidades de outra coisa esta categoria comporta (portas de switch, canais de
                  DVR/NVR). Preenchido sozinho quando o nome já traz o número; deixe em branco se não
                  se aplica.
                </p>
              </div>

              <ProvidesEditor provides={provides} onChange={setProvides} resources={resources} />
              <RequirementsEditor
                requirements={requirements}
                otherCategories={otherCategories}
                labelByValue={labelByValue}
                resources={resources}
                onChange={setRequirements}
              />

              {requirements.length ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-200">
                  Com requisitos cadastrados acima, as dependências antigas abaixo deixam de valer pra
                  esta categoria — o motor de sugestões usa "o que exige" no lugar delas.
                </p>
              ) : null}

              <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">Dependências (motor antigo)</span>
                  {copyableFrom.length ? (
                    <Select value={copyFromValue} onValueChange={copyFrom}>
                      <SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="Copiar de..." /></SelectTrigger>
                      <SelectContent>
                        {copyableFrom.map((c) => (<SelectItem key={c.id} value={c.value}>{c.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>

                {availableToAdd.length ? (
                  <Select value="" onValueChange={addDependency}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="+ Adicionar dependência" /></SelectTrigger>
                    <SelectContent>
                      {groups.map((group) => {
                        const items = availableToAdd.filter((c) => c.group === group.name)
                        if (!items.length) return null
                        return (
                          <SelectGroup key={group.id}>
                            <SelectLabel>{group.name}</SelectLabel>
                            {items.length > 1 ? (
                              <SelectItem value={`${GROUP_PREFIX}${group.name}`} className="font-medium text-primary">
                                + Todo o grupo ({items.length})
                              </SelectItem>
                            ) : null}
                            {items.map((c) => (<SelectItem key={c.id} value={c.value}>{c.label}</SelectItem>))}
                          </SelectGroup>
                        )
                      })}
                    </SelectContent>
                  </Select>
                ) : null}

                {dependencies.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {dependencies.map((dep) => (
                      <li key={dep.categoryValue} className="flex flex-col gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex flex-col">
                            <span>{labelByValue[dep.categoryValue] || dep.categoryValue}</span>
                            {dep.alternatives.length ? (
                              <span className="text-xs text-muted-foreground">
                                ↔ alternativa de: {dep.alternatives.map((v) => labelByValue[v] || v).join(', ')}
                              </span>
                            ) : null}
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <input type="checkbox" checked={dep.critical} onChange={(e) => setCritical(dep.categoryValue, e.target.checked)} />
                              Crítica
                            </label>
                            <button type="button" onClick={() => removeDependency(dep.categoryValue)} className="text-xs text-destructive transition-colors hover:underline">
                              remover
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhuma dependência ainda.</p>
                )}
              </div>

              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>

            <DialogFooter className="mt-4">
              <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
