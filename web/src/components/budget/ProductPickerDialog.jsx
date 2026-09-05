import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { getProducts } from '@/lib/api'
import catalog from '@/data/catalog.json'

const CATEGORY_LABELS = Object.fromEntries(catalog.flatMap((group) => group.items.map((item) => [item.value, item.label])))

// Toda entrada no orçamento — item de categoria do menu, ou sugestão da listinha lateral (clicada ou
// arrastada) — passa por aqui antes de virar nó no quadro. `prompt.categories` pode ter mais de um
// valor de catálogo (ex.: sugestão genérica "NVR" cobre NVR 4/8/.../64 Canais); quando há mais de
// um, cada linha mostra sua categoria pra diferenciar.
export function ProductPickerDialog({ prompt, onPick, onSkip, onOpenChange, onGoToProducts }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!prompt) return
    setLoading(true)
    setError('')
    getProducts()
      .then((data) => setProducts((data.products || []).filter((product) => prompt.categories.includes(product.category))))
      .catch((err) => setError(err.message || 'Erro ao buscar produtos cadastrados.'))
      .finally(() => setLoading(false))
  }, [prompt])

  const showCategoryPerRow = (prompt?.categories.length || 0) > 1

  return (
    <Dialog open={!!prompt} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
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

        {products.length ? (
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto">
            {products.map((product) => (
              <Button
                key={product.id}
                type="button"
                variant="secondary"
                className="justify-start"
                onClick={() => onPick(product)}
              >
                {showCategoryPerRow ? `${CATEGORY_LABELS[product.category] || product.category} — ` : ''}
                {product.brand} — {product.model}
              </Button>
            ))}
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
