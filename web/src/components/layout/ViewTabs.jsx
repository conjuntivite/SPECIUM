import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClipboardList, faBox, faMagnifyingGlass, faTag } from '@fortawesome/free-solid-svg-icons'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export function ViewTabs({ value, onValueChange, budgetPanel, searchPanel, productsPanel, categoriesPanel }) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="gap-6">
      <TabsList className="mx-auto">
        <TabsTrigger value="budget"><FontAwesomeIcon icon={faClipboardList} className="size-4" /> Orçamento</TabsTrigger>
        <TabsTrigger value="search"><FontAwesomeIcon icon={faMagnifyingGlass} className="size-4" /> Busca avançada por item</TabsTrigger>
        <TabsTrigger value="products"><FontAwesomeIcon icon={faBox} className="size-4" /> Produtos</TabsTrigger>
        <TabsTrigger value="categories"><FontAwesomeIcon icon={faTag} className="size-4" /> Categorias</TabsTrigger>
      </TabsList>
      <TabsContent value="budget">{budgetPanel}</TabsContent>
      <TabsContent value="search">{searchPanel}</TabsContent>
      <TabsContent value="products">{productsPanel}</TabsContent>
      <TabsContent value="categories">{categoriesPanel}</TabsContent>
    </Tabs>
  )
}
