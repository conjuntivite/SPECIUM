import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { askAssistant } from '@/lib/api'
import { formatMarkdownLike } from '@/lib/markdown'

// formatMarkdownLike só entende **negrito**: título (##) vira negrito e citação (>) perde o marcador.
const toHtml = (text) => formatMarkdownLike(text.replace(/^#+\s*(.+)$/gm, '**$1**').replace(/^>\s?/gm, ''))

const EXAMPLES = [
  'O que preciso para uma portaria remota ONE com 4 portas e 1 portão?',
  'Quantos dispositivos cabem numa iDBM+ e qual a distância máxima do cabo?',
  'Qual a diferença entre o Endpoint 4 Portas e o Endpoint FULL?',
]

export function AssistantView() {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
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

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Assistente ONE / SIAM</h2>
          <p className="text-sm text-muted-foreground">
            Pergunte sobre projeto, ligação e limites dos equipamentos ONE PORTARIA e SIAM. A IA responde com base nas fichas técnicas cadastradas no sistema.
          </p>
        </div>
        {messages.length ? (
          <Button variant="outline" size="sm" onClick={() => { setMessages([]); setError('') }} disabled={loading}>Nova conversa</Button>
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
          <div
            key={i}
            className={m.role === 'user'
              ? 'ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-sm text-primary-foreground whitespace-pre-line'
              : 'max-w-[95%] rounded-xl border border-border bg-card/60 p-3 text-sm whitespace-pre-line'}
            dangerouslySetInnerHTML={{ __html: toHtml(m.content) }}
          />
        ))}
        {loading ? <p className="text-sm text-muted-foreground">Consultando as fichas...</p> : null}
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
