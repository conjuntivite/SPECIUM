import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { ViewTabs } from '@/components/layout/ViewTabs'
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher'
import { SearchView } from '@/components/search/SearchView'
import { BudgetView } from '@/components/budget/BudgetView'
import { BudgetsListView } from '@/components/budget/BudgetsListView'
import { ProductsView } from '@/components/products/ProductsView'
import { CategoriesView } from '@/components/categories/CategoriesView'
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
    <div className="relative mx-auto max-w-[1100px] px-6 py-7">
      <ThemeSwitcher />
      <Header />
      <ViewTabs
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
            <BudgetsListView auth={auth} onOpenBudget={openBudget} />
          )
        }
        searchPanel={<SearchView />}
        productsPanel={<ProductsView />}
        categoriesPanel={<CategoriesView />}
      />
      <footer className="mt-10 text-center text-sm text-muted-foreground">
        <p>Comprador Inviolável © 2026 • Análise inteligente de custo-benefício em tempo real</p>
      </footer>
    </div>
  )
}

export default App
