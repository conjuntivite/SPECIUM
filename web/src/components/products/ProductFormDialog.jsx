import { useEffect, useState } from 'react'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCategories } from '@/hooks/useCategories'
import { InfoHint } from '@/components/ui/info-hint'

const emptyForm = { category: '', brand: '', model: '' }

export function ProductFormDialog({ open, product, brands = [], onOpenChange, onSubmit }) {
  const catalog = useCategories()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(product ? { category: product.category, brand: product.brand, model: product.model } : emptyForm)
      setError('')
    }
  }, [open, product])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.category || !form.brand.trim() || !form.model.trim()) {
      setError('Preencha categoria, marca e modelo.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(form)
    } catch (err) {
      setError(err.message || 'Erro ao salvar produto.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{product ? 'Editar produto' : 'Novo produto'}</DialogTitle>
            <DialogDescription>
              Marca e modelo do produto real, associado a uma categoria do orçamento.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Categoria</label>
              <Select value={form.category} onValueChange={(value) => setForm((f) => ({ ...f, category: value }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione a categoria" />
                </SelectTrigger>
                <SelectContent>
                  {catalog.map((group) => (
                    <SelectGroup key={group.group}>
                      <SelectLabel>{group.group}</SelectLabel>
                      {group.items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-1.5">
                <label className="text-sm font-medium">Marca</label>
                <InfoHint>
                  Sugere as marcas já usadas em outros produtos cadastrados conforme você digita, mas
                  também aceita um nome novo — não precisa cadastrar a marca em outro lugar antes.
                  <br /><br />
                  <strong>Exemplo:</strong> se "Intelbras" já foi usada antes, digitar "Inte" já
                  sugere ela na lista — evita cadastrar "Intelbras" e "intelbras" como coisas diferentes.
                </InfoHint>
              </div>
              <Input
                value={form.brand}
                onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))}
                placeholder="Ex: Intelbras, Hikvision"
                list="product-brand-suggestions"
              />
              {/* datalist nativo: sugere marcas já usadas nos produtos cadastrados, sem travar o
                  texto livre — evita "Intelbras"/"intelbras" duplicados sem precisar de um cadastro
                  próprio de marca (não é um valor com identidade além do próprio nome). */}
              <datalist id="product-brand-suggestions">
                {brands.map((brand) => (<option key={brand} value={brand} />))}
              </datalist>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Modelo</label>
              <Input
                value={form.model}
                onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                placeholder="Ex: DS-7216K1-HQHIMS"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
