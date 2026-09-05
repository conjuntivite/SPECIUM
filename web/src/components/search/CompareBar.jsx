import { Button } from '@/components/ui/button'

export function CompareBar({ count, onClear, onCompare }) {
  if (count === 0) return null
  return (
    <div className="sticky bottom-4 z-10 mx-auto flex w-fit items-center gap-4 rounded-full border border-border bg-card px-5 py-3 shadow-elevated backdrop-blur">
      <span className="text-sm">{count}/3 selecionados para comparar</span>
      <div className="flex gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={onClear}>
          Limpar seleção
        </Button>
        <Button type="button" size="sm" disabled={count < 2} onClick={onCompare}>
          Comparar Ficha Técnica
        </Button>
      </div>
    </div>
  )
}
