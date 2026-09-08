import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faTriangleExclamation } from '@fortawesome/free-solid-svg-icons'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function ErrorAlert({ message }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex items-center gap-1.5">
        <FontAwesomeIcon icon={faTriangleExclamation} className="size-4" /> {message}
      </AlertDescription>
    </Alert>
  )
}
