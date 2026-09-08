import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'

export function LoadingState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-center">
      <FontAwesomeIcon icon={faSpinner} className="size-8 animate-spin text-[var(--primary)]" />
      <p className="font-medium">{title}</p>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  )
}
