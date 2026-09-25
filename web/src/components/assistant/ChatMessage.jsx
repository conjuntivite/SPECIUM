import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCopy, faCheck, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { formatMarkdownLike } from '@/lib/markdown'

// formatMarkdownLike só entende **negrito**: título (##) vira negrito e citação (>) perde o marcador.
const toHtml = (text) => formatMarkdownLike(text.replace(/^#+\s*(.+)$/gm, '**$1**').replace(/^>\s?/gm, ''))

// Mesma regex do back (lib/equipmentKnowledge.js, BUDGET_LINE): só mostra o botão quando a resposta
// tem ao menos uma linha de orçamento "- 2x Equipamento".
const BUDGET_LINE = /^\s*[-*•]\s*(\d+)\s*x\s+.+$/im
const hasBudgetLines = (text) => BUDGET_LINE.test(text.replace(/\*\*/g, ''))

const actionClass = 'flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50'

// Estilo ChatGPT: a pergunta vai num balão cinza à direita; a resposta é texto solto, sem balão,
// com copiar / gerar de novo (só na última) embaixo.
export function ChatMessage({ message, isLast, busy, importing, onRegenerate, onImport }) {
  const [copied, setCopied] = useState(false)

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] rounded-3xl bg-secondary px-4 py-2.5 text-sm whitespace-pre-line sm:max-w-[80%]"
          dangerouslySetInnerHTML={{ __html: toHtml(message.content) }}
        />
      </div>
    )
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* área de transferência bloqueada: sem feedback */ }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <div className="text-sm leading-relaxed whitespace-pre-line" dangerouslySetInnerHTML={{ __html: toHtml(message.content) }} />
      {hasBudgetLines(message.content) ? (
        <Button size="sm" variant="secondary" onClick={onImport} disabled={busy || importing}>
          {importing ? 'Criando orçamento...' : 'Criar orçamento com estes itens'}
        </Button>
      ) : null}
      <div className="-ml-2 flex items-center gap-0.5">
        <button type="button" onClick={copy} className={actionClass} aria-label="Copiar resposta" title={copied ? 'Copiado!' : 'Copiar'}>
          <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="size-3.5" />
        </button>
        {isLast ? (
          <button type="button" onClick={onRegenerate} disabled={busy} className={actionClass} aria-label="Gerar de novo" title="Gerar de novo">
            <FontAwesomeIcon icon={faRotateRight} className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
