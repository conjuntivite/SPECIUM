import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'specium:theme'

// Claro (padrão do Trade UI) e escuro — quem já escolheu um tema continua nele.
function loadMode() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}').mode === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
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
