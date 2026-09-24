import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMoon, faSun } from '@fortawesome/free-solid-svg-icons'
import { useTheme } from '@/hooks/useTheme'
import { cn } from '@/lib/utils'

// Alterna escuro <-> claro com um clique; o ícone mostra o tema pra onde o clique leva.
// Padrão: botão flutuante no canto (tela de login). `inline`: linha do rodapé do menu lateral;
// `showLabel` mostra o texto ao lado do ícone quando o menu está expandido.
export function ThemeSwitcher({ inline = false, showLabel = false }) {
  const { mode, toggleMode } = useTheme()
  const label = mode === 'dark' ? 'Tema claro' : 'Tema escuro'

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={toggleMode}
      className={inline
        ? cn('flex h-10 w-full items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground', !showLabel && 'justify-center px-0')
        : 'fixed top-4 right-4 z-50 flex size-9 items-center justify-center rounded-full border border-border bg-card/90 text-foreground backdrop-blur transition-colors hover:bg-secondary'}
    >
      <FontAwesomeIcon icon={mode === 'dark' ? faSun : faMoon} className="size-4" />
      {inline && showLabel ? <span>{label}</span> : null}
    </button>
  )
}
