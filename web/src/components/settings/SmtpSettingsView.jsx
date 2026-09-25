import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getSmtpSettings, saveSmtpSettings, sendSmtpTest } from '@/lib/api'

// Porta sugerida ao trocar a segurança (padrão do cPanel: 465 SSL/TLS, 587 STARTTLS).
const SECURITY = [
  { value: 'ssl', label: 'SSL/TLS (porta 465)', port: 465 },
  { value: 'starttls', label: 'STARTTLS (porta 587)', port: 587 },
]

export function SmtpSettingsView() {
  const [form, setForm] = useState({ host: '', port: 465, security: 'ssl', user: '', from: '', password: '' })
  const [hasPassword, setHasPassword] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('') // '' | 'save' | 'test'
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const reload = useCallback(() => {
    setLoading(true)
    setError('')
    getSmtpSettings()
      .then((data) => {
        setForm({ host: data.host, port: data.port, security: data.security, user: data.user, from: data.from, password: '' })
        setHasPassword(data.hasPassword)
      })
      .catch((err) => setError(err.message || 'Erro ao carregar a configuração de SMTP.'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { reload() }, [reload])

  const set = (field) => (e) => { setForm((f) => ({ ...f, [field]: e.target.value })); setNotice('') }

  async function handleSave(e) {
    e.preventDefault()
    setBusy('save')
    setError('')
    setNotice('')
    try {
      const saved = await saveSmtpSettings(form)
      setHasPassword(saved.hasPassword)
      setForm((f) => ({ ...f, password: '' }))
      setNotice('Configuração salva.')
    } catch (err) {
      setError(err.message || 'Erro ao salvar a configuração de SMTP.')
    } finally {
      setBusy('')
    }
  }

  async function handleTest() {
    setBusy('test')
    setError('')
    setNotice('')
    try {
      const { to } = await sendSmtpTest()
      setNotice(`E-mail de teste enviado para ${to}. Confira a caixa de entrada (e o spam).`)
    } catch (err) {
      setError(err.message || 'Falha ao enviar o e-mail de teste.')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4">
        <h2 className="text-lg font-semibold">E-mail (SMTP)</h2>
        <p className="text-sm text-muted-foreground">
          Servidor usado para enviar o link de recuperação de senha. A senha é guardada cifrada e nunca é exibida de novo.
          Salve antes de enviar o teste; o teste vai para o e-mail da sua conta.
        </p>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : null}

      {!loading ? (
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="smtp-host" className="text-sm font-medium">Servidor</label>
              <Input id="smtp-host" required spellCheck={false} placeholder="mail.invicco.com.br" value={form.host} onChange={set('host')} />
            </div>
            <div className="flex flex-col gap-1.5 sm:w-56">
              <label className="text-sm font-medium">Segurança</label>
              <Select
                value={form.security}
                onValueChange={(value) => {
                  const option = SECURITY.find((s) => s.value === value)
                  setForm((f) => ({ ...f, security: value, port: option.port }))
                  setNotice('')
                }}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECURITY.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="smtp-port" className="text-sm font-medium">Porta</label>
              <Input id="smtp-port" type="number" required min={1} max={65535} value={form.port} onChange={set('port')} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="smtp-user" className="text-sm font-medium">Usuário</label>
              <Input id="smtp-user" required autoComplete="off" spellCheck={false} placeholder="sistema@invicco.com.br" value={form.user} onChange={set('user')} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="smtp-password" className="text-sm font-medium">Senha</label>
            <Input
              id="smtp-password" type="password" autoComplete="new-password" required={!hasPassword}
              placeholder={hasPassword ? '•••••••• (salva — deixe em branco para manter)' : ''}
              value={form.password} onChange={set('password')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="smtp-from" className="text-sm font-medium">Remetente (opcional)</label>
            <Input id="smtp-from" type="email" spellCheck={false} placeholder="Igual ao usuário, se vazio" value={form.from} onChange={set('from')} />
          </div>

          {error ? <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          {notice ? <p role="status" className="text-sm text-muted-foreground">{notice}</p> : null}

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={busy !== ''}>{busy === 'save' ? 'Salvando...' : 'Salvar'}</Button>
            <Button type="button" variant="outline" onClick={handleTest} disabled={busy !== '' || !hasPassword}>
              {busy === 'test' ? 'Enviando...' : 'Enviar e-mail de teste'}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
