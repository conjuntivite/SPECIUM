import { useMemo, useState } from 'react'
import { Card } from '@/components/ui/card'
import { CATEGORY_PRESETS, DEFAULT_PLACEHOLDERS } from '@/data/categoryPresets'
import { searchDeals, compareDeals } from '@/lib/api'
import { useCompareSelection } from '@/hooks/useCompareSelection'
import { SearchForm } from './SearchForm'
import { LoadingState } from './LoadingState'
import { ErrorAlert } from './ErrorAlert'
import { InsightBanner } from './InsightBanner'
import { DealsGrid } from './DealsGrid'
import { CompareBar } from './CompareBar'
import { CompareTable } from './CompareTable'

export function SearchView() {
  const [category, setCategory] = useState('')
  const [itemName, setItemName] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState('all')

  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [resultsData, setResultsData] = useState(null)

  const compare = useCompareSelection()
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareSnapshot, setCompareSnapshot] = useState([])
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState('')
  const [compareResults, setCompareResults] = useState(null)

  const preset = CATEGORY_PRESETS[category]
  const brandPlaceholder = preset ? preset.brandPlaceholder : DEFAULT_PLACEHOLDERS.brand
  const modelPlaceholder = preset ? preset.modelPlaceholder : DEFAULT_PLACEHOLDERS.model

  function resetCompareState() {
    compare.clear()
    setCompareOpen(false)
    setCompareResults(null)
  }

  async function runSearch(params) {
    if (!params.item_name.trim()) {
      setError('Por favor, informe ao menos o nome do produto.')
      return
    }
    setIsLoading(true)
    setError('')
    setResultsData(null)
    resetCompareState()
    try {
      const data = await searchDeals(params)
      setResultsData(data)
    } catch (err) {
      setError(err.message || 'Erro ao comunicar com o servidor.')
    } finally {
      setIsLoading(false)
    }
  }

  function handleCategoryChange(value) {
    setCategory(value)
    const nextPreset = CATEGORY_PRESETS[value]
    if (nextPreset) setItemName(nextPreset.item)
  }

  function handleQuickTag(tag) {
    setCategory(tag.category)
    setItemName(tag.item)
    setBrand(tag.brand)
    setModel(tag.model)
    runSearch({ item_name: tag.item, brand: tag.brand, model: tag.model, provider })
  }

  async function handleCompare() {
    const items = compare.items
    setCompareSnapshot(items)
    setCompareOpen(true)
    setCompareLoading(true)
    setCompareError('')
    setCompareResults(null)
    try {
      const data = await compareDeals(items.map((item) => ({ url: item.url, title: item.title })))
      setCompareResults(data.results || [])
    } catch (err) {
      setCompareError(err.message || 'Erro ao comparar produtos.')
    } finally {
      setCompareLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="border-border bg-card p-6">
        <h2 className="mb-1 text-xl font-semibold">Busca avançada por item</h2>
        <p className="mb-5 text-sm text-muted-foreground">
          Prefere buscar um item específico direto, sem passar pelo orçamento? Use o formulário abaixo.
        </p>
        <SearchForm
          category={category}
          onCategoryChange={handleCategoryChange}
          itemName={itemName}
          onItemNameChange={setItemName}
          brand={brand}
          onBrandChange={setBrand}
          model={model}
          onModelChange={setModel}
          provider={provider}
          onProviderChange={setProvider}
          brandPlaceholder={brandPlaceholder}
          modelPlaceholder={modelPlaceholder}
          isLoading={isLoading}
          onQuickTag={handleQuickTag}
          onSubmit={() => runSearch({ item_name: itemName, brand, model, provider })}
        />
      </Card>

      {isLoading ? (
        <LoadingState
          title="Varrendo lojas e calculando custo-benefício..."
          subtitle="Analisando Intelbras, Amazon e o mercado via Google Shopping"
        />
      ) : null}

      <ErrorAlert message={error} />

      {resultsData ? (
        <div className="flex flex-col gap-4">
          <InsightBanner text={resultsData.summary_insight} />
          <DealsGrid data={resultsData} compare={compare} />
        </div>
      ) : null}

      <CompareBar count={compare.count} onClear={resetCompareState} onCompare={handleCompare} />

      {compareOpen ? (
        <CompareTable
          items={compareSnapshot}
          results={compareResults}
          isLoading={compareLoading}
          error={compareError}
          onClose={() => setCompareOpen(false)}
        />
      ) : null}
    </div>
  )
}
