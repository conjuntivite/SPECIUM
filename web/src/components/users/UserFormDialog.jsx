import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const emptyForm = { name: '', email: '', password: '', role: 'user' }

export function UserFormDialog({ open, user, onOpenChange, onSubmit }) {
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(user ? { name: user.name || '', email: user.email, password: '', role: user.role } : emptyForm)
      setError('')
    }
  }, [open, user])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.email.trim()) {
      setError('Informe o e-mail.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await onSubmit(form)
    } catch (err) {
      setError(err.message || 'Erro ao salvar usuário.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <DialogDescription>
              Deixe a senha em branco pra manter a senha atual.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nome</label>
              <Input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">E-mail</label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@exemplo.com"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Nova senha</label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Deixe em branco pra não alterar"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Papel</label>
              <Select value={form.role} onValueChange={(value) => setForm((f) => ({ ...f, role: value }))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
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
