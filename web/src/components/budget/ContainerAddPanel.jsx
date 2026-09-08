import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCategories } from '@/hooks/useCategories'

// Vive só dentro do rodapé de um container aberto (FlowNode) — dois seletores de "ação" (escolher
// já dispara, não fica com valor selecionado): categoria nova direto pro container, ou um item solto
// do canvas que já existia antes de virar container. Reaproveita o <Select> do shadcn (mesmo
// componente do SearchForm/ProductFormDialog) em vez de um popover novo.
export function ContainerAddPanel({ containerId, looseItems, onAddCategory, onMoveToContainer }) {
  const catalog = useCategories()

  return (
    <div className="nodrag flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Select value="" onValueChange={(value) => { const item = catalog.flatMap((g) => g.items).find((i) => i.value === value); if (item) onAddCategory(containerId, item) }}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder="+ Novo equipamento" />
        </SelectTrigger>
        <SelectContent>
          {catalog.map((group) => (
            <SelectGroup key={group.group}>
              <SelectLabel>{group.group}</SelectLabel>
              {group.items.map((item) => (<SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>

      {looseItems.length ? (
        <Select value="" onValueChange={(value) => onMoveToContainer(Number(value), containerId)}>
          <SelectTrigger size="sm" className="w-full">
            <SelectValue placeholder="Mover item existente" />
          </SelectTrigger>
          <SelectContent>
            {looseItems.map((item) => (
              <SelectItem key={item.id} value={String(item.id)}>{item.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}
