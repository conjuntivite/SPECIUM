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

export function ProductsView() {
  const catalog = useCategories()
  const categoryLabels = useMemo(
    () => Object.fromEntries(catalog.flatMap((group) => group.items.map((item) => [item.value, item.label]))),
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
  const [editingProduct, setEditingProduct] = useState(null)
  const [search, setSearch] = useState('')

  const filteredProducts = useMemo(() => {
    const q = normalizeSearch(search.trim())
    if (!q) return products
    return products.filter((p) =>
      normalizeSearch(categoryLabels[p.category] || p.category).includes(q) ||
      normalizeSearch(p.brand).includes(q) ||
      normalizeSearch(p.model).includes(q)
    )
  }, [products, categoryLabels, search])

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
        <Button type="button" onClick={openCreate}>+ Novo produto</Button>
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
            onChange={(e) => setSearch(e.target.value)}
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
            {filteredProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell><ProductIcon icon={product.icon} className="size-4 text-muted-foreground" /></TableCell>
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
    </div>
  )
}
