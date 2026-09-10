import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { ReactFlow, Background, BackgroundVariant, applyNodeChanges, applyEdgeChanges, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSackDollar, faExpand, faPlus, faTrashCan, faMagnifyingGlassPlus, faMagnifyingGlassMinus } from '@fortawesome/free-solid-svg-icons'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { useCategories } from '@/hooks/useCategories'
import { FlowNode } from './FlowNode'
import { ProductPickerDialog } from './ProductPickerDialog'

const nodeTypes = { confirmed: FlowNode }

// Categoria (a do produto escolhido, não a do prompt — um prompt de sugestão genérica como "NVR"
// cobre várias categorias) + marca + modelo -> título do item no orçamento. A categoria fica no
// início pra manter as mesmas palavras-chave que o motor de sugestões (server.js) já reconhece por
// regex (ex.: "DVR", "16 Canais") — cadastrar o produto não muda a detecção de categoria.
function composeProductTitle(product) {
  return `${product.category} ${product.brand} ${product.model}`.trim()
}

export const BudgetCanvas = forwardRef(function BudgetCanvas({ budget, onGoToProducts, readOnly }, ref) {
  const catalog = useCategories()
  // Uma sugestão de capacidade (ex.: "Conectividade Gigabit") pode ter mais de uma categoria
  // candidata — o rótulo do requisito não é um value de categoria real, então "Adicionar sem
  // produto cadastrado" precisa do rótulo da categoria (a primeira candidata), não do requisito.
  const categoryLabelByValue = useMemo(
    () => Object.fromEntries(catalog.flatMap((group) => group.items.map((item) => [item.value, item.label]))),
    [catalog]
  )
  const { screenToFlowPosition, zoomIn, zoomOut, fitView, getIntersectingNodes } = useReactFlow()
  // Posição do último clique com botão direito — usada como ponto de spawn ao adicionar item
  // pelo menu (equivalente ao ponto de solto do drag-and-drop da suggestions strip).
  const lastContextPosRef = useRef({ x: 0, y: 0 })

  // Estado local espelhando budget.nodes: sem isso, arrastar só atualiza a posição no fim do
  // gesto (onNodeDragStop), e o card fica parado embaixo do cursor até soltar — "teleportando"
  // pro lugar certo só depois. Com onNodesChange+applyNodeChanges, cada evento de movimento do
  // drag (a cada frame) já entra nesse estado local, então o card acompanha o mouse em tempo
  // real; só ao soltar (onNodeDragStop) a posição final é persistida em budget.positions.
  const [nodes, setNodes] = useState([])

  const looseItems = useMemo(() => budget.items.filter((item) => item.containerId == null), [budget.items])

  // Toda entrada no orçamento — item de categoria do menu, sugestão arrastada ou clicada na
  // listinha lateral, ou "+ Novo equipamento" dentro de um container aberto — para aqui antes de
  // virar nó: { label, categories, fallbackTitle, position, containerId? }. `position` já vem em
  // coordenadas do flow (indefinida = useBudget decide um layout automático); `containerId` marca
  // que o item nasce dentro de um container em vez de solto no canvas.
  const [productPrompt, setProductPrompt] = useState(null)

  // "+ Novo equipamento" dentro de um container aberto (ContainerAddPanel, via FlowNode).
  const handleAddCategoryToContainer = useCallback((containerId, item) => {
    setProductPrompt({ label: item.label, categories: [item.value], fallbackTitle: item.value, position: undefined, containerId })
  }, [])

  // Excluir um item que é container com filhos dentro merece confirmação — os filhos não são
  // excluídos junto (useBudget.removeItem já garante isso), mas o usuário precisa saber que eles
  // voltam soltos pro canvas antes de clicar (recurso-container.txt, seção 11).
  const handleNodeRemove = useCallback((itemId, childCount) => {
    if (childCount > 0) {
      const ok = window.confirm(
        `Este item contém ${childCount} equipamento${childCount === 1 ? '' : 's'} interno${childCount === 1 ? '' : 's'}. ` +
        'Removê-lo NÃO exclui os equipamentos internos — eles voltam soltos pro canvas principal.\n\nContinuar?'
      )
      if (!ok) return
    }
    budget.removeItem(itemId)
  }, [budget])

  useEffect(() => {
    setNodes(budget.nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        onRemove: () => handleNodeRemove(node.data.item.id, node.data.childCount),
        onQtyChange: budget.updateQuantity,
        onToggleContainer: budget.toggleContainer,
        onRemoveFromContainer: budget.removeFromContainer,
        onMoveToContainer: budget.moveToContainer,
        onResizeContainer: budget.resizeContainer,
        onAddCategoryToContainer: handleAddCategoryToContainer,
        // Item solto não pode "mover pra dentro de si mesmo" — filtra o próprio container da lista
        // que o ContainerAddPanel dele mostra (só importa pra node que é container, mas filtrar
        // sempre é mais simples do que decidir condicionalmente aqui).
        looseItems: looseItems.filter((loose) => loose.id !== node.data.item.id),
        // Orçamento fechado: FlowNode esconde os controles que mudam composição (qtd, remover,
        // redimensionar, mover pra dentro/fora de container) — abrir/fechar container continua
        // liberado (não persiste sem Salvar, é só conveniência de visualização).
        readOnly,
      },
    })))
  }, [budget.nodes, handleNodeRemove, budget.updateQuantity, budget.toggleContainer, budget.removeFromContainer, budget.moveToContainer, budget.resizeContainer, handleAddCategoryToContainer, looseItems, readOnly])

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  // Mesmo motivo do espelho de nodes acima: como `edges` é controlado (vem pronto de budget.edges),
  // sem esse estado local + onEdgesChange o clique numa aresta pra selecioná-la (e depois apagar com
  // Delete) não "gruda" — o React Flow não tem onde guardar o `selected: true` antes do próximo render.
  const [edges, setEdges] = useState([])

  useEffect(() => {
    setEdges(budget.edges)
  }, [budget.edges])

  const onEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds))
  }, [])

  // Aresta manual já nasce com `style.stroke` próprio (cyan, pra se diferenciar da automática
  // tracejada) — esse inline style tem mais especificidade que o `.selected` do CSS padrão do React
  // Flow, então sem isso aqui o clique seleciona (funciona, dá pra apagar) mas não SE VÊ selecionado.
  const displayEdges = useMemo(() => edges.map((edge) => (
    edge.selected && edge.style
      ? { ...edge, style: { ...edge.style, stroke: '#67e8f9', strokeWidth: (edge.style.strokeWidth ?? 2) + 1.5 } }
      : edge
  )), [edges])

  // `nodes` (3º argumento) é todo o grupo selecionado que moveu junto, não só o card que o usuário
  // pegou pelo cursor — sem persistir a posição de cada um, os outros card do grupo "voltam" pro
  // lugar antigo no próximo render (só o clicado gravava antes de existir seleção múltipla aqui).
  const handleNodeDragStop = useCallback((_event, node, nodes) => {
    const moved = nodes?.length ? nodes : [node]
    moved.forEach((n) => budget.updatePosition(n.id, n.position))

    // Largou (o grupo inteiro, ou um item só) em cima de um container aberto? Cada item solto que
    // aterrissou lá dentro vira filho dele — item já filho de outro container fica de fora (extent
    // "parent" do node já trava ele lá dentro, não tem como soltar fora) e o próprio container
    // também fica de fora (aninhar container dentro de container por arraste é além do pedido).
    moved.forEach((n) => {
      if (n.parentId || n.data?.isContainer) return
      const target = getIntersectingNodes(n).find((cand) => cand.id !== n.id && cand.data?.isContainer && cand.data?.containerOpen)
      if (target) budget.moveToContainer(n.data.item.id, target.data.item.id)
    })
  }, [budget, getIntersectingNodes])

  const handleNodesDelete = useCallback((deleted) => {
    deleted.forEach((node) => {
      if (node.data?.item) handleNodeRemove(node.data.item.id, node.data.childCount)
    })
  }, [handleNodeRemove])

  // Ligação manual: o usuário arrasta de um handle a outro pra conectar dois cards — sem isso, só as
  // arestas automáticas do motor de sugestões apareciam no quadro.
  const handleConnect = useCallback((connection) => {
    budget.addConnection(connection.source, connection.target, connection.sourceHandle, connection.targetHandle)
  }, [budget])

  const handleEdgesDelete = useCallback((deleted) => {
    deleted.forEach((edge) => budget.removeConnection(edge.id))
  }, [budget])

  const handleDragOver = useCallback((e) => {
    if (readOnly) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [readOnly])

  // Drag-and-drop nativo (HTML5 DnD) da suggestions strip pro canvas — independente do drag interno
  // do React Flow usado pra mover nós já existentes.
  const handleDrop = useCallback((e) => {
    if (readOnly) return
    e.preventDefault()
    const payload = e.dataTransfer.getData('application/json')
    if (!payload) return
    const { key, label, categories } = JSON.parse(payload)
    const resolvedCategories = categories?.length ? categories : [key]
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setProductPrompt({ label, categories: resolvedCategories, fallbackTitle: categoryLabelByValue[resolvedCategories[0]] || label, position })
  }, [readOnly, screenToFlowPosition, categoryLabelByValue])

  // Botão direito com o cursor em cima de um container aberto -> "Adicionar item" do menu deve
  // nascer lá dentro, não solto no canvas atrás dele (mesmo teste de sobreposição do drag-and-drop
  // pra dentro de container, só que num ponto em vez de um node inteiro).
  function containerAtPosition(position) {
    const hit = getIntersectingNodes({ x: position.x, y: position.y, width: 1, height: 1 })
      .find((n) => n.data?.isContainer && n.data?.containerOpen)
    return hit ? hit.data.item.id : null
  }

  function handleCatalogItemSelect(_group, item) {
    const position = screenToFlowPosition(lastContextPosRef.current)
    setProductPrompt({ label: item.label, categories: [item.value], fallbackTitle: item.value, position, containerId: containerAtPosition(position) })
  }

  function handleProductPick(product) {
    if (productPrompt) budget.addItem(composeProductTitle(product), 1, productPrompt.position, product.icon, productPrompt.containerId ?? null)
    setProductPrompt(null)
  }

  function handleProductSkip() {
    if (productPrompt) budget.addItem(productPrompt.fallbackTitle, 1, productPrompt.position, null, productPrompt.containerId ?? null)
    setProductPrompt(null)
  }

  // Exposto pro clique no "+" da listinha lateral (SuggestionsStrip é irmã deste componente em
  // BudgetView, não filha — só um ref alcança o estado do prompt daqui). Sem ponto de solto, então
  // position fica indefinida e useBudget decide o layout automático, igual ao clique de antes.
  useImperativeHandle(ref, () => ({
    addSuggestion(req) {
      const resolvedCategories = req.categories?.length ? req.categories : [req.key]
      setProductPrompt({ label: req.label, categories: resolvedCategories, fallbackTitle: categoryLabelByValue[resolvedCategories[0]] || req.label, position: undefined })
    },
  }))

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
        <div
          onContextMenu={(e) => { lastContextPosRef.current = { x: e.clientX, y: e.clientY } }}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="size-full bg-flow-canvas"
        >
          <ReactFlow
            nodes={nodes}
            edges={displayEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeDragStop={handleNodeDragStop}
            onNodesDelete={handleNodesDelete}
            onEdgesChange={onEdgesChange}
            onConnect={handleConnect}
            onEdgesDelete={handleEdgesDelete}
            connectionMode="loose"
            connectionRadius={45}
            deleteKeyCode={readOnly ? [] : ['Delete', 'Backspace']}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            elementsSelectable={!readOnly}
          >
            <Background variant={BackgroundVariant.Lines} gap={90} color="var(--color-flow-grid)" />
          </ReactFlow>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-64">
        {!readOnly ? (
          <>
            <ContextMenuSub>
              <ContextMenuSubTrigger><FontAwesomeIcon icon={faPlus} className="size-4" /> Adicionar item</ContextMenuSubTrigger>
              <ContextMenuSubContent className="max-h-[70vh] overflow-y-auto">
                {catalog.map((group) => (
                  <ContextMenuSub key={group.group}>
                    <ContextMenuSubTrigger>{group.group}</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="max-h-[70vh] overflow-y-auto">
                      {group.items.map((item) => (
                        <ContextMenuItem key={item.value} onSelect={() => handleCatalogItemSelect(group.group, item)}>
                          {item.label}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
            <ContextMenuSeparator />
          </>
        ) : null}

        <ContextMenuItem onSelect={() => zoomIn()}><FontAwesomeIcon icon={faMagnifyingGlassPlus} className="size-4" /> Aumentar zoom</ContextMenuItem>
        <ContextMenuItem onSelect={() => zoomOut()}><FontAwesomeIcon icon={faMagnifyingGlassMinus} className="size-4" /> Diminuir zoom</ContextMenuItem>
        <ContextMenuItem onSelect={() => fitView()}><FontAwesomeIcon icon={faExpand} className="size-4" /> Centralizar</ContextMenuItem>

        {!readOnly ? (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem
              disabled={!budget.items.length || budget.priceLoading}
              onSelect={() => budget.checkPrices()}
            >
              <FontAwesomeIcon icon={faSackDollar} className="size-4" /> Verificar preços
            </ContextMenuItem>
            <ContextMenuItem
              variant="destructive"
              disabled={!budget.items.length}
              onSelect={() => budget.clearAll()}
            >
              <FontAwesomeIcon icon={faTrashCan} className="size-4" /> Limpar fluxo
            </ContextMenuItem>
          </>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>

    <ProductPickerDialog
      prompt={productPrompt}
      onPick={handleProductPick}
      onSkip={handleProductSkip}
      onOpenChange={(open) => { if (!open) setProductPrompt(null) }}
      onGoToProducts={() => { setProductPrompt(null); onGoToProducts?.() }}
    />
    </>
  )
})
