import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { InfoHint } from '@/components/ui/info-hint'

// Deriva a chave técnica (network.gigabit_port) a partir do rótulo digitado — mesma ideia de
// slugifyRequirementId em CategoryFormDialog, mas em minúsculo/underscore pra bater com o formato
// que validateResourceRequest (server.js) exige: letra inicial, depois letras/números/underscore.
function slugifyResourceKey(label, existingKeys) {
  const base = label.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'recurso'
  const root = /^[a-z]/.test(base) ? base : `r_${base}`
  const used = new Set(existingKeys)
  let key = root
  let n = 2
  while (used.has(key)) { key = `${root}_${n}`; n += 1 }
  return key
}

// Mesmo padrão do GroupCombobox: sugere os recursos já cadastrados (aba Categorias > cadastro de
// recursos, sem tela própria — ver CategoriesView), Enter num rótulo sem correspondência abre
// confirmação de criação (a chave técnica sai sozinha do rótulo), e cada linha tem uma lixeira pra
// excluir (bloqueada pelo backend enquanto alguma categoria fornecer/exigir esse recurso).
export function ResourceCombobox({ value, onChange, resources, onCreateResource, onDeleteResource, className = '' }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedLabel = resources.find((r) => r.key === value)?.label ?? value ?? ''
  const [query, setQuery] = useState(selectedLabel)
  const [pendingCreate, setPendingCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  // Resolve o rótulo a partir da chave sempre que o valor comprometido muda (não a cada tecla,
  // senão perde o que o usuário está digitando antes de selecionar ou criar — mesma lógica do
  // GroupCombobox). Sem correspondência ainda (chave recém-criada, `resources` não recarregou) e com
  // valor não-vazio, mantém a query como está — selectResource já escreveu o rótulo certo ali; cair
  // pra `value` mostraria a chave técnica crua até o próximo recarregamento (bug: "licenca_de_ia" no
  // lugar de "Licença de IA" logo após confirmar a criação).
  useEffect(() => {
    const match = resources.find((r) => r.key === value)
    if (match) setQuery(match.label)
    else if (!value) setQuery('')
  }, [value, resources])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false)
        setPendingCreate(false)
        setQuery(selectedLabel)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return resources
    return resources.filter((r) => r.label.toLowerCase().includes(q))
  }, [resources, query])

  function handleQueryChange(e) {
    setQuery(e.target.value)
    setPendingCreate(false)
    setOpen(true)
  }

  function selectResource(resource) {
    onChange(resource.key)
    setQuery(resource.label)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); setQuery(selectedLabel); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    const exact = resources.find((r) => r.label.toLowerCase() === trimmed.toLowerCase())
    if (exact) { selectResource(exact); return }
    setCreateError('')
    setPendingCreate(true)
  }

  async function confirmCreate() {
    const trimmed = query.trim()
    setCreating(true)
    setCreateError('')
    try {
      const key = slugifyResourceKey(trimmed, resources.map((r) => r.key))
      const created = await onCreateResource({ key, label: trimmed })
      selectResource(created?.key ? created : { key, label: trimmed })
    } catch (err) {
      setCreateError(err.message || 'Erro ao criar recurso.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteRow(e, resource) {
    e.stopPropagation()
    setDeleteError('')
    try {
      await onDeleteResource(resource.id)
      if (resource.key === value) onChange('')
    } catch (err) {
      setDeleteError(err.message || 'Erro ao excluir recurso.')
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <Input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder="Ex: Porta Gigabit, Canal de gravação IP..."
        className="pr-8"
      />
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />

      {open ? (
        <div className="absolute z-[60] mt-1 w-full rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-md">
          {pendingCreate ? (
            <div className="flex flex-col gap-2 p-2 text-sm">
              <div className="flex items-center gap-1.5">
                <p>
                  Criar o recurso <strong>“{query.trim()}”</strong>?
                </p>
                <InfoHint>
                  Um recurso é algo que um equipamento fornece (ex.: portas de um switch) ou consome
                  (ex.: uma câmera usando uma porta) no motor de capacidade — usado nas seções "O que
                  este item fornece"/"exige" do cadastro de categoria.
                  <br /><br />
                  <strong>Exemplo:</strong> "Porta Gigabit" é um recurso; um Switch Giga 16 Portas
                  fornece 16 dele, e cada câmera IP consome 1.
                </InfoHint>
              </div>
              {createError ? <p className="text-xs text-destructive">{createError}</p> : null}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="ghost" size="sm" onClick={() => setPendingCreate(false)}>Cancelar</Button>
                <Button type="button" size="sm" disabled={creating} onClick={confirmCreate}>Confirmar</Button>
              </div>
            </div>
          ) : (
            <div className="flex max-h-56 flex-col overflow-y-auto">
              {deleteError ? <p className="px-2 py-1.5 text-xs text-destructive">{deleteError}</p> : null}
              {filtered.length ? (
                filtered.map((r) => (
                  <div key={r.id} className="group flex items-center justify-between gap-1 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                    <button type="button" className="flex-1 text-left" onClick={() => selectResource(r)}>
                      {r.label}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      title="Excluir recurso"
                      onClick={(e) => handleDeleteRow(e, r)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum recurso encontrado. Digite e aperte Enter para criar.</p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
