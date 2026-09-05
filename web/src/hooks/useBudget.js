import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getPrices, getSuggestions } from '@/lib/api'
import { parseBRL } from '@/lib/money'

// Portado de static/app.js:403-823. Mesmas chaves de localStorage do app original — orçamentos
// já salvos por usuários atuais sobrevivem à migração.
const BUDGET_STORAGE_KEY = 'comprador-inviolavel:budget:v2'
const POSITIONS_STORAGE_KEY = 'comprador-inviolavel:budget:positions'
// Nó tem 220px de largura — 300px de passo deixa ~80px de vão entre eles.
const NODE_SPACING_X = 300

function clampQuantity(value) {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 1
}

function loadBudget() {
  try {
    const saved = JSON.parse(localStorage.getItem(BUDGET_STORAGE_KEY) || '{}')
    const items = Array.isArray(saved.items)
      ? saved.items.filter((item) => item && typeof item.title === 'string' && item.title.trim() && Number.isFinite(item.id))
      : []
    const nextItemId = Number.isFinite(saved.nextItemId) ? saved.nextItemId : items.reduce((max, item) => Math.max(max, item.id), 0)
    return { items: items.map((item) => ({ id: item.id, title: item.title, quantity: clampQuantity(item.quantity), averagePrice: null, bestOffer: null })), nextItemId }
  } catch {
    return { items: [], nextItemId: 0 }
  }
}

function loadPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITIONS_STORAGE_KEY) || '{}')
    return saved && typeof saved === 'object' ? saved : {}
  } catch {
    return {}
  }
}

export const itemFlowKey = (item) => `item-${item.id}`

// Ordem de urgência da listinha lateral: crítico (vermelho) sempre primeiro, depois essencial
// (âmbar), depois alternativa opcional (laranja), recomendado (cinza) por último.
function suggestionSeverityRank(req) {
  if (req.severity === 'critical') return 0
  if (req.essential) return 1
  if (req.severity === 'optional') return 2
  return 3
}

// Dentro do grupo "recomendado", Nobreak vem primeiro — pedido explícito.
const RECOMMENDED_PRIORITY_KEYS = ['nobreak']
function recommendedPriorityRank(req) {
  const index = RECOMMENDED_PRIORITY_KEYS.indexOf(req.key)
  return index === -1 ? RECOMMENDED_PRIORITY_KEYS.length : index
}

