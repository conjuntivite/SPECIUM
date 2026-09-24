import { useCallback, useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faMapLocationDot, faPenToSquare, faEye, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { listBudgets, createBudget, deleteBudget } from '@/lib/api'

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
}

// Etapas do orçamento — mesmo vocabulário usado na barra de ações do canvas (BudgetView).
const STATUS_LABEL = { aberto: 'Aberto', negociacao: 'Em negociação', fechado: 'Fechado' }
const STATUS_VARIANT = { aberto: 'outline', negociacao: 'secondary', fechado: 'default' }

export function BudgetsListView({ onOpenBudget }) {
  const [budgets, setBudgets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    listBudgets()
      .then((data) => setBudgets(data.budgets || []))
      .catch((err) => setError(err.message || 'Erro ao carregar orçamentos.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  // Só orçamento "aberto" pode ser excluído (ver validação espelhada no servidor) — o backend
  // recusa qualquer outra etapa, esta confirmação aqui é só pra não disparar a chamada à toa.
  async function handleDelete(budget) {
    if (!window.confirm(`Excluir o orçamento${budget.clientName ? ` de ${budget.clientName}` : ''}? Essa ação não pode ser desfeita.`)) return
    try {
      await deleteBudget(budget.id)
      reload()
    } catch (err) {
      setError(err.message || 'Erro ao excluir orçamento.')
    }
  }

  async function handleCreate() {
    setCreating(true)
    try {
      const budget = await createBudget()
      onOpenBudget(budget.id)
    } catch (err) {
      setError(err.message || 'Erro ao criar orçamento.')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-medium">Meus orçamentos</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleCreate} disabled={creating}>
            <FontAwesomeIcon icon={faPlus} /> Novo orçamento
          </Button>
        </div>
      </div>

      {error ? <p className="mb-3 text-sm text-destructive">{error}</p> : null}
      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}

      {!loading && !budgets.length ? (
        <p className="text-sm text-muted-foreground">Nenhum orçamento ainda. Clique em "Novo orçamento" para começar.</p>
      ) : null}

      {budgets.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead>Atualizado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgets.map((budget) => {
              const isClosed = budget.status === 'fechado'
              const canDelete = budget.status === 'aberto'
              return (
                <TableRow key={budget.id} className="cursor-pointer" onClick={() => onOpenBudget(budget.id)}>
                  <TableCell>{budget.clientName || <span className="text-muted-foreground">(sem cliente)</span>}</TableCell>
                  <TableCell><Badge variant={STATUS_VARIANT[budget.status] || 'secondary'}>{STATUS_LABEL[budget.status] || budget.status}</Badge></TableCell>
                  <TableCell>{formatDate(budget.createdAt)}</TableCell>
                  <TableCell>{formatDate(budget.updatedAt)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost" size="sm" disabled={!budget.hasAddress}
                        title={budget.hasAddress ? 'Ver no mapa' : 'Defina o endereço no orçamento para liberar o mapa'}
                        onClick={() => onOpenBudget(budget.id, 'map')}
                      >
                        <FontAwesomeIcon icon={faMapLocationDot} /> Mapa
                      </Button>
                      <Button
                        variant="ghost" size="sm" title={isClosed ? 'Orçamento fechado — só visualização' : 'Editar orçamento'}
                        onClick={() => onOpenBudget(budget.id, 'canvas')}
                      >
                        <FontAwesomeIcon icon={isClosed ? faEye : faPenToSquare} /> {isClosed ? 'Visualizar' : 'Editar'}
                      </Button>
                      <Button
                        variant="ghost" size="sm" disabled={!canDelete}
                        title={canDelete ? 'Excluir orçamento' : 'Só orçamentos "Aberto" podem ser excluídos'}
                        onClick={() => handleDelete(budget)}
                      >
                        <FontAwesomeIcon icon={faTrashCan} className={canDelete ? 'text-destructive' : undefined} /> Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      ) : null}
    </div>
  )
}
