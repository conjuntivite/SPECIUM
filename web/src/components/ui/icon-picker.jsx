import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { PRODUCT_ICON_OPTIONS, getProductIcon } from '@/lib/productIcons'

// Mesmo padrão de dropdown feito na mão do GroupCombobox/ResourceCombobox: fecha ao clicar fora,
// sem depender de Popover do radix.
//
// O menu vai pra um portal em document.body, com posição calculada (position: fixed) a partir do
// botão — não fica preso num <div style="position:relative"> local. Sem isso, qualquer ancestral
// com backdrop-blur/filter/transform (comum nos cards flutuantes sobre o mapa e o canvas) cria um
// stacking context próprio e prende o z-index do menu lá dentro, deixando-o escondido atrás de
// texto/elementos que vêm depois no HTML mas fora desse ancestral.
export function IconPicker({ value, onChange, compact = false }) {
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (triggerRef.current?.contains(e.target)) return
      if (menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // scroll de qualquer ancestral (a lista de equipamentos do mapa rola, por exemplo) não
    // atualiza a posição calculada — mais simples fechar do que manter sincronizado.
    function handleScrollOrResize() { setOpen(false) }
    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('scroll', handleScrollOrResize, true)
    window.addEventListener('resize', handleScrollOrResize)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('scroll', handleScrollOrResize, true)
      window.removeEventListener('resize', handleScrollOrResize)
    }
  }, [open])

  // Grade de 30 ícones (+ linha "remover" quando já tem um selecionado) fica perto de 260px de
  // altura — suficiente pra decidir se cabe abaixo do botão ou se precisa abrir pra cima. Vira "pra
  // cima" quando o botão está perto do rodapé (ex.: item no fim de uma lista longa), senão o menu
  // nasce cortado pela borda da tela.
  const ESTIMATED_MENU_HEIGHT = 260
  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpward = spaceBelow < ESTIMATED_MENU_HEIGHT && rect.top > spaceBelow
      setCoords(
        openUpward
          ? { bottom: window.innerHeight - rect.top + 4, left: rect.left }
          : { top: rect.bottom + 4, left: rect.left }
      )
    }
    setOpen((o) => !o)
  }

  const selected = PRODUCT_ICON_OPTIONS.find((opt) => opt.key === value)

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        title={selected?.label || 'Escolher ícone'}
        className={`flex ${compact ? 'size-7' : 'size-9'} shrink-0 items-center justify-center rounded-lg border border-input bg-transparent text-foreground transition-colors hover:bg-secondary`}
      >
        <FontAwesomeIcon icon={getProductIcon(value)} className={compact ? 'size-3.5' : 'size-4'} />
      </button>

      {open && coords ? createPortal(
        <div
          ref={menuRef}
          style={{ ...coords, maxHeight: 'calc(100vh - 16px)' }}
          className="fixed z-[10000] grid w-64 grid-cols-6 gap-1 overflow-y-auto rounded-lg border border-input bg-popover p-2 text-popover-foreground shadow-md"
        >
          {value ? (
            <button
              type="button"
              className="col-span-6 mb-1 rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
              onClick={() => { onChange(''); setOpen(false) }}
            >
              Remover ícone
            </button>
          ) : null}
          {PRODUCT_ICON_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              title={opt.label}
              onClick={() => { onChange(opt.key); setOpen(false) }}
              className={`flex size-9 items-center justify-center rounded-md transition-colors hover:bg-accent ${value === opt.key ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            >
              <FontAwesomeIcon icon={opt.icon} className="size-4" />
            </button>
          ))}
        </div>,
        document.body
      ) : null}
    </>
  )
}
