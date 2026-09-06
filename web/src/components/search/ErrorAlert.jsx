import { TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

export function ErrorAlert({ message }) {
  if (!message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex items-center gap-1.5">
        <TriangleAlert className="size-4" /> {message}
      </AlertDescription>
    </Alert>
  )
}
