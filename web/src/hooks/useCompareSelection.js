import { useCallback, useMemo, useState } from 'react'

const MAX_COMPARE = 3

// Portado de static/app.js:50-76 (Map url -> deal, cap de 3 seleções).
export function useCompareSelection() {
  const [selected, setSelected] = useState(new Map())

  const toggle = useCallback((deal, checked) => {
    setSelected((prev) => {
      const next = new Map(prev)
      if (checked) {
        if (next.size >= MAX_COMPARE) return prev
        next.set(deal.url, deal)
      } else {
        next.delete(deal.url)
      }
      return next
    })
  }, [])

  const clear = useCallback(() => setSelected(new Map()), [])

  const items = useMemo(() => [...selected.values()], [selected])
  const atCap = selected.size >= MAX_COMPARE

  return { selected, items, count: selected.size, atCap, maxCompare: MAX_COMPARE, toggle, clear }
}
