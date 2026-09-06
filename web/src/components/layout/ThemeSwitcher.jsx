import { useEffect, useRef, useState } from 'react'
import { Check, Moon, Palette, Sun } from 'lucide-react'
import { useTheme } from '@/hooks/useTheme'

const MODES = [
  { value: 'dark', label: 'Escuro', Icon: Moon },
  { value: 'light', label: 'Claro', Icon: Sun },
  { value: 'custom', label: 'Personalizado', Icon: Palette },
]

// Botão flutuante fixo na viewport (não dentro do container centralizado do App) — precisa ficar
// acima do canvas de orçamento (BudgetView é `fixed z-40` e cobre a página inteira nessa aba, ver
// SPEC.md "achado ao testar" na seção do cadastro de Recursos), senão fica inacessível a partir da
// tela inicial, igual quase aconteceu com a aba Recursos.
export function ThemeSwitcher() {
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

  const ActiveIcon = MODES.find((m) => m.value === mode)?.Icon || Moon

  return (
    <div ref={rootRef} className="fixed top-4 right-4 z-50">
      <button
        type="button"
        title="Tema"
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground backdrop-blur transition-colors hover:bg-secondary"
      >
        <ActiveIcon className="size-4" />
      </button>

      {open ? (
        <div className="absolute top-11 right-0 flex w-52 flex-col gap-0.5 rounded-lg border border-border bg-popover p-1.5 text-popover-foreground shadow-lg">
          {MODES.map(({ value, label, Icon }) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted"
            >
              <Icon className="size-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {mode === value ? <Check className="size-3.5 shrink-0 text-primary" /> : null}
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
