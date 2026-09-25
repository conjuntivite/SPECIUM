import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { askAssistant, createBudgetFromAssistant } from '@/lib/api'
import { formatMarkdownLike } from '@/lib/markdown'

// formatMarkdownLike só entende **negrito**: título (##) vira negrito e citação (>) perde o marcador.
const toHtml = (text) => formatMarkdownLike(text.replace(/^#+\s*(.+)$/gm, '**$1**').replace(/^>\s?/gm, ''))

// Mesma regex do back (lib/equipmentKnowledge.js, BUDGET_LINE): só mostra o botão quando a resposta
// tem ao menos uma linha de orçamento "- 2x Equipamento".
const BUDGET_LINE = /^\s*[-*•]\s*(\d+)\s*x\s+.+$/im
const hasBudgetLines = (text) => BUDGET_LINE.test(text.replace(/\*\*/g, ''))

// Uma de cada tipo que o comercial pergunta: orçamento pronto (vira botão de importar), equipamento
// de terceiros no sistema ONE, limite SIAM e conta de dimensionamento.
const EXAMPLES = [
  'Monte um orçamento de portaria remota ONE: 2 portas sociais, 1 portão deslizante de garagem e 6 câmeras.',
  'Onde ligo uma antena de tag veicular Control iD num condomínio ONE?',
  'Quantos dispositivos cabem numa iDBM+ e qual a distância máxima do cabo RAS?',
  'Quanto tempo um nobreak 1200VA segura um Córtex V6, 2 Endpoints 4 Portas e um switch?',
]

export function AssistantView({ onOpenBudget }) {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importingIndex, setImportingIndex] = useState(null)
  // Orçamento criado mas com itens que não bateram com o catálogo: fica na tela pra o comercial ver
  // o que não entrou antes de abrir (sem pendência, abre direto).
  const [created, setCreated] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function send(text) {
    const question = text.trim()
    if (!question || loading) return
    const next = [...messages, { role: 'user', content: question }]
    setMessages(next)
    setDraft('')
    setError('')
    setLoading(true)
    try {
      const { answer } = await askAssistant(next)
      setMessages([...next, { role: 'assistant', content: answer }])
    } catch (err) {
      setError(err.message || 'A IA não respondeu. Tente de novo.')
    } finally {
      setLoading(false)
    }
  }

  async function importBudget(index) {
    setImportingIndex(index)
    setError('')
    setCreated(null)
    try {
      const result = await createBudgetFromAssistant(messages[index].content)
      if (result.skipped.length) setCreated(result)
      else onOpenBudget(result.budgetId)
    } catch (err) {
      setError(err.message || 'Não foi possível criar o orçamento.')
    } finally {
      setImportingIndex(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Assistente técnico-comercial</h2>
          <p className="text-sm text-muted-foreground">
            Especialista em ONE PORTARIA e SIAM: projeto, ligação, limites e orçamento. Também ajuda com CFTV, rede, energia e cabeamento, mostrando as contas. Passe os requisitos do cliente e ele monta um orçamento que você importa para a tela de Orçamentos.
          </p>
        </div>
        {messages.length ? (
          <Button variant="outline" size="sm" onClick={() => { setMessages([]); setError(''); setCreated(null) }} disabled={loading}>Nova conversa</Button>
        ) : null}
      </div>

      {!messages.length ? (
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((q) => (
            <Button key={q} variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => send(q)}>{q}</Button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-3">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'ml-auto max-w-[85%]' : 'flex max-w-[95%] flex-col items-start gap-2'}>
            <div
              className={m.role === 'user'
                ? 'rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-line'
                : 'rounded-xl border border-border bg-card/60 p-3 text-sm whitespace-pre-line'}
              dangerouslySetInnerHTML={{ __html: toHtml(m.content) }}
            />
            {m.role === 'assistant' && hasBudgetLines(m.content) ? (
              <Button size="sm" variant="secondary" onClick={() => importBudget(i)} disabled={importingIndex !== null}>
                {importingIndex === i ? 'Criando orçamento...' : 'Criar orçamento com estes itens'}
              </Button>
            ) : null}
          </div>
        ))}
        {created ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-3 text-sm" role="status">
            <span>
              Orçamento criado com {created.itemCount} {created.itemCount === 1 ? 'item' : 'itens'}. Não entraram (sem categoria no catálogo): {created.skipped.join('; ')}.
            </span>
            <Button size="sm" onClick={() => onOpenBudget(created.budgetId)}>Abrir orçamento</Button>
          </div>
        ) : null}
        {loading ? <p className="text-sm text-muted-foreground">Preparando a resposta...</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <div ref={bottomRef} />
      </div>

      <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(draft) }}>
        <Textarea
          rows={2}
          maxLength={2000}
          value={draft}
          placeholder="Digite sua pergunta (Enter envia, Shift+Enter quebra linha)"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }}
        />
        <Button type="submit" disabled={loading || !draft.trim()}>Enviar</Button>
      </form>
    </div>
  )
}
