import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClipboardList, faBox, faMagnifyingGlass, faTag, faUsers, faFileShield, faRobot } from '@fortawesome/free-solid-svg-icons'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'

export function ViewTabs({
  value, onValueChange, budgetPanel, searchPanel, productsPanel, categoriesPanel, quoteAuditPanel,
  usersPanel, showUsersTab, aiSettingsPanel, showAiSettingsTab,
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange} className="gap-6">
      <TabsList className="mx-auto">
        <TabsTrigger value="budget"><FontAwesomeIcon icon={faClipboardList} className="size-4" /> Orçamento</TabsTrigger>
        <TabsTrigger value="search"><FontAwesomeIcon icon={faMagnifyingGlass} className="size-4" /> Busca avançada por item</TabsTrigger>
        <TabsTrigger value="products"><FontAwesomeIcon icon={faBox} className="size-4" /> Produtos</TabsTrigger>
        <TabsTrigger value="categories"><FontAwesomeIcon icon={faTag} className="size-4" /> Categorias</TabsTrigger>
        <TabsTrigger value="quote-audit"><FontAwesomeIcon icon={faFileShield} className="size-4" /> Validar orçamento (PDF)</TabsTrigger>
        {showUsersTab ? (
          <TabsTrigger value="users"><FontAwesomeIcon icon={faUsers} className="size-4" /> Usuários</TabsTrigger>
        ) : null}
        {showAiSettingsTab ? (
          <TabsTrigger value="ai-settings"><FontAwesomeIcon icon={faRobot} className="size-4" /> Instruções da IA</TabsTrigger>
        ) : null}
      </TabsList>
      <TabsContent value="budget">{budgetPanel}</TabsContent>
      <TabsContent value="search">{searchPanel}</TabsContent>
      <TabsContent value="products">{productsPanel}</TabsContent>
      <TabsContent value="categories">{categoriesPanel}</TabsContent>
      <TabsContent value="quote-audit">{quoteAuditPanel}</TabsContent>
      {showUsersTab ? <TabsContent value="users">{usersPanel}</TabsContent> : null}
      {showAiSettingsTab ? <TabsContent value="ai-settings">{aiSettingsPanel}</TabsContent> : null}
    </Tabs>
  )
}
