import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { setBudgetAddress } from '@/lib/api'

export function AddressDialog({ budgetId, open, onOpenChange, initialClientName, initialAddress, initialNumber, isEditing, onSaved }) {
  const [clientName, setClientName] = useState('')
  const [address, setAddress] = useState('')
  const [number, setNumber] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Reabrir pra editar um endereço já definido precisa vir com os campos preenchidos, senão a
  // "edição" seria digitar tudo de novo do zero.
  useEffect(() => {
    if (!open) return
    setClientName(initialClientName || '')
    setAddress(initialAddress || '')
    setNumber(initialNumber || '')
    setError('')
  }, [open, initialClientName, initialAddress, initialNumber])

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const budget = await setBudgetAddress(budgetId, { clientName, address, number })
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
            Informe o cliente e o endereço para gerar o mapa do local da instalação. O número do local é
            separado de propósito — sem ele o mapa costuma marcar a casa vizinha.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input placeholder="Nome do cliente" required maxLength={150} value={clientName} onChange={(e) => setClientName(e.target.value)} />
          <div className="flex gap-2">
            <Input className="flex-1" placeholder="Endereço (rua, bairro, cidade)" required maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} />
            <Input className="w-28" placeholder="Número" required maxLength={20} value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="submit" disabled={submitting}>{isEditing ? 'Salvar endereço' : 'Definir endereço e ver mapa'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
