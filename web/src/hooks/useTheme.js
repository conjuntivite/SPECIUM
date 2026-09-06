import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'comprador-inviolavel:theme'
const DEFAULT_CUSTOM_COLOR = '#06b6d4'
const MODES = ['dark', 'light', 'custom']

function loadTheme() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    const mode = MODES.includes(saved.mode) ? saved.mode : 'dark'
    const customColor = /^#[0-9a-f]{6}$/i.test(saved.customColor || '') ? saved.customColor : DEFAULT_CUSTOM_COLOR
    return { mode, customColor }
  } catch {
    return { mode: 'dark', customColor: DEFAULT_CUSTOM_COLOR }
  }
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const value = parseInt(clean, 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

// Fórmula padrão de luminância relativa (WCAG) — decide se o texto em cima da cor escolhida deve
// ser claro ou escuro, pra continuar legível não importa qual cor o usuário escolher.
function relativeLuminance({ r, g, b }) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function idealForeground(hex) {
  return relativeLuminance(hexToRgb(hex)) > 0.4 ? '#0b0f19' : '#f8fafc'
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Tema "personalizado" = a mesma paleta escura de sempre (:root em index.css), só com
// --primary/--primary-foreground/--ring recalculados a partir da cor escolhida — a personalização é
// só estética e só sobre essa cor, como pedido. dark/light usam os blocos CSS de index.css puros,
// então limpamos qualquer sobra inline ao trocar pra um deles.
function applyTheme({ mode, customColor }) {
  const root = document.documentElement
  root.dataset.theme = mode
  if (mode === 'custom') {
    root.style.setProperty('--primary', customColor)
    root.style.setProperty('--primary-foreground', idealForeground(customColor))
    root.style.setProperty('--ring', withAlpha(customColor, 0.5))
  } else {
    root.style.removeProperty('--primary')
    root.style.removeProperty('--primary-foreground')
    root.style.removeProperty('--ring')
  }
}

export function useTheme() {
  const [theme, setTheme] = useState(loadTheme)

  useEffect(() => { applyTheme(theme) }, [theme])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(theme)) } catch { /* storage indisponível, tema não persiste */ }
  }, [theme])

  const setMode = useCallback((mode) => setTheme((t) => ({ ...t, mode })), [])
  // Escolher uma cor já ativa o modo personalizado — não faz sentido escolher cor sem estar nele.
  const setCustomColor = useCallback((customColor) => setTheme({ mode: 'custom', customColor }), [])

  return { mode: theme.mode, customColor: theme.customColor, setMode, setCustomColor }
}
