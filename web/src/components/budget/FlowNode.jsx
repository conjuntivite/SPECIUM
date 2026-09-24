import { motion } from 'motion/react'
import { Handle, NodeResizer, Position } from '@xyflow/react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faMinus, faPlus, faXmark, faBoxOpen, faCompress, faArrowUpFromBracket } from '@fortawesome/free-solid-svg-icons'
import { getProductIcon } from '@/lib/productIcons'
import { formatBRL, parseBRL } from '@/lib/money'
import { ContainerAddPanel } from './ContainerAddPanel'

const handleClass = '!size-2.5 !border-2 !border-flow-canvas !bg-zinc-300'

// Grade simples pros filhos de um container aberto (sem posição livre no MVP — ver
// recurso-container.txt seção 7, "priorize usabilidade e simplicidade"). Única fonte de verdade,
// usada tanto aqui (tamanho do próprio node) quanto em useBudget.js (posição relativa de cada
// filho) — os dois têm que concordar, senão os filhos desalinham do espaço reservado no card.
// originY = cabeçalho (até 2 linhas, nome quebra em vez de cortar — 82) + a linha de Quantidade do
// próprio container (36) — o container também é um item com quantidade própria (ex.: 2 Racks), então
// essa linha sempre aparece antes da grade de filhos agora. Mudar o layout de qualquer uma das duas
// (QuantityRow, header) exige reajustar aqui.
export const CONTAINER_GRID = { columns: 2, spacingX: 236, spacingY: 128, originX: 16, originY: 118 }
// 72 = padding (16) + os dois selects do rodapé empilhados (28px cada + 6px de gap) quando há item
// solto no canvas pra mover — com só 64 o segundo select ficava cortado pelo overflow-hidden do card.
// Exportado: BudgetCanvas.jsx usa pra calcular o tamanho mínimo de um container a partir da extensão
// real dos filhos (auto-ajuste ao abrir/fechar), não só da contagem.
export const CONTAINER_FOOTER_HEIGHT = 72

export function containerChildRows(childCount) {
  return Math.max(1, Math.ceil(childCount / CONTAINER_GRID.columns))
}

export function containerNodeSize(childCount) {
  const rows = containerChildRows(childCount)
  return {
    width: CONTAINER_GRID.originX * 2 + CONTAINER_GRID.columns * CONTAINER_GRID.spacingX,
    height: CONTAINER_GRID.originY + rows * CONTAINER_GRID.spacingY + CONTAINER_FOOTER_HEIGHT,
  }
}

// Sombra em repouso (mesma do --shadow-elevated) x sombra "levantada" enquanto arrasta — o node em
// si já segue o cursor em tempo real (React Flow), então animar esses valores com o Motion é o que
// dá a sensação de sombra/prévia flutuando embaixo do cursor durante o arraste.
const restShadow = '0 20px 40px -15px rgba(0,0,0,0.5), 0 0 0 0 rgba(34,211,238,0)'
const draggingShadow = '0 30px 60px -12px rgba(0,0,0,0.85), 0 0 0 2px rgba(34,211,238,0.7)'

// Os 4 handles (topo/direita/baixo/esquerda) são iguais nos três formatos de card — todo capaz de
// iniciar OU terminar uma ligação (isConnectableStart/End), ligação em modo "loose" no BudgetCanvas.
function NodeHandles() {
  return (
    <>
      <Handle id="top" type="target" position={Position.Top} className={handleClass} isConnectableStart isConnectableEnd />
      <Handle id="right" type="source" position={Position.Right} className={handleClass} isConnectableStart isConnectableEnd />
      <Handle id="bottom" type="source" position={Position.Bottom} className={handleClass} isConnectableStart isConnectableEnd />
      <Handle id="left" type="target" position={Position.Left} className={handleClass} isConnectableStart isConnectableEnd />
    </>
  )
}

// Reaproveitado nas 3 variações do card (item solto, container fechado, container aberto) — um
// container também é um item com quantidade própria (ex.: 2 Racks), independente de quantos
// equipamentos tem guardado dentro.
function QuantityRow({ item, onQtyChange, readOnly }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
      <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">#</span>
      <span className="flex-1 text-card-foreground">Quantidade</span>
      {readOnly ? (
        <span className="shrink-0 text-center font-mono text-[0.88rem] text-card-foreground">{item.quantity}</span>
      ) : (
        <span className="nodrag flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="flex size-[1.15rem] items-center justify-center rounded-[0.3rem] bg-foreground/8 text-card-foreground hover:bg-foreground/15"
            onClick={() => onQtyChange(item.id, -1)}
            aria-label="Diminuir quantidade"
            title="Diminuir quantidade"
          >
            <FontAwesomeIcon icon={faMinus} className="size-2.5" />
          </button>
          <span className="min-w-[1.4rem] text-center font-mono text-[0.88rem] text-card-foreground">{item.quantity}</span>
          <button
            type="button"
            className="flex size-[1.15rem] items-center justify-center rounded-[0.3rem] bg-foreground/8 text-card-foreground hover:bg-foreground/15"
            onClick={() => onQtyChange(item.id, 1)}
            aria-label="Aumentar quantidade"
            title="Aumentar quantidade"
          >
            <FontAwesomeIcon icon={faPlus} className="size-2.5" />
          </button>
        </span>
      )}
    </div>
  )
}

