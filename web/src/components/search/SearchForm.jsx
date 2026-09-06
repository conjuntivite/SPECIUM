import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CATEGORY_OPTIONS, PROVIDER_OPTIONS } from '@/data/categoryPresets'
import { QuickTags } from './QuickTags'

export function SearchForm({
  category,
  onCategoryChange,
  itemName,
  onItemNameChange,
  brand,
  onBrandChange,
  model,
  onModelChange,
  provider,
  onProviderChange,
  brandPlaceholder,
  modelPlaceholder,
  onSubmit,
  onQuickTag,
  isLoading,
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit()
      }}
      className="flex flex-col gap-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="category" className="text-sm text-muted-foreground">
            Categoria
          </label>
          <Select
            value={category || 'custom'}
            onValueChange={(value) => onCategoryChange(value === 'custom' ? '' : value)}
          >
            <SelectTrigger id="category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value || 'custom'} value={opt.value || 'custom'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="item_name" className="text-sm text-muted-foreground">
            Produto <span className="text-[var(--destructive)]">*</span>
          </label>
          <Input
            id="item_name"
            placeholder="Ex: DVR, Switch PoE, Roteador"
            required
            autoComplete="off"
            value={itemName}
            onChange={(e) => onItemNameChange(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="brand" className="text-sm text-muted-foreground">
            Marca
          </label>
          <Input
            id="brand"
            placeholder={brandPlaceholder}
            autoComplete="off"
            value={brand}
            onChange={(e) => onBrandChange(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="model" className="text-sm text-muted-foreground">
            Modelo
          </label>
          <Input
            id="model"
            placeholder={modelPlaceholder}
            autoComplete="off"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <label htmlFor="provider" className="text-sm text-muted-foreground">
            Provedor de busca
          </label>
          <Select value={provider} onValueChange={onProviderChange}>
            <SelectTrigger id="provider" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PROVIDER_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <QuickTags onSelect={onQuickTag} />

      <Button type="submit" disabled={isLoading} className="self-start">
        <Search className="size-4" /> Buscar Melhores Ofertas
      </Button>
    </form>
  )
}
