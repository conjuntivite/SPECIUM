import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons'
import { cn } from '@/lib/utils'

// Lista das conversas salvas (até 10 por usuário; a mais antiga sai quando entra a 11ª).
export function ChatSidebar({ chats, activeId, disabled, onNew, onSelect, onDelete, className }) {
  return (
    <aside className={cn('flex w-64 shrink-0 flex-col gap-2 rounded-xl border border-border bg-card/60 p-2', className)}>
      <button
        type="button"
        onClick={onNew}
        disabled={disabled}
        className="flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faPlus} className="size-3.5" /> Nova conversa
      </button>

      <p className="px-3 pt-1 text-xs font-medium text-muted-foreground">Conversas ({chats.length}/10)</p>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {chats.map((chat) => (
          <li key={chat.id} className="group relative">
            <button
              type="button"
              onClick={() => onSelect(chat.id)}
              disabled={disabled}
              title={chat.title}
              className={cn(
                'block w-full truncate rounded-lg py-2 pr-9 pl-3 text-left text-sm transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50',
                chat.id === activeId && 'bg-secondary font-medium',
              )}
            >
              {chat.title}
            </button>
            <button
              type="button"
              onClick={() => onDelete(chat.id)}
              disabled={disabled}
              aria-label={`Apagar conversa: ${chat.title}`}
              title="Apagar conversa"
              className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-background hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none group-hover:opacity-100 max-md:opacity-100"
            >
              <FontAwesomeIcon icon={faTrash} className="size-3" />
            </button>
          </li>
        ))}
        {!chats.length ? <li className="px-3 py-2 text-xs text-muted-foreground">Suas conversas aparecem aqui.</li> : null}
      </ul>
    </aside>
  )
}
