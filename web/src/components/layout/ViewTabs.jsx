import { ClipboardList, Package, Search, Tag, Zap } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export function ViewTabs({ value, onValueChange, budgetPanel, searchPanel, productsPanel, categoriesPanel, resourcesPanel }) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="gap-6">
      <TabsList className="mx-auto">
        <TabsTrigger value="budget"><ClipboardList className="size-4" /> Orçamento</TabsTrigger>
        <TabsTrigger value="search"><Search className="size-4" /> Busca avançada por item</TabsTrigger>
        <TabsTrigger value="products"><Package className="size-4" /> Produtos</TabsTrigger>
        <TabsTrigger value="categories"><Tag className="size-4" /> Categorias</TabsTrigger>
        <TabsTrigger value="resources"><Zap className="size-4" /> Recursos</TabsTrigger>
      </TabsList>
      <TabsContent value="budget">{budgetPanel}</TabsContent>
      <TabsContent value="search">{searchPanel}</TabsContent>
      <TabsContent value="products">{productsPanel}</TabsContent>
      <TabsContent value="categories">{categoriesPanel}</TabsContent>
      <TabsContent value="resources">{resourcesPanel}</TabsContent>
    </Tabs>
  )
}
