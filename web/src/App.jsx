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
import { LoginView } from '@/components/auth/LoginView'
import { useAuth } from '@/hooks/useAuth'

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

  return (
    <ViewTabs
      user={auth.user}
      onLogout={auth.logout}
      footer={
        <footer className="mt-10 text-center text-sm text-muted-foreground">
          <p>SPECIUM © 2026 • Intelligent System Design</p>
        </footer>
      }
      value={activeTab}
      onValueChange={setActiveTab}
      budgetPanel={
        currentBudgetId ? (
          <BudgetView
            budgetId={currentBudgetId}
            initialStep={initialBudgetStep}
            onBackToList={() => setCurrentBudgetId(null)}
            onSwitchToSearch={() => setActiveTab('search')}
            onGoToProducts={() => setActiveTab('products')}
            onGoToCategories={() => setActiveTab('categories')}
          />
        ) : (
          <BudgetsListView onOpenBudget={openBudget} />
        )
      }
      searchPanel={<SearchView />}
      productsPanel={<ProductsView />}
      categoriesPanel={<CategoriesView />}
      quoteAuditPanel={<QuotePdfAuditView />}
      assistantPanel={<AssistantView />}
      showUsersTab={auth.user?.role === 'admin'}
      usersPanel={<UsersView auth={auth} />}
      showAiSettingsTab={auth.user?.role === 'admin'}
      aiSettingsPanel={<AiSettingsView />}
    />
  )
}

export default App
