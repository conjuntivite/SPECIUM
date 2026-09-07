import { useState } from 'react'
import { Header } from '@/components/layout/Header'
import { ViewTabs } from '@/components/layout/ViewTabs'
import { ThemeSwitcher } from '@/components/layout/ThemeSwitcher'
import { SearchView } from '@/components/search/SearchView'
import { BudgetView } from '@/components/budget/BudgetView'
import { ProductsView } from '@/components/products/ProductsView'
import { CategoriesView } from '@/components/categories/CategoriesView'

function App() {
  const [activeTab, setActiveTab] = useState('budget')

  return (
    <div className="relative mx-auto max-w-[1100px] px-6 py-7">
      <ThemeSwitcher />
      <Header />
      <ViewTabs
        value={activeTab}
        onValueChange={setActiveTab}
        budgetPanel={<BudgetView onSwitchToSearch={() => setActiveTab('search')} onGoToProducts={() => setActiveTab('products')} onGoToCategories={() => setActiveTab('categories')} />}
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
