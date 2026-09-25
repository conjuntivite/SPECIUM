import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowUp, faBars } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import {
  askAssistant, createBudgetFromAssistant, listAssistantChats, getAssistantChat, saveAssistantChat, deleteAssistantChat,
} from '@/lib/api'
import { ChatSidebar } from './ChatSidebar'
import { ChatMessage } from './ChatMessage'

// Uma de cada tipo que o comercial pergunta: orçamento pronto (vira botão de importar), equipamento
// de terceiros no sistema ONE, limite SIAM e conta de dimensionamento.
const EXAMPLES = [
  'Monte um orçamento de portaria remota ONE: 2 portas sociais, 1 portão deslizante de garagem e 6 câmeras.',
  'Onde ligo uma antena de tag veicular Control iD num condomínio ONE?',
  'Quantos dispositivos cabem numa iDBM+ e qual a distância máxima do cabo RAS?',
  'Quanto tempo um nobreak 1200VA segura um Córtex V6, 2 Endpoints 4 Portas e um switch?',
]

const COMPOSER_MAX_HEIGHT = 200

export function AssistantView({ onOpenBudget }) {
  const [chats, setChats] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importingIndex, setImportingIndex] = useState(null)
  // Orçamento criado mas com itens que não bateram com o catálogo: fica na tela pra o comercial ver
  // o que não entrou antes de abrir (sem pendência, abre direto).
  const [created, setCreated] = useState(null)
  const [showList, setShowList] = useState(false)
  // Ref junto do state: o salvamento acontece depois de um await e precisa do id mais recente.
  const activeIdRef = useRef(null)
  const scrollRef = useRef(null)
  const composerRef = useRef(null)

  const refreshChats = useCallback(() => listAssistantChats().then(setChats).catch(() => {}), [])
  useEffect(() => { refreshChats() }, [refreshChats])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, loading])

  // Caixa de texto cresce com o conteúdo, até COMPOSER_MAX_HEIGHT.
  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_HEIGHT)}px`
  }, [draft])

  function setActive(id) {
    activeIdRef.current = id
    setActiveId(id)
  }

  function resetView() {
    setError('')
    setCreated(null)
    setShowList(false)
  }

  function newChat() {
    setActive(null)
    setMessages([])
    setDraft('')
    resetView()
  }

  async function selectChat(id) {
    if (loading || id === activeIdRef.current) { setShowList(false); return }
    resetView()
    try {
      const chat = await getAssistantChat(id)
      setActive(chat.id)
      setMessages(chat.messages)
    } catch (err) {
      setError(err.message || 'Não foi possível abrir a conversa.')
      refreshChats()
    }
  }

  async function removeChat(id) {
    if (!window.confirm('Apagar esta conversa?')) return
    try {
      await deleteAssistantChat(id)
      if (id === activeIdRef.current) newChat()
    } catch (err) {
      setError(err.message || 'Não foi possível apagar a conversa.')
    }
    refreshChats()
  }

  async function persist(finalMessages) {
    try {
      const saved = await saveAssistantChat(activeIdRef.current, finalMessages)
      setActive(saved.id)
      await refreshChats()
    } catch {
      setError('A resposta chegou, mas não foi possível salvar esta conversa.')
    }
  }

  async function generate(history) {
    setMessages(history)
    setError('')
    setCreated(null)
    setLoading(true)
    let final = null
    try {
      const { answer } = await askAssistant(history)
      final = [...history, { role: 'assistant', content: answer }]
      setMessages(final)
    } catch (err) {
      setError(err.message || 'A IA não respondeu. Tente de novo.')
    } finally {
      setLoading(false)
    }
    if (final) await persist(final)
  }

  function send(text) {
    const question = text.trim()
    if (!question || loading) return
    setDraft('')
    generate([...messages, { role: 'user', content: question }])
  }

  function regenerate() {
    if (loading || messages.at(-1)?.role !== 'assistant') return
    generate(messages.slice(0, -1))
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

  const empty = !messages.length

  return (
    <div className="relative flex h-[calc(100svh-10rem)] min-h-[480px] gap-4">
      <ChatSidebar
        chats={chats}
        activeId={activeId}
        disabled={loading}
        onNew={newChat}
        onSelect={selectChat}
        onDelete={removeChat}
        className={showList ? 'max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-20 max-md:bg-background max-md:shadow-lg' : 'max-md:hidden'}
      />

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="mb-2 flex md:hidden">
          <Button variant="outline" size="sm" onClick={() => setShowList((v) => !v)}>
            <FontAwesomeIcon icon={faBars} /> Conversas
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center gap-6 px-2 py-6 text-center">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Como posso ajudar?</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Especialista em ONE PORTARIA e SIAM: projeto, ligação, limites e orçamento. Também ajuda com CFTV, rede, energia e cabeamento.
                </p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-2">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => send(q)}
                    className="rounded-2xl border border-border bg-card/60 p-3 text-left text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-1 py-4">
              {messages.map((m, i) => (
                <ChatMessage
                  key={i}
                  message={m}
                  isLast={i === messages.length - 1}
                  busy={loading}
                  importing={importingIndex === i}
                  onRegenerate={regenerate}
                  onImport={() => importBudget(i)}
                />
              ))}
              {loading ? (
                <div className="flex items-center gap-1 py-1" role="status" aria-label="Preparando a resposta">
                  {[0, 1, 2].map((n) => (
                    <span key={n} className="size-2 animate-bounce rounded-full bg-muted-foreground/60" style={{ animationDelay: `${n * 0.15}s` }} />
                  ))}
                </div>
              ) : null}
              {created ? (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-3 text-sm" role="status">
                  <span>
                    Orçamento criado com {created.itemCount} {created.itemCount === 1 ? 'item' : 'itens'}. Não entraram (sem categoria no catálogo): {created.skipped.join('; ')}.
                  </span>
                  <Button size="sm" onClick={() => onOpenBudget(created.budgetId)}>Abrir orçamento</Button>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <form className="mx-auto w-full max-w-3xl px-1 pt-2" onSubmit={(e) => { e.preventDefault(); send(draft) }}>
          {error ? <p role="alert" className="mb-2 text-sm text-destructive">{error}</p> : null}
          <div className="flex items-end gap-2 rounded-3xl border border-border bg-card px-4 py-2 shadow-sm transition focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/30">
            <textarea
              ref={composerRef}
              rows={1}
              maxLength={2000}
              value={draft}
              placeholder="Pergunte alguma coisa"
              aria-label="Pergunta"
              className="max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(draft) } }}
            />
            <button
              type="submit"
              disabled={loading || !draft.trim()}
              aria-label="Enviar"
              title="Enviar"
              className="mb-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-30"
            >
              <FontAwesomeIcon icon={faArrowUp} className="size-3.5" />
            </button>
          </div>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">A IA pode errar. Confira números e modelos antes de fechar o orçamento.</p>
        </form>
      </section>
    </div>
  )
}
