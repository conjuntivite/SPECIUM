import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'specium:theme'

// Só escuro (padrão) e claro — quem tinha o antigo "personalizado" salvo volta pro escuro.
function loadMode() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').mode === 'light' ? 'light' : 'dark'
  } catch {
    return 'dark'
  }
}

export function useTheme() {
  const [mode, setMode] = useState(loadMode)

  useEffect(() => {
    document.documentElement.dataset.theme = mode
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode })) } catch { /* storage indisponível, tema não persiste */ }
  }, [mode])

  const toggleMode = useCallback(() => setMode((m) => (m === 'dark' ? 'light' : 'dark')), [])

  return { mode, toggleMode }
}