export function useBudget() {
  const nextItemIdRef = useRef()
  if (nextItemIdRef.current === undefined) nextItemIdRef.current = loadBudget().nextItemId

  const [items, setItems] = useState(() => loadBudget().items)
  const [positions, setPositions] = useState(() => loadPositions())
  const [suggestionsData, setSuggestionsData] = useState({ requirements_by_category: {}, items: [] })
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify({ items: items.map(({ id, title, quantity }) => ({ id, title, quantity })), nextItemId: nextItemIdRef.current }))
    } catch { /* storage indisponível, segue sem persistir */ }
  }, [items])

  useEffect(() => {
    try { localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions)) } catch { /* storage indisponível */ }
  }, [positions])

  // Guarda de race condition: cada mudança em `items` dispara seu próprio fetch de sugestões — se
  // duas ficam "no ar" ao mesmo tempo, a resposta mais antiga não pode sobrescrever a mais nova.
  const generationRef = useRef(0)
  useEffect(() => {
    const generation = ++generationRef.current
    if (!items.length) {
      setSuggestionsData({ requirements_by_category: {}, items: [] })
      return
    }
    getSuggestions(items.map((item) => ({ title: item.title })))
      .then((data) => {
        if (generation === generationRef.current) setSuggestionsData(data)
      })
      .catch(() => { /* segue exibindo só os itens confirmados, sem sugestões, se o servidor não responder */ })
  }, [items])

  const addItem = useCallback((rawTitle, rawQuantity = 1, dropPosition) => {
    const title = (rawTitle || '').trim()
    if (!title) return
    const previousItem = items[items.length - 1]
    const newId = ++nextItemIdRef.current
    const newItem = { id: newId, title, quantity: clampQuantity(rawQuantity), averagePrice: null, bestOffer: null }
    const flowKey = itemFlowKey(newItem)
    setItems((prev) => [...prev, newItem])
    setPositions((prev) => {
      if (prev[flowKey]) return prev
      const previousPos = previousItem && prev[itemFlowKey(previousItem)]
      const pos = dropPosition || (previousPos ? { x: previousPos.x + NODE_SPACING_X, y: previousPos.y } : { x: 60, y: 60 })
      return { ...prev, [flowKey]: pos }
    })
  }, [items])

  const removeItem = useCallback((itemId) => {
    setItems((prev) => prev.filter((item) => item.id !== itemId))
  }, [])

  const updateQuantity = useCallback((itemId, delta) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, quantity: clampQuantity(item.quantity + delta) } : item)))
  }, [])

  const updatePosition = useCallback((flowKey, pos) => {
    setPositions((prev) => ({ ...prev, [flowKey]: pos }))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
    setPositions({})
  }, [])

  const checkPrices = useCallback(async () => {
    if (!items.length || priceLoading) return
    setPriceLoading(true)
    setPriceError('')
    try {
      const data = await getPrices(items.map((item) => ({ label: item.title, search_term: item.title })))
      const resultByLabel = new Map((data.results || []).map((result) => [result.label, result]))
      setItems((prev) => prev.map((item) => {
        const result = resultByLabel.get(item.title)
        return { ...item, averagePrice: result?.average_price || null, bestOffer: (result?.deals && result.deals[0]) || null }
      }))
    } catch (err) {
      setPriceError(err.message || 'Erro ao verificar preços.')
    } finally {
      setPriceLoading(false)
    }
  }, [items, priceLoading])

  // Um nó por item, na posição salva (ou 60+index*300 como fallback pra item antigo sem posição).
  const nodes = useMemo(() => items.map((item, index) => {
    const flowKey = itemFlowKey(item)
    const position = positions[flowKey] || { x: 60 + index * NODE_SPACING_X, y: 60 }
    return { id: flowKey, type: 'confirmed', position, data: { item } }
  }), [items, positions])

  // Arestas: de cada item-âncora pra quem já satisfaz cada requisito seu — requisito ainda não
  // satisfeito fica sem aresta até o usuário arrastar a sugestão correspondente pro canvas.
  const edges = useMemo(() => {
    const firstItemByTitle = new Map()
    items.forEach((item) => { if (!firstItemByTitle.has(item.title)) firstItemByTitle.set(item.title, item) })
    const result = []
    items.forEach((item, index) => {
      const category = suggestionsData.items?.[index]?.category
      const requirements = category && suggestionsData.requirements_by_category?.[category]
      if (!requirements) return
      const fromKey = itemFlowKey(item)
      requirements.forEach((req) => {
        if (!req.satisfied_by) return
        const target = firstItemByTitle.get(req.satisfied_by)
        if (!target) return
        const toKey = itemFlowKey(target)
        if (fromKey === toKey) return
        result.push({ id: `${fromKey}->${toKey}->${req.key}`, source: fromKey, target: toKey, type: 'step' })
      })
    })
    return result
  }, [items, suggestionsData])

  // Sugestões ainda não satisfeitas, deduplicadas entre âncoras que compartilham o mesmo requisito.
  const suggestions = useMemo(() => {
    const unsatisfiedByKey = new Map()
    Object.values(suggestionsData.requirements_by_category || {}).forEach((requirements) => {
      requirements.forEach((req) => {
        if (!req.satisfied_by && !unsatisfiedByKey.has(req.key)) unsatisfiedByKey.set(req.key, req)
      })
    })
    return [...unsatisfiedByKey.values()].sort((a, b) => {
      const severityDiff = suggestionSeverityRank(a) - suggestionSeverityRank(b)
      return severityDiff !== 0 ? severityDiff : recommendedPriorityRank(a) - recommendedPriorityRank(b)
    })
  }, [suggestionsData])

  const total = useMemo(() => items.reduce((sum, item) => {
    const unitValue = parseBRL(item.averagePrice)
    return unitValue !== null ? sum + unitValue * item.quantity : sum
  }, 0), [items])

  return {
    items,
    nodes,
    edges,
    suggestions,
    total,
    priceLoading,
    priceError,
    addItem,
    removeItem,
    updateQuantity,
    updatePosition,
    clearAll,
    checkPrices,
  }
}
