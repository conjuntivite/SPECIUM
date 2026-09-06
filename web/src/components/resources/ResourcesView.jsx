import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { normalizeSearch } from '@/lib/utils'
import { createResource, deleteResource, getResources, updateResource } from '@/lib/api'
import { ResourceFormDialog } from './ResourceFormDialog'

// Cadastro dos recursos que o motor de capacidade conhece (portas, canais...) — nada fixo em
// código, pra dar pra outra empresa/ramo criar os próprios sem mexer em código-fonte. Ver
// SPEC.md ("Motor de recursos e capacidade") e categoryResourceSeed.js.
export function ResourcesView() {
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingResource, setEditingResource] = useState(null)
  const [search, setSearch] = useState('')

  const filteredResources = useMemo(() => {
    const q = normalizeSearch(search.trim())
    if (!q) return resources
    return resources.filter((r) => normalizeSearch(r.key).includes(q) || normalizeSearch(r.label).includes(q))
  }, [resources, search])

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    getResources()
      .then((data) => setResources(data.resources || []))
      .catch((err) => setError(err.message || 'Erro ao carregar recursos.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  function openCreate() {
    setEditingResource(null)
    setFormOpen(true)
  }

  function openEdit(resource) {
    setEditingResource(resource)
    setFormOpen(true)
  }

  async function handleSubmit(form) {
    if (editingResource) await updateResource(editingResource.id, { label: form.label })
    else await createResource(form)
    setFormOpen(false)
    reload()
  }

  async function handleDelete(resource) {
    if (!window.confirm(`Remover o recurso "${resource.label}"?`)) return
    setError('')
    try {
      await deleteResource(resource.id)
      reload()
    } catch (err) {
      setError(err.message || 'Erro ao excluir recurso.')
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Recursos cadastrados</h2>
        <Button type="button" onClick={openCreate}>+ Novo recurso</Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {resources.length ? (
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por chave ou nome..."
            className="pl-8"
          />
        </div>
      ) : null}

      {filteredResources.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Chave</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredResources.map((resource) => (
              <TableRow key={resource.id}>
                <TableCell className="font-mono text-xs text-muted-foreground">{resource.key}</TableCell>
                <TableCell>{resource.label}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(resource)}>Editar</Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(resource)}>Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {resources.length && !filteredResources.length ? (
        <p className="text-sm text-muted-foreground">Nenhum recurso encontrado para "{search}".</p>
      ) : null}

      <ResourceFormDialog
        open={formOpen}
        resource={editingResource}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
