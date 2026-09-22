import { useCallback, useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ProductIcon } from '@/components/ui/product-icon'
import { normalizeSearch } from '@/lib/utils'
import {
  createCategory, deleteCategory, getCategories, updateCategory,
  createGroup, deleteGroup, getGroups,
  createResource, deleteResource, getResources,
} from '@/lib/api'
import { CategoryFormDialog } from './CategoryFormDialog'

export function CategoriesView() {
  const [categories, setCategories] = useState([])
  const [groups, setGroups] = useState([])
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState(null)
  const [search, setSearch] = useState('')

  // Filtra só o que aparece na tabela — o form de edição continua recebendo a lista completa
  // (precisa de todas as categorias pra montar o seletor de candidata de requisito).
  const filteredCategories = useMemo(() => {
    const q = normalizeSearch(search.trim())
    if (!q) return categories
    return categories.filter((c) => normalizeSearch(c.group).includes(q) || normalizeSearch(c.label).includes(q))
  }, [categories, search])

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    getCategories()
      .then((data) => setCategories(data.categories || []))
      .catch((err) => setError(err.message || 'Erro ao carregar categorias.'))
      .finally(() => setLoading(false))
  }, [])

  const reloadGroups = useCallback(() => {
    getGroups().then((data) => setGroups(data.groups || [])).catch(() => {})
  }, [])

  const reloadResources = useCallback(() => {
    getResources().then((data) => setResources(data.resources || [])).catch(() => {})
  }, [])

  useEffect(() => { reload() }, [reload])
  useEffect(() => { reloadGroups() }, [reloadGroups])
  useEffect(() => { reloadResources() }, [reloadResources])

  // Atualiza a lista local direto com o que a criação já devolveu, em vez de disparar um novo GET
  // (reloadGroups/reloadResources) — um reload é um 2º round-trip assíncrono à parte, e reabrir o
  // combobox antes dele voltar via a lista local ainda sem o item recém-criado, faz o combobox achar
  // que "não existe" e deixar criar de novo (duplicata com sufixo _2, sem erro nenhum pro usuário).
  async function handleCreateGroup(name) {
    const created = await createGroup(name)
    setGroups((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')))
    return created
  }

  async function handleDeleteGroup(id) {
    await deleteGroup(id)
    reloadGroups()
  }

  async function handleCreateResource(data) {
    const created = await createResource(data)
    setResources((prev) => [...prev, created].sort((a, b) => a.key.localeCompare(b.key)))
    return created
  }

  async function handleDeleteResource(id) {
    await deleteResource(id)
    reloadResources()
  }

  function openCreate() {
    setEditingCategory(null)
    setFormOpen(true)
  }

  function openEdit(category) {
    setEditingCategory(category)
    setFormOpen(true)
  }

  async function handleSubmit(form) {
    if (editingCategory) await updateCategory(editingCategory.id, form)
    else await createCategory(form)
    setFormOpen(false)
    reload()
  }

  async function handleDelete(category) {
    if (!window.confirm(`Remover a categoria "${category.label}"?`)) return
    setError('')
    try {
      await deleteCategory(category.id)
      reload()
    } catch (err) {
      setError(err.message || 'Erro ao excluir categoria.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Categorias cadastradas</h2>
        <Button type="button" onClick={openCreate}>+ Nova categoria</Button>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {categories.length ? (
        <div className="relative mb-3">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por grupo ou categoria..."
            className="pl-8"
          />
        </div>
      ) : null}

      {filteredCategories.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Grupo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Capacidade</TableHead>
              <TableHead>Requisitos</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredCategories.map((category) => (
              <TableRow key={category.id}>
                <TableCell><ProductIcon icon={category.icon} className="size-4 text-muted-foreground" /></TableCell>
                <TableCell>{category.group}</TableCell>
                <TableCell>{category.label}</TableCell>
                <TableCell className="text-muted-foreground">{category.capacity ?? '—'}</TableCell>
                <TableCell className="text-muted-foreground">
                  {category.requirements?.length ? `${category.requirements.length} requisito${category.requirements.length === 1 ? '' : 's'}` : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(category)}>Editar</Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(category)}>Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {categories.length && !filteredCategories.length ? (
        <p className="text-sm text-muted-foreground">Nenhuma categoria encontrada para "{search}".</p>
      ) : null}

      <CategoryFormDialog
        open={formOpen}
        category={editingCategory}
        groups={groups}
        categories={categories}
        resources={resources}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
        onCreateGroup={handleCreateGroup}
        onDeleteGroup={handleDeleteGroup}
        onCreateResource={handleCreateResource}
        onDeleteResource={handleDeleteResource}
      />
    </div>
  )
}
