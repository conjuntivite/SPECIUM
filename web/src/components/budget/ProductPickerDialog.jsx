import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getProducts } from '@/lib/api'
import { normalizeSearch } from '@/lib/utils'
import { useCategories } from '@/hooks/useCategories'
import { ProductIcon } from '@/components/ui/product-icon'

// ponytail: uma categoria popular pode acumular milhares de produtos com o tempo — renderizar um
// botão por produto sem limite trava o diálogo (medido: >10s de UI travada com 2000 produtos numa
// categoria só). Corta a lista renderizada e deixa a busca reduzir o restante.
const MAX_RENDERED = 50

// Toda entrada no orçamento — item de categoria do menu, ou sugestão da listinha lateral (clicada ou
// arrastada) — passa por aqui antes de virar nó no quadro. `prompt.categories` pode ter mais de um
// valor de catálogo (ex.: sugestão genérica "NVR" cobre NVR 4/8/.../64 Canais); quando há mais de
// um, cada linha mostra sua categoria pra diferenciar.
export function ProductPickerDialog({ prompt, onPick, onSkip, onOpenChange, onGoToProducts }) {
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!prompt) return
    setSearch('')
    setLoading(true)
    setError('')
    getProducts()
      .then((data) => setProducts((data.products || []).filter((product) => prompt.categories.includes(product.category))))
      .catch((err) => setError(err.message || 'Erro ao buscar produtos cadastrados.'))
      .finally(() => setLoading(false))
  }, [prompt])

  const showCategoryPerRow = (prompt?.categories.length || 0) > 1

  const filteredProducts = useMemo(() => {
    const q = normalizeSearch(search.trim())
    if (!q) return products
    return products.filter((p) =>
      normalizeSearch(categoryLabels[p.category] || p.category).includes(q) ||
      normalizeSearch(p.brand).includes(q) ||
      normalizeSearch(p.model).includes(q)
    )
  }, [products, categoryLabels, search])

  const visibleProducts = filteredProducts.slice(0, MAX_RENDERED)
  const hiddenCount = filteredProducts.length - visibleProducts.length

  return (
    <Dialog open={!!prompt} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Qual produto?</DialogTitle>
          <DialogDescription>
            Escolha a marca e o modelo cadastrados para {prompt?.label}.
          </DialogDescription>
        </DialogHeader>

        {loading ? <p className="text-sm text-muted-foreground">Carregando produtos...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {!loading && !error && !products.length ? (
          <div className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>Nenhum produto cadastrado para esta categoria ainda.</p>
            <Button type="button" variant="secondary" onClick={onGoToProducts}>
              Cadastrar produto
            </Button>
          </div>
        ) : null}

        {products.length > MAX_RENDERED ? (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por marca ou modelo..."
            autoFocus
          />
        ) : null}

        {products.length ? (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {visibleProducts.map((product) => (
              <Button
                key={product.id}
                type="button"
                variant="secondary"
                className="h-auto justify-start whitespace-normal text-left"
                onClick={() => onPick(product)}
              >
                <ProductIcon icon={categoryIcons[product.category]} className="size-4 shrink-0" />
                {showCategoryPerRow ? `${categoryLabels[product.category] || product.category} — ` : ''}
                {product.brand} — {product.model}
              </Button>
            ))}
            {hiddenCount > 0 ? (
              <p className="text-center text-xs text-muted-foreground">
                +{hiddenCount} produto(s) — refine a busca pra ver mais
              </p>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onSkip}>
            Adicionar sem produto cadastrado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
