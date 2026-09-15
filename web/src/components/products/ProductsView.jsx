import { useCallback, useEffect, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { ProductIcon } from '@/components/ui/product-icon'
import { normalizeSearch } from '@/lib/utils'
import { createProduct, deleteProduct, getProducts, updateProduct } from '@/lib/api'
import { useCategories } from '@/hooks/useCategories'
import { ProductFormDialog } from './ProductFormDialog'
import { ImportProductsDialog } from './ImportProductsDialog'

// ponytail: renderizar a tabela inteira sem paginação trava a aba com poucos milhares de produtos
// (medido: >30s de UI travada com ~6000 linhas). Paginação simples client-side resolve — o fetch já
// é rápido (a API não pagina), o gargalo era só o DOM de milhares de <tr>.
const PAGE_SIZE = 50

export function ProductsView() {
  const catalog = useCategories()
  const categoryLabels = useMemo(
    () => Object.fromEntries(catalog.flatMap((group) => group.items.map((item) => [item.value, item.label]))),
    [catalog]
  )
  const categoryIcons = useMemo(
    () => Object.fromEntries(catalog.flatMap((group) => group.items.map((item) => [item.value, item.icon]))),
    [catalog]
  )
  const [products, setProducts] = useState([])
  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [products]
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  const filteredProducts = useMemo(() => {
    const q = normalizeSearch(search.trim())
    if (!q) return products
    return products.filter((p) =>
      normalizeSearch(categoryLabels[p.category] || p.category).includes(q) ||
      normalizeSearch(p.brand).includes(q) ||
      normalizeSearch(p.model).includes(q)
    )
  }, [products, categoryLabels, search])

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pagedProducts = filteredProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function handleSearchChange(value) {
    setSearch(value)
    setPage(1)
  }

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    getProducts()
      .then((data) => setProducts(data.products || []))
      .catch((err) => setError(err.message || 'Erro ao carregar produtos.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  function openCreate() {
    setEditingProduct(null)
    setFormOpen(true)
  }

  function openEdit(product) {
    setEditingProduct(product)
    setFormOpen(true)
  }

  async function handleSubmit(form) {
    if (editingProduct) await updateProduct(editingProduct.id, form)
    else await createProduct(form)
    setFormOpen(false)
    reload()
  }

  async function handleDelete(product) {
    if (!window.confirm(`Remover ${product.brand} ${product.model}?`)) return
    await deleteProduct(product.id)
    reload()
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Produtos cadastrados</h2>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => setImportOpen(true)}>Importar planilha</Button>
          <Button type="button" onClick={openCreate}>+ Novo produto</Button>
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && !products.length ? (
        <p className="rounded-xl border border-border bg-card/60 p-4 text-sm text-muted-foreground">
          Nenhum produto cadastrado ainda. Clique em "Novo produto" para começar.
        </p>
      ) : null}

      {products.length ? (
        <div className="relative mb-3">
          <FontAwesomeIcon icon={faMagnifyingGlass} className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Buscar por categoria, marca ou modelo..."
            className="pl-8"
          />
        </div>
      ) : null}

      {filteredProducts.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"></TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagedProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell><ProductIcon icon={categoryIcons[product.category]} className="size-4 text-muted-foreground" /></TableCell>
                <TableCell>{categoryLabels[product.category] || product.category}</TableCell>
                <TableCell>{product.brand}</TableCell>
                <TableCell>{product.model}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(product)}>Editar</Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => handleDelete(product)}>Excluir</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {filteredProducts.length > PAGE_SIZE ? (
        <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredProducts.length)} de {filteredProducts.length}
          </span>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>
              Anterior
            </Button>
            <span className="self-center">Página {currentPage} de {totalPages}</span>
            <Button type="button" variant="secondary" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      ) : null}

      {products.length && !filteredProducts.length ? (
        <p className="text-sm text-muted-foreground">Nenhum produto encontrado para "{search}".</p>
      ) : null}

      <ProductFormDialog
        open={formOpen}
        product={editingProduct}
        brands={brands}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
      />

      <ImportProductsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={reload}
      />
    </div>
  )
}
