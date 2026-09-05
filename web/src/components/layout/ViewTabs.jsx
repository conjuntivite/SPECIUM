import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export function ViewTabs({ value, onValueChange, budgetPanel, searchPanel, productsPanel }) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="gap-6">
      <TabsList className="mx-auto">
        <TabsTrigger value="budget">🗂️ Orçamento</TabsTrigger>
        <TabsTrigger value="search">🔍 Busca avançada por item</TabsTrigger>
        <TabsTrigger value="products">📦 Produtos</TabsTrigger>
      </TabsList>
      <TabsContent value="budget">{budgetPanel}</TabsContent>
      <TabsContent value="search">{searchPanel}</TabsContent>
      <TabsContent value="products">{productsPanel}</TabsContent>
    </Tabs>
  )
}
