import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState(null)

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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria</TableHead>
              <TableHead>Marca</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.map((product) => (
              <TableRow key={product.id}>
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

      <ProductFormDialog
        open={formOpen}
        product={editingProduct}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
