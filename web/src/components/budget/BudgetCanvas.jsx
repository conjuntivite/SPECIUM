import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { ReactFlow, Background, BackgroundVariant, applyNodeChanges, useReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
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
import catalog from '@/data/catalog.json'
import { categoryValuesForRequirement } from '@/data/requirementCategories'
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

// Elbow tracejado — equivalente ao monkeypatch de createCurvature do Drawflow original.
const defaultEdgeOptions = {
  type: 'step',
  style: { stroke: 'rgba(226, 232, 240, 0.55)', strokeWidth: 1.5, strokeDasharray: '5,4' },
}

export const BudgetCanvas = forwardRef(function BudgetCanvas({ budget, onGoToProducts }, ref) {
  const { screenToFlowPosition, zoomIn, zoomOut, fitView } = useReactFlow()
  // Posição do último clique com botão direito — usada como ponto de spawn ao adicionar item
  // pelo menu (equivalente ao ponto de solto do drag-and-drop da suggestions strip).
  const lastContextPosRef = useRef({ x: 0, y: 0 })

  // Estado local espelhando budget.nodes: sem isso, arrastar só atualiza a posição no fim do
  // gesto (onNodeDragStop), e o card fica parado embaixo do cursor até soltar — "teleportando"
  // pro lugar certo só depois. Com onNodesChange+applyNodeChanges, cada evento de movimento do
  // drag (a cada frame) já entra nesse estado local, então o card acompanha o mouse em tempo
  // real; só ao soltar (onNodeDragStop) a posição final é persistida em budget.positions.
  const [nodes, setNodes] = useState([])

  useEffect(() => {
    setNodes(budget.nodes.map((node) => ({
      ...node,
      data: { ...node.data, onRemove: budget.removeItem, onQtyChange: budget.updateQuantity },
    })))
  }, [budget.nodes, budget.removeItem, budget.updateQuantity])

  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds))
  }, [])

  const handleNodeDragStop = useCallback((_event, node) => {
    budget.updatePosition(node.id, node.position)
  }, [budget])

  const handleNodesDelete = useCallback((deleted) => {
    deleted.forEach((node) => {
      if (node.data?.item) budget.removeItem(node.data.item.id)
    })
  }, [budget])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  // Toda entrada no orçamento — item de categoria do menu, sugestão arrastada ou clicada na
  // listinha lateral — para aqui antes de virar nó: { label, categories, fallbackTitle, position }.
  // `position` já vem em coordenadas do flow (indefinida = useBudget decide um layout automático,
  // caso do clique na sugestão, que não tem ponto de solto).
  const [productPrompt, setProductPrompt] = useState(null)

  // Drag-and-drop nativo (HTML5 DnD) da suggestions strip pro canvas — independente do drag interno
  // do React Flow usado pra mover nós já existentes.
  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const payload = e.dataTransfer.getData('application/json')
    if (!payload) return
    const { key, label } = JSON.parse(payload)
    const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
    setProductPrompt({ label, categories: categoryValuesForRequirement(key), fallbackTitle: label, position })
  }, [screenToFlowPosition])

  function handleCatalogItemSelect(_group, item) {
    const position = screenToFlowPosition(lastContextPosRef.current)
    setProductPrompt({ label: item.label, categories: [item.value], fallbackTitle: item.value, position })
  }

  function handleProductPick(product) {
    if (productPrompt) budget.addItem(composeProductTitle(product), 1, productPrompt.position)
    setProductPrompt(null)
  }

  function handleProductSkip() {
    if (productPrompt) budget.addItem(productPrompt.fallbackTitle, 1, productPrompt.position)
    setProductPrompt(null)
  }

  // Exposto pro clique no "+" da listinha lateral (SuggestionsStrip é irmã deste componente em
  // BudgetView, não filha — só um ref alcança o estado do prompt daqui). Sem ponto de solto, então
  // position fica indefinida e useBudget decide o layout automático, igual ao clique de antes.
  useImperativeHandle(ref, () => ({
    addSuggestion(req) {
      setProductPrompt({ label: req.label, categories: categoryValuesForRequirement(req.key), fallbackTitle: req.label, position: undefined })
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
          className="size-full bg-[#0a0d14]"
        >
          <ReactFlow
            nodes={nodes}
            edges={budget.edges}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            onNodesChange={onNodesChange}
            onNodeDragStop={handleNodeDragStop}
            onNodesDelete={handleNodesDelete}
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background variant={BackgroundVariant.Lines} gap={90} color="rgba(255,255,255,0.05)" />
          </ReactFlow>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-64">
        <ContextMenuSub>
          <ContextMenuSubTrigger>+ Adicionar item</ContextMenuSubTrigger>
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
        <ContextMenuItem onSelect={() => zoomIn()}>＋ Aumentar zoom</ContextMenuItem>
        <ContextMenuItem onSelect={() => zoomOut()}>− Diminuir zoom</ContextMenuItem>
        <ContextMenuItem onSelect={() => fitView()}>⤢ Centralizar</ContextMenuItem>

        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!budget.items.length || budget.priceLoading}
          onSelect={() => budget.checkPrices()}
        >
          💰 Verificar preços
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          disabled={!budget.items.length}
          onSelect={() => budget.clearAll()}
        >
          Limpar fluxo
        </ContextMenuItem>
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
