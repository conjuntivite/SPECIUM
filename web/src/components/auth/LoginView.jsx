import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export function LoginView({ auth }) {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await (mode === 'login' ? auth.login(email, password) : auth.register(email, password))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{mode === 'login' ? 'Entrar' : 'Criar conta'}</CardTitle>
          <CardDescription>Comprador Inviolável — orçamentos de segurança eletrônica</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="flex flex-col gap-3">
            <Input type="email" placeholder="E-mail" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            <Input type="password" placeholder="Senha (mín. 8 caracteres)" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            {auth.error ? <p className="text-sm text-destructive">{auth.error}</p> : null}
          </CardContent>
          <CardFooter className="flex flex-col items-stretch gap-2">
            <Button type="submit" disabled={submitting} className="w-full">
              {mode === 'login' ? 'Entrar' : 'Criar conta'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? 'Não tem conta? Criar uma' : 'Já tem conta? Entrar'}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
