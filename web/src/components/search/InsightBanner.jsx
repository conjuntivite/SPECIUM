import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLightbulb } from '@fortawesome/free-solid-svg-icons'
import { formatMarkdownLike } from '@/lib/markdown'

export function InsightBanner({ text }) {
  if (!text) return null
  return (
    <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <FontAwesomeIcon icon={faLightbulb} className="size-4" />
        <h3>Análise de Mercado & Recomendação</h3>
      </div>
      {/* eslint-disable-next-line react/no-danger -- só **bold**, escapado em formatMarkdownLike */}
      <p className="text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: formatMarkdownLike(text) }} />
    </div>
  )
}