// Nome quebra em várias linhas em vez de cortar com "..." (cabeçalho cresce em altura livremente).
// clamp=true limita a 2 linhas — ponytail: teto conhecido, não altura livre — porque o container
// aberto posiciona a grade de filhos num offset fixo (CONTAINER_GRID.originY) calculado pra caber
// exatamente 2 linhas de cabeçalho; nome maior que isso ainda corta na 2ª linha ali.
function NodeTitle({ item, clamp = false }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[0.98rem]" title={item.title}>
      {item.icon ? <FontAwesomeIcon icon={getProductIcon(item.icon)} className="size-3.5 shrink-0" /> : null}
      <span className={`break-words ${clamp ? 'line-clamp-2' : ''}`}>
        {item.quantity > 1 ? `${item.quantity}× ` : ''}
        {item.title}
      </span>
    </span>
  )
}

export function FlowNode({ data, dragging, selected }) {
  const {
    item, onRemove, onQtyChange, hasCriticalGap, isLinked,
    isContainer, containerOpen, containerSize, childCount, childQuantityTotal, childValueTotal,
    containedIn, onToggleContainer, onRemoveFromContainer, onAddCategoryToContainer, onMoveToContainer, onResizeContainer, looseItems,
    readOnly,
  } = data
  const unitValue = parseBRL(item.averagePrice)
  // Seleção (clique/shift/ctrl+clique, ou caixa de seleção) tem prioridade visual sobre o alerta de
  // lacuna crítica — o usuário precisa ver o que está selecionado antes de arrastar o grupo.
  const borderClass = selected ? 'border-zinc-100' : hasCriticalGap ? 'border-flow-red' : 'border-transparent'
  // Cabeçalho só vira verde depois que o card ganha uma linha manual pra outro — antes disso fica
  // neutro (cinza-escuro), pra não sugerir que o item já está "encaixado" no fluxo sem estar.
  const headerClass = isLinked ? 'bg-flow-green text-flow-green-text' : 'bg-zinc-700 text-zinc-200'

  // Container fechado: card compacto de resumo, sem os filhos ocupando espaço no canvas.
  if (isContainer && !containerOpen) {
    return (
      <motion.div
        className={`w-[220px] overflow-hidden rounded-lg border-2 ${borderClass}`}
        title={hasCriticalGap ? 'Falta algo crítico pra este item funcionar — veja as sugestões.' : undefined}
        animate={{ scale: dragging ? 1.04 : 1, opacity: dragging ? 0.72 : 1, boxShadow: dragging ? draggingShadow : restShadow }}
        transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
      >
        <NodeHandles />
        <div className={`flex items-center justify-between gap-2 px-3 py-2 font-bold ${headerClass}`}>
          <NodeTitle item={item} />
          {!readOnly ? (
            <button type="button" className="nodrag flex size-5 shrink-0 items-center justify-center rounded-full bg-black/15 hover:bg-black/30" title="Remover" onClick={() => onRemove(item.id)}>
              <FontAwesomeIcon icon={faXmark} className="size-3" />
            </button>
          ) : null}
        </div>
        <QuantityRow item={item} onQtyChange={onQtyChange} readOnly={readOnly} />
        <div className="flex flex-col gap-1 bg-card px-3 py-2 text-sm text-card-foreground">
          <span>{childCount} equipamento{childCount === 1 ? '' : 's'} interno{childCount === 1 ? '' : 's'}</span>
          {childQuantityTotal > childCount ? <span className="text-xs text-muted-foreground">{childQuantityTotal} itens no total</span> : null}
          {childValueTotal ? <span className="font-mono text-flow-green">{formatBRL(childValueTotal)}</span> : null}
          <button
            type="button"
            className="nodrag mt-1 flex items-center justify-center gap-1.5 rounded-md bg-foreground/8 py-1.5 text-xs font-medium hover:bg-foreground/15"
            onClick={() => onToggleContainer(item.id)}
          >
            <FontAwesomeIcon icon={faBoxOpen} className="size-3" /> Abrir Container
          </button>
        </div>
      </motion.div>
    )
  }

  // Container aberto: cabeçalho com "Fechar Container", corpo reserva o espaço da grade de filhos
  // (os filhos em si são outros FlowNode aninhados pelo React Flow via parentId — não são JSX daqui)
  // e o rodapé oferece adicionar equipamento novo ou mover um item solto pra dentro.
  if (isContainer && containerOpen) {
    // Tamanho efetivo já vem calculado do useBudget.js (manual, se o usuário arrastou os cantos, com
    // piso no mínimo que cabe a grade atual de filhos). minWidth/minHeight do resizer usam o mesmo
    // piso — não dá pra encolher menos que isso, senão um filho fica cortado pra fora do node.
    const { width, height } = containerSize
    const minSize = containerNodeSize(childCount)
    const rows = containerChildRows(childCount)
    return (
      <motion.div
        className={`overflow-hidden rounded-lg border-2 bg-card ${borderClass}`}
        style={{ width, height }}
        animate={{ scale: dragging ? 1.02 : 1, boxShadow: dragging ? draggingShadow : restShadow }}
        transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
      >
        {!readOnly ? (
          <NodeResizer
            minWidth={minSize.width}
            minHeight={minSize.height}
            onResizeEnd={(_event, params) => onResizeContainer(item.id, Math.round(params.width), Math.round(params.height), Math.round(params.x), Math.round(params.y))}
          />
        ) : null}
        <NodeHandles />
        <div className={`flex items-center justify-between gap-2 px-3 py-2 font-bold ${headerClass}`}>
          <NodeTitle item={item} clamp />
          <span className="nodrag flex shrink-0 items-center gap-1">
            <button type="button" className="flex size-5 items-center justify-center rounded-full bg-black/15 hover:bg-black/30" title="Fechar Container" onClick={() => onToggleContainer(item.id)}>
              <FontAwesomeIcon icon={faCompress} className="size-3" />
            </button>
            {!readOnly ? (
              <button type="button" className="flex size-5 items-center justify-center rounded-full bg-black/15 hover:bg-black/30" title="Remover" onClick={() => onRemove(item.id)}>
                <FontAwesomeIcon icon={faXmark} className="size-3" />
              </button>
            ) : null}
          </span>
        </div>
        <QuantityRow item={item} onQtyChange={onQtyChange} readOnly={readOnly} />
        <div className="flex flex-col bg-card p-2" style={{ height: height - CONTAINER_GRID.originY }}>
          <div className="shrink-0" style={{ height: rows * CONTAINER_GRID.spacingY - 8 }} />
          {/* mt-auto: gruda o painel na borda de baixo do container — o espaço reservado pra grade
              (acima) fica fixo, sobra de altura ao arrastar os cantos vira gap aqui, não embaixo. */}
          {!readOnly ? (
            <div className="mt-auto shrink-0">
              <ContainerAddPanel containerId={item.id} looseItems={looseItems || []} onAddCategory={onAddCategoryToContainer} onMoveToContainer={onMoveToContainer} />
            </div>
          ) : null}
        </div>
      </motion.div>
    )
  }

  return (
    <motion.div
      className={`w-[220px] overflow-hidden rounded-lg border-2 ${borderClass}`}
      title={hasCriticalGap ? 'Falta algo crítico pra este item funcionar — veja as sugestões.' : undefined}
      animate={{
        scale: dragging ? 1.04 : 1,
        opacity: dragging ? 0.72 : 1,
        boxShadow: dragging ? draggingShadow : restShadow,
      }}
      transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
    >
      <NodeHandles />

      <div className={`flex items-center justify-between gap-2 px-3 py-2 font-bold ${headerClass}`}>
        <NodeTitle item={item} />
        {!readOnly ? (
          <span className="nodrag flex shrink-0 items-center gap-1">
            {containedIn != null ? (
              <button
                type="button"
                className="flex size-5 items-center justify-center rounded-full bg-black/15 hover:bg-black/30"
                title="Remover do container"
                onClick={() => onRemoveFromContainer(item.id)}
              >
                <FontAwesomeIcon icon={faArrowUpFromBracket} className="size-3" />
              </button>
            ) : null}
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded-full bg-black/15 hover:bg-black/30"
              title="Remover"
              onClick={() => onRemove(item.id)}
            >
              <FontAwesomeIcon icon={faXmark} className="size-3" />
            </button>
          </span>
        ) : null}
      </div>

      <div className="bg-card py-2">
        <QuantityRow item={item} onQtyChange={onQtyChange} readOnly={readOnly} />

        {item.averagePrice ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">$</span>
            <span className="flex-1 truncate text-card-foreground">Preço médio (un.)</span>
            <span className="shrink-0 font-mono text-[0.84rem] text-muted-foreground">~{item.averagePrice}</span>
          </div>
        ) : null}

        {unitValue !== null && item.quantity > 1 ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">Σ</span>
            <span className="flex-1 text-card-foreground">Subtotal</span>
            <span className="shrink-0 font-mono text-[0.84rem] text-muted-foreground">{formatBRL(unitValue * item.quantity)}</span>
          </div>
        ) : null}

        {item.bestOffer ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">↗</span>
            <span className="flex-1 text-card-foreground">Melhor oferta</span>
            <a
              className="nodrag shrink-0 font-mono text-[0.84rem] text-flow-green hover:underline"
              href={item.bestOffer.url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {item.bestOffer.store}
            </a>
          </div>
        ) : null}
      </div>
    </motion.div>
  )
}
