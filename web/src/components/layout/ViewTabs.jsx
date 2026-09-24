import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faClipboardList, faBox, faMagnifyingGlass, faTag, faUsers, faFileShield, faRobot, faComments,
  faAnglesLeft, faAnglesRight, faRightFromBracket,
} from '@fortawesome/free-solid-svg-icons'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { Brand } from './Brand'
import { ThemeSwitcher } from './ThemeSwitcher'
import { UserAvatar } from '@/components/users/UserAvatar'

const COLLAPSED_KEY = 'specium.sidebarCollapsed'

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
}

// Menu lateral fixo à esquerda; recolhido mostra só os ícones (o nome vira tooltip nativo via title).
// z-30 de propósito: o canvas do orçamento (BudgetView, fixed z-40) continua cobrindo a tela inteira.
export function ViewTabs({
  value, onValueChange, user, onLogout, footer, budgetPanel, searchPanel, productsPanel, categoriesPanel, quoteAuditPanel, assistantPanel,
  usersPanel, showUsersTab, aiSettingsPanel, showAiSettingsTab,
}) {
  const [collapsed, setCollapsed] = useState(readCollapsed)

  function toggleCollapsed() {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1') } catch { /* storage indisponível, só não persiste */ }
      return !c
    })
  }

  const items = [
    { value: 'budget', icon: faClipboardList, label: 'Orçamento' },
    { value: 'search', icon: faMagnifyingGlass, label: 'Busca avançada por item' },
    { value: 'products', icon: faBox, label: 'Produtos' },
    { value: 'categories', icon: faTag, label: 'Categorias' },
    { value: 'quote-audit', icon: faFileShield, label: 'Validar orçamento (PDF)' },
    { value: 'assistant', icon: faComments, label: 'Assistente ONE/SIAM' },
    ...(showUsersTab ? [{ value: 'users', icon: faUsers, label: 'Usuários' }] : []),
    ...(showAiSettingsTab ? [{ value: 'ai-settings', icon: faRobot, label: 'Instruções da IA' }] : []),
  ]

  return (
    <Tabs value={value} onValueChange={onValueChange} orientation="vertical" className="flex-row gap-0">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-30 flex flex-col border-r border-border bg-card/80 backdrop-blur transition-[width] duration-200',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className={cn('flex h-16 shrink-0 items-center border-b border-border', collapsed ? 'justify-center' : 'px-4')}>
          {collapsed ? <img src="/logo-cat.png" alt="SPECIUM" className="h-8 w-auto" /> : <Brand icon className="text-xl" />}
        </div>
        <TabsList variant="line" className="w-full flex-1 items-stretch justify-start gap-1 overflow-y-auto p-2">
          {items.map((item) => (
            <TabsTrigger
              key={item.value}
              value={item.value}
              title={collapsed ? item.label : undefined}
              className={cn('h-10 flex-none gap-3 px-3 text-sm data-active:bg-secondary', collapsed && 'justify-center! px-0')}
            >
              <FontAwesomeIcon icon={item.icon} className="size-4" />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="flex flex-col gap-1 border-t border-border p-2">
          <div className={cn('flex items-center gap-3 px-1.5 py-1', collapsed && 'justify-center px-0')} title={collapsed ? (user?.name || user?.email) : undefined}>
            <UserAvatar user={user} />
            {collapsed ? null : (
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-medium">{user?.name || user?.email}</p>
                {user?.name ? <p className="truncate text-xs text-muted-foreground">{user.email}</p> : null}
              </div>
            )}
          </div>
          <ThemeSwitcher inline showLabel={!collapsed} />
          <button
            type="button"
            onClick={onLogout}
            title="Sair"
            aria-label="Sair"
            className={cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="size-4" />
            {collapsed ? null : <span>Sair</span>}
          </button>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            className={cn(
              'flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground',
              collapsed && 'justify-center px-0',
            )}
          >
            <FontAwesomeIcon icon={collapsed ? faAnglesRight : faAnglesLeft} className="size-4" />
            {collapsed ? null : <span>Recolher menu</span>}
          </button>
        </div>
      </aside>

      <div className={cn('min-w-0 flex-1 transition-[padding] duration-200', collapsed ? 'pl-16' : 'pl-60')}>
        <div className="mx-auto max-w-[1100px] px-6 py-7">
          <TabsContent value="budget">{budgetPanel}</TabsContent>
          <TabsContent value="search">{searchPanel}</TabsContent>
          <TabsContent value="products">{productsPanel}</TabsContent>
          <TabsContent value="categories">{categoriesPanel}</TabsContent>
          <TabsContent value="quote-audit">{quoteAuditPanel}</TabsContent>
          <TabsContent value="assistant">{assistantPanel}</TabsContent>
          {showUsersTab ? <TabsContent value="users">{usersPanel}</TabsContent> : null}
          {showAiSettingsTab ? <TabsContent value="ai-settings">{aiSettingsPanel}</TabsContent> : null}
          {footer}
        </div>
      </div>
    </Tabs>
  )
}
