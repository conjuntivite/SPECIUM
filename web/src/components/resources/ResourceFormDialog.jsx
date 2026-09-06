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

const emptyForm = { key: '', label: '' }

export function ResourceFormDialog({ open, resource, onOpenChange, onSubmit }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(resource ? { key: resource.key, label: resource.label } : emptyForm)
      setError('')
    }
  }, [open, resource])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.key.trim() || !form.label.trim()) {
      setError('Preencha a chave e o nome do recurso.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(form)
    } catch (err) {
      setError(err.message || 'Erro ao salvar recurso.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{resource ? 'Editar recurso' : 'Novo recurso'}</DialogTitle>
            <DialogDescription>
              Recursos são o que uma categoria fornece (ex.: portas de um switch) ou exige (ex.:
              consumo de porta de uma câmera) no motor de capacidade.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Chave</label>
              <Input
                value={form.key}
                onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
                placeholder="Ex: network.gigabit_port"
                disabled={!!resource}
              />
              <p className="text-xs text-muted-foreground">
                {resource
                  ? 'Não é editável depois de criado — categorias já podem referenciar essa chave.'
                  : 'Letras, números, ponto e underscore (ex: power.va, license.ai_channel). Não dá pra mudar depois.'}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="Ex: Porta Gigabit"
              />
            </div>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
