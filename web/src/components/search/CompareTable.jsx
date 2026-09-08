import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from '@/components/ui/table'
import { LoadingState } from './LoadingState'

export function CompareTable({ items, results, isLoading, error, onClose }) {
  const resultsByUrl = new Map((results || []).map((result) => [result.url, result]))

  const specKeys = []
  const seenSpecKeys = new Set()
  items.forEach((item) => {
    const specs = resultsByUrl.get(item.url)?.specs
    if (!specs) return
    Object.keys(specs).forEach((key) => {
      if (!seenSpecKeys.has(key)) {
        seenSpecKeys.add(key)
        specKeys.push(key)
      }
    })
  })

  const notes = items.map((item) => resultsByUrl.get(item.url)?.note).filter(Boolean)

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Comparação de Ficha Técnica</h2>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          <FontAwesomeIcon icon={faXmark} className="size-4" /> Fechar
        </Button>
      </div>

      {isLoading ? <LoadingState title="Buscando ficha técnica dos produtos selecionados..." /> : null}

      {error ? <p className="text-sm text-[var(--destructive)]">{error}</p> : null}

      {!isLoading && !error ? (
        <>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Especificação</TableHead>
                  {items.map((item) => (
                    <TableHead key={item.url} title={item.title}>
                      {item.title}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium text-muted-foreground">Loja</TableCell>
                  {items.map((item) => (
                    <TableCell key={item.url}>{item.store || '—'}</TableCell>
                  ))}
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-muted-foreground">Preço</TableCell>
                  {items.map((item) => (
                    <TableCell key={item.url}>{item.price_estimated || '—'}</TableCell>
                  ))}
                </TableRow>
                {specKeys.map((key) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium text-muted-foreground">{key}</TableCell>
                    {items.map((item) => (
                      <TableCell key={item.url}>{resultsByUrl.get(item.url)?.specs?.[key] || '—'}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {notes.map((note) => (
            <p key={note} className="mt-3 text-sm text-muted-foreground">
              {note}
            </p>
          ))}

          <div className="mt-4 flex flex-wrap gap-2">
            {items.map((item) => (
              <Button asChild key={item.url} size="sm" variant="secondary">
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  Ver na {item.store || 'loja'} ↗
                </a>
              </Button>
            ))}
          </div>
        </>
      ) : null}
    </section>
  )
}
