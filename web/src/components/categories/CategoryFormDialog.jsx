import { useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { GroupCombobox } from './GroupCombobox'
import { ProvidesEditor, RequirementsEditor } from './RequirementsEditor'
import { InfoHint } from '@/components/ui/info-hint'
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
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select'

const emptyForm = { group: '', label: '', capacity: '', capacityTouched: false, canBeContainer: false }

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

export function CategoryFormDialog({
  open, category, groups, categories, resources, onOpenChange, onSubmit,
  onCreateGroup, onDeleteGroup, onCreateResource, onDeleteResource,
}) {
  const [form, setForm] = useState(emptyForm)
  // Motor de recursos/capacidade (ver categoryResourceSeed.js/SPEC.md "Motor de recursos e
  // capacidade") — provides: [{resource, amount}], requirements: [{type, label, critical, ...}].
  const [provides, setProvides] = useState([])
  const [requirements, setRequirements] = useState([])
  const [copyFromValue, setCopyFromValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const ownValue = category?.value

  // otherCategories/labelByValue alimentam o seletor de "categoria candidata" de um requisito de
  // presença (RequirementsEditor) — nada a ver com o motor antigo removido.
  const otherCategories = useMemo(() => categories.filter((c) => c.value !== ownValue), [categories, ownValue])
  const labelByValue = useMemo(() => Object.fromEntries(categories.map((c) => [c.value, c.label])), [categories])
  const copyableFrom = useMemo(
    () => otherCategories.filter((c) => c.provides?.length || c.requirements?.length),
    [otherCategories]
  )

  useEffect(() => {
    if (open) {
      setForm(
        category
          ? { group: category.group, label: category.label, capacity: category.capacity ?? '', capacityTouched: category.capacity != null, canBeContainer: !!category.canBeContainer }
          : emptyForm
      )
      setProvides((category?.provides || []).map((p) => ({ ...p })))
      setRequirements((category?.requirements || []).map((r) => (r.type === 'anyOf' ? { ...r, options: r.options.map((o) => ({ ...o })) } : { ...r })))
      setCopyFromValue('')
      setError('')
    }
  }, [open, category])

  // Copia provides/requirements de outra categoria — pra montar variantes (ex.: "Switch Giga 24
  // Portas" a partir de "Switch Giga 16 Portas") só ajustando capacidade/rótulo, sem redigitar o resto.
  function copyFrom(value) {
    setCopyFromValue(value)
    const source = categories.find((c) => c.value === value)
    if (!source) return
    setProvides((source.provides || []).map((p) => ({ ...p })))
    setRequirements(
      (source.requirements || []).map((r) => (r.type === 'anyOf' ? { ...r, options: r.options.map((o) => ({ ...o })) } : { ...r }))
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
        group: form.group, label: form.label, capacity, canBeContainer: form.canBeContainer,
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
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{category ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
            <DialogDescription>
              Categorias organizam o catálogo usado no orçamento e no cadastro de produtos.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex max-h-[65vh] flex-col gap-4 overflow-y-auto pr-1">
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

            <div className="flex items-center gap-1.5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={form.canBeContainer}
                  onChange={(e) => setForm((f) => ({ ...f, canBeContainer: e.target.checked }))}
                />
                Pode funcionar como container (ex.: Rack, Caixa hermética)
              </label>
              <InfoHint>
                Categorias marcadas como container ganham um botão "Abrir Container" no card do
                orçamento — dá pra mover outros equipamentos pra dentro dele, que somem do canvas
                principal enquanto o container estiver fechado.
                <br /><br />
                <strong>Exemplo:</strong> um Rack contendo Nobreak, Switch e NVR aparece fechado
                como um card só ("3 equipamentos internos"), sem os três ocupando espaço à parte.
              </InfoHint>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium">Capacidade (opcional)</label>
                <InfoHint>
                  Quantas unidades de outra coisa esta categoria comporta. Preenchido sozinho quando
                  o nome já traz o número; deixe em branco se não se aplica.
                  <br /><br />
                  <strong>Exemplo:</strong> "Switch Giga 16 Portas" → capacidade 16 (quantas câmeras
                  ele atende); "DVR 16 Canais" → capacidade 16 (quantos canais de gravação).
                </InfoHint>
              </div>
              <Input
                type="number"
                min="1"
                value={form.capacity}
                onChange={(e) => setForm((f) => ({ ...f, capacity: e.target.value, capacityTouched: true }))}
                placeholder="Ex: 16 portas, 16 canais..."
              />
            </div>

            {copyableFrom.length ? (
              // InfoHint ao lado, não em volta do Select (Tooltip+Select aninhados brigavam pela
              // mesma ref). position="popper": o modo padrão ("item-aligned") tenta abrir o menu
              // alinhado sobre o item já selecionado — sem nenhum valor selecionado (é sempre "",
              // dispara ao escolher e não fica marcado, de propósito) o Radix não acha esse item
              // pra ancorar e o menu nascia a milhares de pixels de distância, no fim da página.
              <div className="flex items-center gap-1.5">
                <Select value={copyFromValue} onValueChange={copyFrom}>
                  <SelectTrigger size="sm" className="w-fit px-2">
                    <FontAwesomeIcon icon={faCopy} className="size-3.5" />
                  </SelectTrigger>
                  <SelectContent position="popper">
                    {copyableFrom.map((c) => (<SelectItem key={c.id} value={c.value}>{c.label}</SelectItem>))}
                  </SelectContent>
                </Select>
                <InfoHint>
                  Copia o que outra categoria já cadastrada fornece e exige (recursos/requisitos)
                  pra esta, sem redigitar tudo.
                  <br /><br />
                  <strong>Exemplo:</strong> criar "Switch Giga 24 Portas" copiando de "Switch Giga
                  16 Portas" e só ajustar a capacidade.
                </InfoHint>
              </div>
            ) : null}

            <ProvidesEditor
              provides={provides}
              onChange={setProvides}
              resources={resources}
              onCreateResource={onCreateResource}
              onDeleteResource={onDeleteResource}
            />
            <RequirementsEditor
              requirements={requirements}
              otherCategories={otherCategories}
              labelByValue={labelByValue}
              resources={resources}
              onCreateResource={onCreateResource}
              onDeleteResource={onDeleteResource}
              onChange={setRequirements}
            />

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter className="mt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
