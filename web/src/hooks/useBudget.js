import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCategories, getPrices, getSuggestions, getBudget, updateBudget, uploadFloorPlan as uploadFloorPlanFile } from '@/lib/api'
import { parseBRL } from '@/lib/money'
import { CONTAINER_GRID, containerNodeSize } from '@/components/budget/FlowNode'
import { dedupeUnsatisfiedSuggestions } from '@/lib/suggestions'

// Nó tem 220px de largura — 300px de passo deixa ~80px de vão entre eles.
const NODE_SPACING_X = 300
// Debounce do autosave — evita um PATCH por frame de arraste (onNodeDragStop chama updatePosition
// a cada node solto do grupo movido).
const SAVE_DEBOUNCE_MS = 500

function clampQuantity(value) {
  const n = Math.trunc(Number(value))
  return Number.isFinite(n) && n > 0 ? Math.min(n, 999) : 1
}

// Mesmo saneamento que a leitura do localStorage sempre fez — agora aplicado ao que vem da API,
// que é uma fonte igualmente "não confiável" (documento pode ter sido salvo por uma versão antiga).
function sanitizeItems(rawItems) {
  const items = Array.isArray(rawItems)
    ? rawItems.filter((item) => item && typeof item.title === 'string' && item.title.trim() && Number.isFinite(item.id))
    : []
  return items.map((item) => ({
    id: item.id, title: item.title, quantity: clampQuantity(item.quantity), icon: item.icon || null,
    containerId: Number.isFinite(item.containerId) ? item.containerId : null,
    containerOpen: item.containerOpen !== false,
    containerSize: item.containerSize && Number.isFinite(item.containerSize.width) && Number.isFinite(item.containerSize.height)
      ? { width: item.containerSize.width, height: item.containerSize.height }
      : null,
    averagePrice: null, bestOffer: null,
  }))
}

function sanitizePositions(rawPositions) {
  return rawPositions && typeof rawPositions === 'object' && !Array.isArray(rawPositions) ? rawPositions : {}
}

// Ligações manuais que o próprio usuário desenha entre os cards (arrastando de um handle a outro),
// separadas das arestas automáticas do motor de sugestões — sobrevivem independente do que o motor
// recalcula a cada mudança nos itens.
function sanitizeConnections(rawConnections) {
  return Array.isArray(rawConnections)
    ? rawConnections.filter((c) => c && typeof c.id === 'string' && typeof c.source === 'string' && typeof c.target === 'string')
    : []
}

// Mesma checagem de forma serve pro mapLayout (lat/lng geográfico) e pro floorPlanLayout (pixel da
// imagem enviada) — ambos são só { markers, lines }, a diferença está no espaço de coordenadas.
function sanitizeLayout(rawLayout) {
  return rawLayout && typeof rawLayout === 'object' && !Array.isArray(rawLayout) ? rawLayout : {}
}

export const itemFlowKey = (item) => `item-${item.id}`

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

