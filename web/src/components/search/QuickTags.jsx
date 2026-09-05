import { Button } from '@/components/ui/button'
import { QUICK_TAGS } from '@/data/categoryPresets'

export function QuickTags({ onSelect }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted-foreground">Buscas populares:</span>
      {QUICK_TAGS.map((tag) => (
        <Button
          key={tag.label}
          type="button"
          variant="secondary"
          size="sm"
          className="rounded-full"
          onClick={() => onSelect(tag)}
        >
          {tag.label}
        </Button>
      ))}
    </div>
  )
}
