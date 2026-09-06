import { useEffect, useState } from 'react'
import { getResources } from '@/lib/api'
import { KNOWN_RESOURCES } from '@/data/resources'

// Mesmo padrão de useCategories: carrega da coleção "resources" do Mongo (cadastro editável pela
// aba Recursos), começando com a lista estática (mesmos 4 recursos que o motor já usava fixos no
// código) pra não piscar vazio enquanto a API não responde.
export function useResources() {
  const [resources, setResources] = useState(KNOWN_RESOURCES)

  useEffect(() => {
    getResources()
      .then((data) => {
        const list = (data.resources || []).map((r) => ({ value: r.key, label: r.label }))
        if (list.length) setResources(list)
      })
      .catch(() => {})
  }, [])

  return resources
}
