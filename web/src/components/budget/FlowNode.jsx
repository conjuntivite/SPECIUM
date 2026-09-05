import { motion } from 'motion/react'
import { Handle, Position } from '@xyflow/react'
import { formatBRL, parseBRL } from '@/lib/money'

const handleClass = '!size-2.5 !border-2 !border-[#0a0d14] !bg-slate-300'

// Sombra em repouso (mesma do --shadow-elevated) x sombra "levantada" enquanto arrasta — o node em
// si já segue o cursor em tempo real (React Flow), então animar esses valores com o Motion é o que
// dá a sensação de sombra/prévia flutuando embaixo do cursor durante o arraste.
const restShadow = '0 20px 40px -15px rgba(0,0,0,0.5), 0 0 0 0 rgba(34,211,238,0)'
const draggingShadow = '0 30px 60px -12px rgba(0,0,0,0.85), 0 0 0 2px rgba(34,211,238,0.7)'

export function FlowNode({ data, dragging }) {
  const { item, onRemove, onQtyChange } = data
  const unitValue = parseBRL(item.averagePrice)

  return (
    <motion.div
      className="w-[220px] overflow-hidden rounded-lg"
      animate={{
        scale: dragging ? 1.04 : 1,
        opacity: dragging ? 0.72 : 1,
        boxShadow: dragging ? draggingShadow : restShadow,
      }}
      transition={{ type: 'spring', stiffness: 500, damping: 32, mass: 0.6 }}
    >
      <Handle type="target" position={Position.Left} className={handleClass} />
      <Handle type="source" position={Position.Right} className={handleClass} />

      <div className="flex items-center justify-between gap-2 bg-flow-green px-3 py-2 font-bold text-flow-green-text">
        <span className="truncate text-[0.98rem]" title={item.title}>
          {item.quantity > 1 ? `${item.quantity}× ` : ''}
          {item.title}
        </span>
        <button
          type="button"
          className="nodrag flex size-5 shrink-0 items-center justify-center rounded-full bg-black/15 text-[0.7rem] leading-none hover:bg-black/30"
          title="Remover"
          onClick={() => onRemove(item.id)}
        >
          ✕
        </button>
      </div>

      <div className="bg-flow-body py-2">
        <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
          <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">#</span>
          <span className="flex-1 text-slate-200">Quantidade</span>
          <span className="nodrag flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              className="size-[1.15rem] rounded-[0.3rem] bg-white/8 text-[0.75rem] leading-none text-slate-200 hover:bg-white/18"
              onClick={() => onQtyChange(item.id, -1)}
            >
              −
            </button>
            <span className="min-w-[1.4rem] text-center font-mono text-[0.88rem] text-slate-200">{item.quantity}</span>
            <button
              type="button"
              className="size-[1.15rem] rounded-[0.3rem] bg-white/8 text-[0.75rem] leading-none text-slate-200 hover:bg-white/18"
              onClick={() => onQtyChange(item.id, 1)}
            >
              +
            </button>
          </span>
        </div>

        {item.averagePrice ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">$</span>
            <span className="flex-1 truncate text-slate-200">Preço médio (un.)</span>
            <span className="shrink-0 font-mono text-[0.84rem] text-muted-foreground">~{item.averagePrice}</span>
          </div>
        ) : null}

        {unitValue !== null && item.quantity > 1 ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">Σ</span>
            <span className="flex-1 text-slate-200">Subtotal</span>
            <span className="shrink-0 font-mono text-[0.84rem] text-muted-foreground">{formatBRL(unitValue * item.quantity)}</span>
          </div>
        ) : null}

        {item.bestOffer ? (
          <div className="flex items-center gap-2 px-3 py-1.5 text-sm">
            <span className="w-4 shrink-0 text-center text-[0.82rem] text-muted-foreground">↗</span>
            <span className="flex-1 text-slate-200">Melhor oferta</span>
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
