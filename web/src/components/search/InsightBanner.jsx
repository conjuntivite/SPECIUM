import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLightbulb } from '@fortawesome/free-solid-svg-icons'
import { formatMarkdownLike } from '@/lib/markdown'

export function InsightBanner({ text }) {
  if (!text) return null
  return (
    <div className="rounded-xl bg-bg-brand-deep p-6 text-[var(--offwhite)]">
      <div className="mb-1 flex items-center gap-2 font-semibold">
        <FontAwesomeIcon icon={faLightbulb} className="size-4 text-bg-brand" />
        <h3>Análise de Mercado & Recomendação</h3>
      </div>
      {/* eslint-disable-next-line react/no-danger -- só **bold**, escapado em formatMarkdownLike */}
      <p className="text-sm opacity-80" dangerouslySetInnerHTML={{ __html: formatMarkdownLike(text) }} />
    </div>
  )
}
