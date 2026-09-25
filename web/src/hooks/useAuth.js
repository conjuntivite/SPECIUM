import { useCallback, useEffect, useState } from 'react'
import { getMe, login as apiLogin, register as apiRegister, logout as apiLogout, forgotPassword as apiForgot, resetPassword as apiReset } from '@/lib/api'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')

  const refresh = useCallback(() => {
    return getMe().then(setUser).catch(() => setUser(null))
  }, [])

  useEffect(() => {
    refresh().finally(() => setChecking(false))
  }, [refresh])

  const login = useCallback(async (email, password) => {
    setError('')
    try {
      setUser(await apiLogin(email, password))
      return true
    } catch (err) {
      setError(err.message || 'Não foi possível entrar.')
      return false
    }
  }, [])

  const register = useCallback(async (email, password) => {
    setError('')
    try {
      setUser(await apiRegister(email, password))
      return true
    } catch (err) {
      setError(err.message || 'Não foi possível criar a conta.')
      return false
    }
  }, [])

  const forgot = useCallback(async (email) => {
    setError('')
    try {
      await apiForgot(email)
      return true
    } catch (err) {
      setError(err.message || 'Não foi possível enviar o e-mail.')
      return false
    }
  }, [])

  const reset = useCallback(async (token, password) => {
    setError('')
    try {
      setUser(await apiReset(token, password))
      return true
    } catch (err) {
      setError(err.message || 'Não foi possível redefinir a senha.')
      return false
    }
  }, [])

  const clearError = useCallback(() => setError(''), [])

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {})
    setUser(null)
  }, [])

  return { user, checking, error, login, register, forgot, reset, clearError, logout, refresh }
}
