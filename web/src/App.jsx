import { useState } from 'react'
import { ViewTabs } from '@/components/layout/ViewTabs'
import { SearchView } from '@/components/search/SearchView'
import { BudgetView } from '@/components/budget/BudgetView'
import { BudgetsListView } from '@/components/budget/BudgetsListView'
import { ProductsView } from '@/components/products/ProductsView'
import { CategoriesView } from '@/components/categories/CategoriesView'
import { QuotePdfAuditView } from '@/components/audit/QuotePdfAuditView'
import { AssistantView } from '@/components/assistant/AssistantView'
import { UsersView } from '@/components/users/UsersView'
import { AiSettingsView } from '@/components/settings/AiSettingsView'
import { SmtpSettingsView } from '@/components/settings/SmtpSettingsView'
import { LoginView } from '@/components/auth/LoginView'
import { useAuth } from '@/hooks/useAuth'
import { allowedScreens } from '@/lib/screens'

function App() {
  const auth = useAuth()
  const [activeTab, setActiveTab] = useState('budget')
  const [currentBudgetId, setCurrentBudgetId] = useState(null)
  const [initialBudgetStep, setInitialBudgetStep] = useState(null)

  function openBudget(id, step) {
    setCurrentBudgetId(id)
    setInitialBudgetStep(step || null)
  }

  if (auth.checking) return null
  if (!auth.user) return <LoginView auth={auth} />

  // Aba ativa sem permissão (ou o padrão 'budget' pra quem não tem Orçamento) cai na primeira liberada;
  // atalhos entre telas (ex.: "ir pra Produtos" de dentro do orçamento) só navegam se a tela for dele.
  const allowed = allowedScreens(auth.user)
  const adminTabs = auth.user.role === 'admin' ? ['users', 'ai-settings', 'smtp-settings'] : []
  const currentTab = allowed.includes(activeTab) || adminTabs.includes(activeTab) ? activeTab : (allowed[0] || adminTabs[0] || '')
  const goTo = (tab) => { if (allowed.includes(tab)) setActiveTab(tab) }

  return (
    <ViewTabs
      user={auth.user}
      onLogout={auth.logout}
      allowed={allowed}
      footer={
        <footer className="mt-10 text-center text-sm text-muted-foreground">
          <p>SPECIUM © 2026 • Intelligent System Design</p>
        </footer>
      }
      value={currentTab}
      onValueChange={setActiveTab}
      budgetPanel={
        currentBudgetId ? (
          <BudgetView
            budgetId={currentBudgetId}
            initialStep={initialBudgetStep}
            onBackToList={() => setCurrentBudgetId(null)}
            onSwitchToSearch={() => goTo('search')}
            onGoToProducts={() => goTo('products')}
            onGoToCategories={() => goTo('categories')}
          />
        ) : (
          <BudgetsListView onOpenBudget={openBudget} />
        )
      }
      searchPanel={<SearchView />}
      productsPanel={<ProductsView />}
      categoriesPanel={<CategoriesView />}
      quoteAuditPanel={<QuotePdfAuditView />}
      assistantPanel={<AssistantView onOpenBudget={(id) => { openBudget(id); goTo('budget') }} />}
      showUsersTab={auth.user?.role === 'admin'}
      usersPanel={<UsersView auth={auth} />}
      showAiSettingsTab={auth.user?.role === 'admin'}
      aiSettingsPanel={<AiSettingsView />}
      showSmtpTab={auth.user?.role === 'admin'}
      smtpPanel={<SmtpSettingsView />}
    />
  )
}

export default App
