import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setBudgetAddress } from '@/lib/api'

const EMPTY = { cep: '', street: '', number: '', complement: '', district: '', city: '', state: '' }

// ViaCEP: gratuito, sem chave, com CORS liberado — o navegador consulta direto.
async function lookupCep(cep) {
  const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`)
  const data = await response.json()
  if (!response.ok || data.erro) throw new Error('CEP não encontrado.')
  return { street: data.logradouro, district: data.bairro, city: data.localidade, state: data.uf }
}

const formatCep = (digits) => (digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits)

export function AddressDialog({ budgetId, open, onOpenChange, initialAddress, initialNumber, initialParts, isEditing, onSaved }) {
  const [form, setForm] = useState(EMPTY)
  const [error, setError] = useState('')
  const [cepStatus, setCepStatus] = useState('') // '' | 'buscando' | mensagem de erro
  const [submitting, setSubmitting] = useState(false)

  // Reabrir pra editar precisa vir preenchido. Orçamento antigo (endereço numa linha só, sem
  // initialParts) cai inteiro no campo Rua pro consultor separar.
  useEffect(() => {
    if (!open) return
    setForm({ ...EMPTY, ...(initialParts || { street: initialAddress || '' }), cep: formatCep(initialParts?.cep || ''), number: initialNumber || '' })
    setError('')
    setCepStatus('')
  }, [open, initialAddress, initialNumber, initialParts])

  const set = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))

  async function handleCepChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    setForm((prev) => ({ ...prev, cep: formatCep(digits) }))
    if (digits.length !== 8) return setCepStatus('')
    setCepStatus('buscando')
    try {
      const found = await lookupCep(digits)
      // Só preenche o que o CEP trouxe — CEP geral de cidade pequena vem sem rua/bairro.
      setForm((prev) => ({ ...prev, ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)) }))
      setCepStatus('')
    } catch (err) {
      setCepStatus(err.message || 'Não foi possível consultar o CEP.')
    }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const budget = await setBudgetAddress(budgetId, form)
      onSaved(budget)
    } catch (err) {
      setError(err.message || 'Não foi possível salvar o endereço.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar endereço' : 'Definir endereço'}</DialogTitle>
          <DialogDescription>
            Digite o CEP para preencher rua, bairro e cidade. O número é obrigatório — sem ele o mapa
            costuma marcar a casa vizinha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input className="w-32" placeholder="CEP" inputMode="numeric" autoFocus value={form.cep} onChange={handleCepChange} aria-label="CEP" />
            <span className={`text-xs ${cepStatus && cepStatus !== 'buscando' ? 'text-destructive' : 'text-muted-foreground'}`}>
              {cepStatus === 'buscando' ? 'Buscando CEP...' : cepStatus}
            </span>
          </div>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="Rua / avenida" required maxLength={200} value={form.street} onChange={set('street')} aria-label="Rua" />
            <Input className="w-24" placeholder="Número" required maxLength={20} value={form.number} onChange={set('number')} aria-label="Número" />
          </div>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="Complemento (opcional)" maxLength={100} value={form.complement} onChange={set('complement')} aria-label="Complemento" />
            <Input className="flex-1" placeholder="Bairro" maxLength={100} value={form.district} onChange={set('district')} aria-label="Bairro" />
          </div>
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="Cidade" required maxLength={100} value={form.city} onChange={set('city')} aria-label="Cidade" />
            <Input className="w-16 uppercase" placeholder="UF" required maxLength={2} value={form.state} onChange={set('state')} aria-label="UF" />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>{submitting ? 'Localizando...' : isEditing ? 'Salvar endereço' : 'Definir endereço'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
