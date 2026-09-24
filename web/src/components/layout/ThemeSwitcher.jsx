import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck, faMoon, faPalette, faSun } from '@fortawesome/free-solid-svg-icons'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

const MODES = [
  { value: 'dark', label: 'Escuro', icon: faMoon },
  { value: 'light', label: 'Claro', icon: faSun },
  { value: 'custom', label: 'Personalizado', icon: faPalette },
]

// Botão flutuante fixo na viewport (não dentro do container centralizado do App) — precisa ficar
// acima do canvas de orçamento (BudgetView é `fixed z-40` e cobre a página inteira nessa aba, ver
// SPEC.md "achado ao testar" na seção do cadastro de Recursos), senão fica inacessível a partir da
// tela inicial, igual quase aconteceu com a aba Recursos.
// `inline`: versão do rodapé do menu lateral (linha do menu, popup abre pra direita); `showLabel` mostra
// o texto ao lado do ícone quando o menu está expandido.
export function ThemeSwitcher({ inline = false, showLabel = false }) {
  const { mode, customColor, setMode, setCustomColor } = useTheme()
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const activeIcon = MODES.find((m) => m.value === mode)?.icon || faMoon

  return (
    <div ref={rootRef} className={inline ? 'relative' : 'fixed top-4 right-4 z-50'}>
      <button
        type="button"
        title="Tema"
        aria-label="Tema"
        onClick={() => setOpen((o) => !o)}
        className={inline
          ? cn('flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground', !showLabel && 'justify-center px-0')
          : 'flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground backdrop-blur transition-colors hover:bg-secondary'}
      >
        <FontAwesomeIcon icon={activeIcon} className="size-4" />
        {inline && showLabel ? <span>Tema</span> : null}
      </button>

      {open ? (
        <div className={cn(inline ? 'absolute bottom-0 left-full ml-2' : 'absolute top-11 right-0', 'z-50 flex w-52 flex-col gap-0.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg')}>
          {MODES.map(({ value, label, icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <FontAwesomeIcon icon={icon} className="size-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {mode === value ? <FontAwesomeIcon icon={faCheck} className="size-3.5 shrink-0 text-primary" /> : null}
            </button>
          ))}
          <div className="mt-1 flex items-center justify-between gap-2 border-t border-border px-2.5 pt-2">
            <label htmlFor="theme-custom-color" className="text-xs text-muted-foreground">
              Cor do sistema
            </label>
            <input
              id="theme-custom-color"
              type="color"
              value={customColor}
              onChange={(e) => setCustomColor(e.target.value)}
              title="Escolher cor personalizada"
              className="size-6 cursor-pointer rounded border border-border bg-transparent p-0"
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