export function useBudget(budgetId) {
  const nextItemIdRef = useRef(0)

  const [items, setItems] = useState([])
  const [positions, setPositions] = useState({})
  const [connections, setConnections] = useState([])
  const [mapLayout, setMapLayout] = useState({})
  // Alternativa ao mapa: mesma forma (markers/lines), mas em coordenadas de pixel da imagem
  // enviada, não lat/lng geográfico — ver FloorPlanCanvas. `floorPlan` é null até o consultor
  // enviar uma imagem (`uploadFloorPlan`); a partir daí carrega { path, width, height }.
  const [floorPlan, setFloorPlan] = useState(null)
  const [floorPlanLayout, setFloorPlanLayout] = useState({})
  const [status, setStatus] = useState('aberto')
  // Snapshot do que já está gravado no servidor — canvas (itens/posições/conexões/etapa) só
  // persiste com um clique explícito em "Salvar" (ver `save`); "Cancelar" (`discard`) volta pra cá.
  // Endereço e mapLayout continuam com vida própria (têm sua própria ação/autosave), fora deste
  // snapshot.
  const lastSavedRef = useRef({ items: [], positions: {}, connections: [], status: 'aberto' })
  const [clientName, setClientName] = useState(null)
  const [address, setAddress] = useState(null)
  const [number, setNumber] = useState(null)
  const [lat, setLat] = useState(null)
  const [lng, setLng] = useState(null)
  const [loaded, setLoaded] = useState(false)
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

  // Carrega o orçamento do backend uma vez por budgetId — troca a fonte de verdade de
  // localStorage pra Mongo (Fase 2), mesma sanitização que a leitura do localStorage sempre fez.
  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    getBudget(budgetId).then((data) => {
      if (cancelled) return
      const loadedItems = sanitizeItems(data.items)
      nextItemIdRef.current = loadedItems.reduce((max, item) => Math.max(max, item.id), 0)
      setItems(loadedItems)
      setPositions(sanitizePositions(data.positions))
      setConnections(sanitizeConnections(data.connections))
      setMapLayout(sanitizeLayout(data.mapLayout))
      setFloorPlan(data.floorPlan || null)
      setFloorPlanLayout(sanitizeLayout(data.floorPlanLayout))
      const loadedStatus = data.status || 'aberto'
      setStatus(loadedStatus)
      lastSavedRef.current = {
        items: loadedItems,
        positions: sanitizePositions(data.positions),
        connections: sanitizeConnections(data.connections),
        status: loadedStatus,
      }
      setClientName(data.clientName || null)
      setAddress(data.address || null)
      setNumber(data.number || null)
      setLat(Number.isFinite(data.lat) ? data.lat : null)
      setLng(Number.isFinite(data.lng) ? data.lng : null)
      setLoaded(true)
    }).catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [budgetId])

  // Chamado pelo BudgetView depois que POST /api/budgets/:id/address volta com sucesso — evita um
  // segundo round-trip só pra reler o que a resposta já trouxe. Não mexe em status: definir/editar
  // endereço é uma ação independente da etapa do orçamento.
  const applyAddress = useCallback((updatedBudget) => {
    setClientName(updatedBudget.clientName || null)
    setAddress(updatedBudget.address || null)
    setNumber(updatedBudget.number || null)
    setLat(Number.isFinite(updatedBudget.lat) ? updatedBudget.lat : null)
    setLng(Number.isFinite(updatedBudget.lng) ? updatedBudget.lng : null)
  }, [])

  // mapLayout continua com autosave automático (debounced) — é edição feita na tela do mapa, uma
  // jornada separada da do canvas, sem botão Salvar/Cancelar próprio. Uma mudança de posição durante
  // um arraste dispara isso a cada frame; sem o debounce seria um PATCH por frame.
  const mapSaveTimeoutRef = useRef(null)
  useEffect(() => {
    if (!loaded) return
    clearTimeout(mapSaveTimeoutRef.current)
    mapSaveTimeoutRef.current = setTimeout(() => {
      updateBudget(budgetId, { mapLayout }).catch(() => { /* autosave silencioso — próxima mudança tenta de novo */ })
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(mapSaveTimeoutRef.current)
  }, [mapLayout, loaded, budgetId])

  // Mesmo autosave debounced do mapLayout, agora pro layout da planta baixa (posições em pixel da
  // imagem enviada) — telas irmãs, mesmo padrão de persistência.
  const floorPlanSaveTimeoutRef = useRef(null)
  useEffect(() => {
    if (!loaded) return
    clearTimeout(floorPlanSaveTimeoutRef.current)
    floorPlanSaveTimeoutRef.current = setTimeout(() => {
      updateBudget(budgetId, { floorPlanLayout }).catch(() => { /* autosave silencioso — próxima mudança tenta de novo */ })
    }, SAVE_DEBOUNCE_MS)
    return () => clearTimeout(floorPlanSaveTimeoutRef.current)
  }, [floorPlanLayout, loaded, budgetId])

  // Lê as dimensões reais do arquivo antes de enviar — o servidor não abre a imagem, só precisa
  // saber o tamanho pra montar os limites do canvas (ver FloorPlanCanvas: L.CRS.Simple).
  // createImageBitmap é nativo do navegador, sem depender de <img> escondida nem lib nova.
  const uploadFloorPlan = useCallback(async (file) => {
    const bitmap = await createImageBitmap(file)
    const { width, height } = bitmap
    bitmap.close()
    const updated = await uploadFloorPlanFile(budgetId, file, width, height)
    setFloorPlan(updated.floorPlan)
    setFloorPlanLayout(sanitizeLayout(updated.floorPlanLayout))
  }, [budgetId])

  function itemsPayload(list) {
    return list.map(({ id, title, quantity, icon, containerId, containerOpen, containerSize }) => ({ id, title, quantity, icon, containerId, containerOpen, containerSize }))
  }

  // Salvar do canvas (itens/posições/conexões) é explícito, não mais debounced — não mexe em etapa,
  // essa é decisão do consultor (ver `changeStatus`), nunca um efeito colateral de salvar.
  const save = useCallback(async () => {
    await updateBudget(budgetId, { items: itemsPayload(items), positions, connections })
    lastSavedRef.current = { ...lastSavedRef.current, items, positions, connections }
  }, [budgetId, items, positions, connections])

  // Cancelar descarta o que foi mexido no canvas desde o último Salvar (ou desde que o orçamento
  // carregou) — volta pro snapshot, não mexe no que já está gravado no servidor.
  const discard = useCallback(() => {
    const snapshot = lastSavedRef.current
    setItems(snapshot.items)
    setPositions(snapshot.positions)
    setConnections(snapshot.connections)
    setStatus(snapshot.status)
  }, [])

  // Troca de etapa é sempre uma ação explícita do consultor (seletor no canvas), nunca automática —
  // grava na hora, independente de Salvar. "fechado" trava o orçamento pra só-leitura no servidor
  // (updateBudgetForUser), então essa é a última troca possível por aqui.
  const changeStatus = useCallback(async (nextStatus) => {
    await updateBudget(budgetId, { status: nextStatus })
    lastSavedRef.current = { ...lastSavedRef.current, status: nextStatus }
    setStatus(nextStatus)
  }, [budgetId])

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

  // Atribuir ícone na hora, direto do mapa — usado quando o item não veio de um produto cadastrado
  // com ícone (cadastro em branco vira o box genérico até alguém escolher um aqui).
  const setItemIcon = useCallback((itemId, icon) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, icon: icon || null } : item)))
  }, [])

  const updateQuantity = useCallback((itemId, delta) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, quantity: clampQuantity(item.quantity + delta) } : item)))
  }, [])

  const updatePosition = useCallback((flowKey, pos) => {
    setPositions((prev) => ({ ...prev, [flowKey]: pos }))
  }, [])

  // Várias posições de uma vez (auto-ajuste ao abrir um container, ver BudgetCanvas.jsx) — um único
  // merge em vez de N chamadas de updatePosition.
  const updatePositions = useCallback((updates) => {
    setPositions((prev) => ({ ...prev, ...updates }))
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

  // Memória de undo do layout — não é state (não precisa re-renderizar nada sozinha, e não persiste
  // no servidor, é só conveniência da sessão atual). Ao abrir um container guarda como o canvas
  // estava; BudgetCanvas.jsx empurra os vizinhos que ficarem sobrepostos logo em seguida. Ao fechar,
  // devolve exatamente esse retrato — sem isso o auto-ajuste do "abrir" seria uma via de mão única.
  const containerLayoutSnapshotsRef = useRef(new Map())

  const toggleContainer = useCallback((itemId) => {
    const current = items.find((i) => i.id === itemId)
    if (!current) return
    const opening = current.containerOpen === false
    let restoredSizesById = null
    if (opening) {
      containerLayoutSnapshotsRef.current.set(itemId, {
        positions,
        containerSizesById: Object.fromEntries(items.filter((i) => i.containerSize).map((i) => [i.id, i.containerSize])),
      })
    } else {
      const snapshot = containerLayoutSnapshotsRef.current.get(itemId)
      if (snapshot) {
        setPositions(snapshot.positions)
        restoredSizesById = snapshot.containerSizesById
        containerLayoutSnapshotsRef.current.delete(itemId)
      }
    }
    setItems((prev) => prev.map((item) => {
      if (item.id === itemId) return { ...item, containerOpen: !item.containerOpen }
      if (restoredSizesById) return { ...item, containerSize: restoredSizesById[item.id] || null }
      return item
    }))
  }, [items, positions])

  // Aplica o tamanho auto-calculado (extensão real dos filhos) em vários containers de uma vez —
  // abrir um container aninhado pode obrigar o pai, o avô etc. a crescer no mesmo gesto.
  const setContainerSizes = useCallback((sizesById) => {
    setItems((prev) => prev.map((item) => (sizesById[item.id] ? { ...item, containerSize: sizesById[item.id] } : item)))
  }, [])

  // Tamanho manual do container (arrastar os cantos, NodeResizer do React Flow). Arrastar qualquer
  // canto que não seja o inferior-direito faz o NodeResizer mover o node (x/y) pra manter o canto
  // oposto fixo — sem gravar esse novo x/y aqui, o node volta pra posição antiga no próximo render
  // (o efeito em BudgetCanvas.jsx recalcula `nodes` a partir de `positions` assim que `containerSize`
  // muda), ficando maior mas "vazado" pro lado errado, com o filho aparentando ter sumido do card.
  const resizeContainer = useCallback((itemId, width, height, x, y) => {
    setItems((prev) => prev.map((item) => (item.id === itemId ? { ...item, containerSize: { width, height } } : item)))
    if (Number.isFinite(x) && Number.isFinite(y)) {
      setPositions((prev) => ({ ...prev, [itemFlowKey({ id: itemId })]: { x, y } }))
    }
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
  const suggestions = useMemo(
    () => dedupeUnsatisfiedSuggestions(suggestionsData.requirements_by_category),
    [suggestionsData]
  )

  const total = useMemo(() => items.reduce((sum, item) => {
    const unitValue = parseBRL(item.averagePrice)
    return unitValue !== null ? sum + unitValue * item.quantity : sum
  }, 0), [items])

  return {
    loaded,
    items,
    nodes,
    edges,
    suggestions,
    total,
    mapLayout,
    setMapLayout,
    floorPlan,
    floorPlanLayout,
    setFloorPlanLayout,
    uploadFloorPlan,
    status,
    save,
    discard,
    changeStatus,
    clientName,
    address,
    number,
    lat,
    lng,
    applyAddress,
    priceLoading,
    priceError,
    addItem,
    removeItem,
    setItemIcon,
    updateQuantity,
    updatePosition,
    updatePositions,
    addConnection,
    removeConnection,
    moveToContainer,
    removeFromContainer,
    toggleContainer,
    resizeContainer,
    setContainerSizes,
    clearAll,
    checkPrices,
  }
}
