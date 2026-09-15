import { useEffect, useState } from 'react'
import { getCategories } from '@/lib/api'
import staticCatalog from '@/data/catalog.json'

function groupByCategory(categories) {
  const groups = []
  const byGroup = new Map()
  for (const { group, value, label, icon } of categories) {
    let bucket = byGroup.get(group)
    if (!bucket) {
      bucket = { group, items: [] }
      byGroup.set(group, bucket)
      groups.push(bucket)
    }
    bucket.items.push({ value, label, icon })
  }
  return groups
}

// Mesmo formato de web/src/data/catalog.json (array de { group, items }), mas carregado da coleção
// "categories" do Mongo — a fonte editável pela aba Categorias. Começa com o catálogo estático (a
// mesma pré-build usada pra semear o banco) pra não piscar vazio enquanto a API não responde.
export function useCategories() {
  const [catalog, setCatalog] = useState(staticCatalog)

  useEffect(() => {
    getCategories()
      .then((data) => setCatalog(groupByCategory(data.categories || [])))
      .catch(() => {})
  }, [])

  return catalog
}
