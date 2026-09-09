import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCategories, getPrices, getSuggestions } from '@/lib/api'
import { parseBRL } from '@/lib/money'
import { CONTAINER_GRID, containerNodeSize } from '@/components/budget/FlowNode'

// Portado de static/app.js:403-823. Mesmas chaves de localStorage do app original — orçamentos
// já salvos por usuários atuais sobrevivem à migração.
const BUDGET_STORAGE_KEY = 'comprador-inviolavel:budget:v2'
const POSITIONS_STORAGE_KEY = 'comprador-inviolavel:budget:positions'
const CONNECTIONS_STORAGE_KEY = 'comprador-inviolavel:budget:connections'
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
    return {
      items: items.map((item) => ({
        id: item.id, title: item.title, quantity: clampQuantity(item.quantity), icon: item.icon || null,
        containerId: Number.isFinite(item.containerId) ? item.containerId : null,
        containerOpen: item.containerOpen !== false,
        containerSize: item.containerSize && Number.isFinite(item.containerSize.width) && Number.isFinite(item.containerSize.height)
          ? { width: item.containerSize.width, height: item.containerSize.height }
          : null,
        averagePrice: null, bestOffer: null,
      })),
      nextItemId,
    }
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

// Ligações manuais que o próprio usuário desenha entre os cards (arrastando de um handle a outro),
// separadas das arestas automáticas do motor de sugestões — sobrevivem independente do que o motor
// recalcula a cada mudança nos itens.
function loadConnections() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONNECTIONS_STORAGE_KEY) || '[]')
    return Array.isArray(saved)
      ? saved.filter((c) => c && typeof c.id === 'string' && typeof c.source === 'string' && typeof c.target === 'string')
      : []
  } catch {
    return []
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
const RECOMMENDED_PRIORITY_KEYS = ['Nobreak']
function recommendedPriorityRank(req) {
  const index = RECOMMENDED_PRIORITY_KEYS.indexOf(req.key)
  return index === -1 ? RECOMMENDED_PRIORITY_KEYS.length : index
}

// Sobe a cadeia containerId a partir de um item até achar o ancestral visível mais próximo — um
// item some do canvas quando o container dele (ou o container do container...) está fechado, mas
// continua existindo pros cálculos (orçamento, edges). Usado tanto pra decidir se um item vira node
// quanto pra reancorar uma aresta técnica que apontava pra um item agora escondido.
function nearestVisibleAncestorId(itemId, itemsById) {
  let cursor = itemsById.get(itemId)
  if (!cursor) return itemId
  while (cursor.containerId != null) {
    const parent = itemsById.get(cursor.containerId)
    if (!parent) break // containerId órfão (pai removido) — trata como visível daqui
    if (parent.containerOpen !== false) break // pai aberto: este item aparece
    cursor = parent // pai fechado: sobe mais um nível (containers aninhados)
  }
  return cursor.id
}

export function useBudget() {
  const nextItemIdRef = useRef()
  if (nextItemIdRef.current === undefined) nextItemIdRef.current = loadBudget().nextItemId

  const [items, setItems] = useState(() => loadBudget().items)
  const [positions, setPositions] = useState(() => loadPositions())
  const [connections, setConnections] = useState(() => loadConnections())
  const [suggestionsData, setSuggestionsData] = useState({ requirements_by_category: {}, items: [] })
  const [priceLoading, setPriceLoading] = useState(false)
  const [priceError, setPriceError] = useState('')
  // Lista crua de categorias (com canBeContainer) — não o catálogo agrupado de useCategories(),
  // que descarta esse campo a propósito (ele só serve pra popular seletor/menu). Mesmo padrão de
  // fetch direto que CategoriesView.jsx já usa.
  const [categories, setCategories] = useState([])
  useEffect(() => {
    getCategories().then((data) => setCategories(data.categories || [])).catch(() => {})
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify({
        items: items.map(({ id, title, quantity, icon, containerId, containerOpen, containerSize }) => ({ id, title, quantity, icon, containerId, containerOpen, containerSize })),
        nextItemId: nextItemIdRef.current,
      }))
    } catch { /* storage indisponível, segue sem persistir */ }
  }, [items])

  useEffect(() => {
    try { localStorage.setItem(POSITIONS_STORAGE_KEY, JSON.stringify(positions)) } catch { /* storage indisponível */ }
  }, [positions])

  useEffect(() => {
    try { localStorage.setItem(CONNECTIONS_STORAGE_KEY, JSON.stringify(connections)) } catch { /* storage indisponível */ }
  }, [connections])

  // Guarda de race condition: cada mudança em `items` dispara seu próprio fetch de sugestões — se
  // duas ficam "no ar" ao mesmo tempo, a resposta mais antiga não pode sobrescrever a mais nova.
  const generationRef = useRef(0)
  useEffect(() => {
    const generation = ++generationRef.current
    if (!items.length) {
      setSuggestionsData({ requirements_by_category: {}, items: [] })
      return
    }
    getSuggestions(items.map((item) => ({ title: item.title, quantity: item.quantity })))
      .then((data) => {
        if (generation === generationRef.current) setSuggestionsData(data)
      })
      .catch(() => { /* segue exibindo só os itens confirmados, sem sugestões, se o servidor não responder */ })
  }, [items])

  const addItem = useCallback((rawTitle, rawQuantity = 1, dropPosition, icon = null, containerId = null) => {
    const title = (rawTitle || '').trim()
    if (!title) return
    const previousItem = items[items.length - 1]
    const newId = ++nextItemIdRef.current
    const newItem = { id: newId, title, quantity: clampQuantity(rawQuantity), icon: icon || null, containerId, containerOpen: true, averagePrice: null, bestOffer: null }
    const flowKey = itemFlowKey(newItem)
    setItems((prev) => [...prev, newItem])
    // Item que nasce dentro de um container não precisa de posição própria — a grade do container
    // (useBudget: `nodes`) calcula a posição dele sozinha a cada render.
    if (containerId == null) {
      setPositions((prev) => {
        if (prev[flowKey]) return prev
        const previousPos = previousItem && prev[itemFlowKey(previousItem)]
        const pos = dropPosition || (previousPos ? { x: previousPos.x + NODE_SPACING_X, y: previousPos.y } : { x: 60, y: 60 })
        return { ...prev, [flowKey]: pos }
      })
    }
  }, [items])

  // Excluir um item nunca exclui em cascata o que estava dentro dele (recurso-container.txt, seção
  // 11) — os filhos só perdem o container (voltam soltos pro canvas principal). A confirmação "tem
  // certeza, isso tem N equipamentos dentro" é responsabilidade de quem chama (BudgetCanvas), não
  // desta função — remover sem perguntar tem que continuar seguro de qualquer forma.
  const removeItem = useCallback((itemId) => {
    setItems((prev) => prev
      .filter((item) => item.id !== itemId)
      .map((item) => (item.containerId === itemId ? { ...item, containerId: null } : item)))
    const flowKey = itemFlowKey({ id: itemId })
    setConnections((prev) => prev.filter((c) => c.source !== flowKey && c.target !== flowKey))
  }, [])

  // Ligação manual entre dois cards, arrastada de um handle a outro — independente do motor de
  // sugestões, o usuário decide o que conecta com o quê. Guarda também de qual lado saiu e em qual
  // lado entrou (sourceHandle/targetHandle) — sem isso o desenho da linha ignora onde o cursor
  // realmente soltou e cai sempre no primeiro handle do node (o do topo). Ignora ligação repetida
  // entre o mesmo par de lados.
  const addConnection = useCallback((source, target, sourceHandle, targetHandle) => {
    if (!source || !target || source === target) return
    const id = `manual-${source}(${sourceHandle})->${target}(${targetHandle})`
    setConnections((prev) => (prev.some((c) => c.id === id) ? prev : [...prev, { id, source, target, sourceHandle, targetHandle }]))
  }, [])

  const removeConnection = useCallback((id) => {
    setConnections((prev) => prev.filter((c) => c.id !== id))
  }, [])

  const updateQuantity = useCallback((itemId, delta) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, quantity: clampQuantity(item.quantity + delta) } : item)))
  }, [])

  const updatePosition = useCallback((flowKey, pos) => {
    setPositions((prev) => ({ ...prev, [flowKey]: pos }))
  }, [])

  // Container: mover item pra dentro/fora, abrir/fechar. `moveToContainer(itemId, null)` equivale a
  // `removeFromContainer`. Bloqueia ciclo (Rack A dentro do Rack B dentro do Rack A) subindo a
  // cadeia containerId a partir do alvo — se ela chegar no próprio item sendo movido, recusa.
  const moveToContainer = useCallback((itemId, containerId) => {
    if (itemId === containerId) return
    setItems((prev) => {
      if (containerId != null) {
        const byId = new Map(prev.map((item) => [item.id, item]))
        let cursor = containerId
        while (cursor != null) {
          if (cursor === itemId) return prev // ciclo — recusa
          cursor = byId.get(cursor)?.containerId ?? null
        }
      }
      return prev.map((item) => (item.id === itemId ? { ...item, containerId } : item))
    })
  }, [])

  const removeFromContainer = useCallback((itemId) => moveToContainer(itemId, null), [moveToContainer])

  const toggleContainer = useCallback((itemId) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, containerOpen: !item.containerOpen } : item)))
  }, [])

  // Tamanho manual do container (arrastar os cantos, NodeResizer do React Flow) — null volta a usar
  // o tamanho automático calculado a partir da quantidade de filhos (containerNodeSize).
  const resizeContainer = useCallback((itemId, width, height) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, containerSize: { width, height } } : item)))
  }, [])

  const clearAll = useCallback(() => {
    setItems([])
    setPositions({})
    setConnections([])
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

  // Item cuja categoria ainda tem requisito crítico não satisfeito ("sem isso não liga") — o card
  // dele no quadro ganha contorno vermelho pra chamar atenção, além da listinha de sugestões.
  const criticalItemIds = useMemo(() => {
    const ids = new Set()
    items.forEach((item, index) => {
      const category = suggestionsData.items?.[index]?.category
      const requirements = category && suggestionsData.requirements_by_category?.[category]
      if (!requirements) return
      if (requirements.some((req) => req.severity === 'critical' && !req.satisfied_by)) ids.add(item.id)
    })
    return ids
  }, [items, suggestionsData])

  // Categorias marcadas como container (cadastro de categorias). Um item "é container" se a
  // categoria detectada tiver canBeContainer=true OU se ele já tiver filhos de uma configuração
  // anterior — assim desmarcar o checkbox depois não esconde equipamento já guardado sem jeito de
  // tirar de lá.
  const containerCategoryValues = useMemo(
    () => new Set(categories.filter((c) => c.canBeContainer).map((c) => c.value)),
    [categories]
  )
  const isContainerItemIds = useMemo(() => {
    const ids = new Set()
    items.forEach((item, index) => {
      const category = suggestionsData.items?.[index]?.category
      if (category && containerCategoryValues.has(category)) ids.add(item.id)
    })
    items.forEach((item) => { if (item.containerId != null) ids.add(item.containerId) })
    return ids
  }, [items, suggestionsData, containerCategoryValues])

  // Cabeçalho do card só fica verde depois que o item ganha uma ligação manual (linha desenhada pelo
  // usuário) com outro card — antes disso fica neutro, pra não passar a falsa impressão de que já
  // está "resolvido" dentro do fluxo. Ver FlowNode.jsx.
  const linkedFlowKeys = useMemo(() => {
    const set = new Set()
    connections.forEach((c) => { set.add(c.source); set.add(c.target) })
    return set
  }, [connections])

  // Um nó por item solto (na posição salva, ou 60+index*300 como fallback pra item antigo sem
  // posição) — item contido só vira node quando o container dele está aberto, aninhado nativamente
  // via parentId/extent do React Flow (BudgetCanvas liga connectionMode="loose" + o resto). Pai
  // sempre entra no array antes do filho (exigência do React Flow) — a recursão já garante isso.
  const nodes = useMemo(() => {
    const childrenByContainer = new Map()
    items.forEach((item) => {
      if (item.containerId == null) return
      if (!childrenByContainer.has(item.containerId)) childrenByContainer.set(item.containerId, [])
      childrenByContainer.get(item.containerId).push(item)
    })

    const result = []
    function pushNode(item, index, position, parentFlowKey) {
      const flowKey = itemFlowKey(item)
      const children = childrenByContainer.get(item.id) || []
      const isContainer = isContainerItemIds.has(item.id)
      const containerOpen = item.containerOpen !== false
      // Tamanho manual (arrastar os cantos) nunca fica menor que o mínimo pra caber a grade atual de
      // filhos — se o container ganhar mais filhos depois, o mínimo sobe e o tamanho acompanha, senão
      // um filho novo ficaria cortado fora da área visível do node.
      const autoSize = containerNodeSize(children.length)
      const containerSize = isContainer && containerOpen
        ? { width: Math.max(item.containerSize?.width || 0, autoSize.width), height: Math.max(item.containerSize?.height || 0, autoSize.height) }
        : null
      const data = {
        item, hasCriticalGap: criticalItemIds.has(item.id), isLinked: linkedFlowKeys.has(flowKey),
        isContainer, containerOpen, containerSize,
        childCount: children.length,
        childQuantityTotal: children.reduce((sum, c) => sum + c.quantity, 0),
        childValueTotal: children.reduce((sum, c) => {
          const v = parseBRL(c.averagePrice)
          return v !== null ? sum + v * c.quantity : sum
        }, 0) || null,
        containedIn: item.containerId,
      }
      const node = { id: flowKey, type: 'confirmed', position, data }
      if (parentFlowKey) { node.parentId = parentFlowKey; node.extent = 'parent' }
      if (containerSize) node.style = containerSize
      result.push(node)

      if (isContainer && containerOpen) {
        children.forEach((child, childIndex) => {
          const childFlowKey = itemFlowKey(child)
          // Livre pra arrastar dentro do container (mesma mecânica de sempre: onNodeDragStop no
          // BudgetCanvas já chama updatePosition pra qualquer node, incluindo filho) — a grade só
          // decide onde um filho recém-chegado nasce, antes do usuário arrastar ele pela primeira vez.
          const col = childIndex % CONTAINER_GRID.columns
          const row = Math.floor(childIndex / CONTAINER_GRID.columns)
          const fallbackPosition = { x: CONTAINER_GRID.originX + col * CONTAINER_GRID.spacingX, y: CONTAINER_GRID.originY + row * CONTAINER_GRID.spacingY }
          const childPosition = positions[childFlowKey] || fallbackPosition
          pushNode(child, childIndex, childPosition, flowKey)
        })
      }
    }

    items.filter((item) => item.containerId == null).forEach((item, index) => {
      const flowKey = itemFlowKey(item)
      const position = positions[flowKey] || { x: 60 + index * NODE_SPACING_X, y: 60 }
      pushNode(item, index, position, null)
    })
    return result
  }, [items, positions, criticalItemIds, isContainerItemIds, linkedFlowKeys])

  // Arestas manuais: o usuário desenha arrastando de um handle a outro — traço sólido cyan. Ficam
  // selecionáveis/deletáveis (Delete/Backspace). As ligações não são mais inferidas automaticamente
  // pelo motor de sugestões — o usuário decide quais equipamentos conectar no canvas.
  const manualEdges = useMemo(() => connections.map((c) => ({
    id: c.id, source: c.source, target: c.target,
    sourceHandle: c.sourceHandle, targetHandle: c.targetHandle, type: 'step',
    style: { stroke: 'rgba(34,211,238,0.85)', strokeWidth: 2 },
  })), [connections])

  // Reancora uma ligação manual que aponte pra um item escondido — dentro de um container fechado —
  // pro ancestral visível mais próximo, em vez de simplesmente sumir (é o que recurso-container.txt
  // mostra: Rack/Switch continuam recebendo a ligação externa da Câmera enquanto o Rack está
  // fechado). ponytail: duas ligações escondidas que reancoram no mesmo par (origem, destino)
  // colapsam numa aresta só — perde a contagem de "eram N", suficiente pro MVP. Só colapsa quando a
  // reancoragem de fato mudou uma ponta (item escondido) — ligações entre dois itens já visíveis
  // passam direto, cada uma com sua própria linha.
  const edges = useMemo(() => {
    const itemsById = new Map(items.map((item) => [item.id, item]))
    const remapEndpoint = (flowKey) => {
      const itemId = Number(flowKey.slice('item-'.length))
      return itemFlowKey({ id: nearestVisibleAncestorId(itemId, itemsById) })
    }
    const visible = []
    const bySourceTarget = new Map()
    for (const edge of manualEdges) {
      const source = remapEndpoint(edge.source)
      const target = remapEndpoint(edge.target)
      if (source === target) continue // os dois lados escondidos atrás do mesmo container
      if (source === edge.source && target === edge.target) { visible.push(edge); continue }
      const key = `${source}->${target}`
      if (!bySourceTarget.has(key)) bySourceTarget.set(key, { ...edge, source, target })
    }
    return [...visible, ...bySourceTarget.values()]
  }, [manualEdges, items])

  // Sugestões ainda não satisfeitas, deduplicadas entre âncoras que compartilham o mesmo requisito
  // (ex.: "Fonte 12V" pode ser sugestiva pro DVR e crítica/alternativa pra Câmera IP PoE ao mesmo
  // tempo) — fica a versão mais severa, não a primeira âncora processada.
  const suggestions = useMemo(() => {
    const unsatisfiedByKey = new Map()
    Object.values(suggestionsData.requirements_by_category || {}).forEach((requirements) => {
      requirements.forEach((req) => {
        if (req.satisfied_by) return
        const existing = unsatisfiedByKey.get(req.key)
        if (!existing || suggestionSeverityRank(req) < suggestionSeverityRank(existing)) unsatisfiedByKey.set(req.key, req)
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
    addConnection,
    removeConnection,
    moveToContainer,
    removeFromContainer,
    toggleContainer,
    resizeContainer,
    clearAll,
    checkPrices,
  }
}
