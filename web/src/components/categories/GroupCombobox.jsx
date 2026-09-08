import { useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

// Campo "Grupo" com sugestão dos grupos já cadastrados, mas ainda de texto livre: digitar e sair do
// campo aceita o texto direto (igual antes); só o Enter num nome que NÃO bate com nenhum grupo
// existente abre a confirmação de criação, e cada linha da lista tem uma lixeira pra corrigir um
// grupo cadastrado com nome errado (bloqueada pelo backend enquanto alguma categoria usar o grupo).
//
// Dropdown feito na mão (sem Popover do radix): usar Popover.Anchor pra ancorar num <input> que abre
// no focus tem uma corrida real com a camada de dismiss do radix — o mesmo clique que foca o campo
// e reabre a lista é lido como "clique fora" e fecha de novo no mesmo tick. Um listener de mousedown
// no documento, contido só enquanto o mouse estiver dentro do wrapper, evita essa corrida.
export function GroupCombobox({ value, onChange, groups, onCreateGroup, onDeleteGroup }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value || '')
  const [pendingCreate, setPendingCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [deleteError, setDeleteError] = useState('')

  useEffect(() => { setQuery(value || '') }, [value])

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return groups
    return groups.filter((g) => g.name.toLowerCase().includes(q))
  }, [groups, query])

  function handleQueryChange(e) {
    const next = e.target.value
    setQuery(next)
    onChange(next)
    setPendingCreate(false)
    setOpen(true)
  }

  function selectGroup(name) {
    onChange(name)
    setQuery(name)
    setOpen(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') { setOpen(false); return }
    if (e.key !== 'Enter') return
    e.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    const exact = groups.find((g) => g.name.toLowerCase() === trimmed.toLowerCase())
    if (exact) { selectGroup(exact.name); return }
    setCreateError('')
    setPendingCreate(true)
  }

  async function confirmCreate() {
    const trimmed = query.trim()
    setCreating(true)
    setCreateError('')
    try {
      const created = await onCreateGroup(trimmed)
      selectGroup(created?.name || trimmed)
      setPendingCreate(false)
    } catch (err) {
      setCreateError(err.message || 'Erro ao criar grupo.')
    } finally {
      setCreating(false)
    }
  }

  async function handleDeleteRow(e, group) {
    e.stopPropagation()
    setDeleteError('')
    try {
      await onDeleteGroup(group.id)
    } catch (err) {
      setDeleteError(err.message || 'Erro ao excluir grupo.')
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        value={query}
        onFocus={() => setOpen(true)}
        onChange={handleQueryChange}
        onKeyDown={handleKeyDown}
        placeholder="Ex: Câmeras, Energia, Acabamento"
        className="pr-8"
      />
      <FontAwesomeIcon icon={faChevronDown} className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground" />

      {open ? (
        <div className="absolute z-[60] mt-1 w-full rounded-md border border-input bg-popover p-1 text-popover-foreground shadow-md">
          {pendingCreate ? (
            <div className="flex flex-col gap-2 p-2 text-sm">
              <p>
                Criar o grupo <strong>“{query.trim()}”</strong>?
              </p>
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
                filtered.map((g) => (
                  <div key={g.id} className="group flex items-center justify-between gap-1 rounded-sm px-2 py-1.5 text-sm hover:bg-accent">
                    <button type="button" className="flex-1 text-left" onClick={() => selectGroup(g.name)}>
                      {g.name}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                      title="Excluir grupo"
                      onClick={(e) => handleDeleteRow(e, g)}
                    >
                      <FontAwesomeIcon icon={faTrashCan} className="size-3.5" />
                    </button>
                  </div>
                ))
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">Nenhum grupo encontrado. Digite e aperte Enter para criar.</p>
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
