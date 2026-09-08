import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { PRODUCT_ICON_OPTIONS, getProductIcon } from '@/lib/productIcons'

// Mesmo padrão de dropdown feito na mão do GroupCombobox/ResourceCombobox: fecha ao clicar fora,
// sem depender de Popover do radix.
export function IconPicker({ value, onChange }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function handlePointerDown(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  const selected = PRODUCT_ICON_OPTIONS.find((opt) => opt.key === value)

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={selected?.label || 'Escolher ícone'}
        className="flex size-9 items-center justify-center rounded-lg border border-input bg-transparent text-foreground transition-colors hover:bg-secondary"
      >
        <FontAwesomeIcon icon={getProductIcon(value)} className="size-4" />
      </button>

      {open ? (
        <div className="absolute z-[60] mt-1 grid w-64 grid-cols-6 gap-1 rounded-lg border border-input bg-popover p-2 text-popover-foreground shadow-md">
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
        </div>
      ) : null}
    </div>
  )
}
