import { useCallback, useEffect, useState } from 'react'
import { getMe, login as apiLogin, register as apiRegister, logout as apiLogout } from '@/lib/api'

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

  const logout = useCallback(async () => {
    await apiLogout().catch(() => {})
    setUser(null)
  }, [])

  return { user, checking, error, login, register, logout, refresh }
}
