import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { listUsers, updateUser } from '@/lib/api'
import { UserFormDialog } from './UserFormDialog'

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'
}

export function UsersView({ auth }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editingUser, setEditingUser] = useState(null)

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    listUsers()
      .then((data) => setUsers(data.users || []))
      .catch((err) => setError(err.message || 'Erro ao carregar usuários.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  function openEdit(user) {
    setEditingUser(user)
    setFormOpen(true)
  }

  async function handleSubmit(form) {
    await updateUser(editingUser.id, form)
    setFormOpen(false)
    reload()
    // Editou a própria conta (nome/e-mail exibidos no cabeçalho, ou o próprio papel) — recarrega
    // a sessão local pra refletir na hora, sem precisar de F5.
    if (editingUser.id === auth.user?.id) auth.refresh?.()
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Usuários cadastrados</h2>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {users.length ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name || <span className="text-muted-foreground">(sem nome)</span>}</TableCell>
                <TableCell>{user.email}</TableCell>
                <TableCell><Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role === 'admin' ? 'Administrador' : 'Usuário'}</Badge></TableCell>
                <TableCell>{formatDate(user.createdAt)}</TableCell>
                <TableCell className="text-right">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(user)}>Editar</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      <UserFormDialog open={formOpen} user={editingUser} onOpenChange={setFormOpen} onSubmit={handleSubmit} />
    </div>
  )
}
