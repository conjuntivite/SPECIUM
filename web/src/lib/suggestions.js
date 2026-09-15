// Compartilhado entre useBudget.js (canvas) e a validação de PDF (leitura estática) — os dois
// recebem o mesmo formato `requirements_by_category` do motor de regras (lib/recipeEngine.js) e
// precisam do mesmo critério de urgência/deduplicação pra decidir o que mostrar primeiro.

// Ordem de urgência: crítico (vermelho) sempre primeiro, depois essencial (âmbar), depois
// alternativa opcional (laranja), recomendado (cinza) por último.
export function suggestionSeverityRank(req) {
  if (req.severity === 'critical') return 0
  if (req.essential) return 1
  if (req.severity === 'optional') return 2
  return 3
}

// Dentro do grupo "recomendado", Nobreak vem primeiro — pedido explícito.
const RECOMMENDED_PRIORITY_KEYS = ['Nobreak']
export function recommendedPriorityRank(req) {
  const index = RECOMMENDED_PRIORITY_KEYS.indexOf(req.key)
  return index === -1 ? RECOMMENDED_PRIORITY_KEYS.length : index
}

// Sugestões ainda não satisfeitas, deduplicadas entre âncoras que compartilham o mesmo requisito
// (ex.: "Fonte 12V" pode ser sugestiva pro DVR e crítica/alternativa pra Câmera IP PoE ao mesmo
// tempo) — fica a versão mais severa, não a primeira âncora processada.
export function dedupeUnsatisfiedSuggestions(requirementsByCategory) {
  const unsatisfiedByKey = new Map()
  Object.values(requirementsByCategory || {}).forEach((requirements) => {
    requirements.forEach((req) => {
      if (req.satisfied_by) return
      const existing = unsatisfiedByKey.get(req.key)
      if (!existing || suggestionSeverityRank(req) < suggestionSeverityRank(existing)) unsatisfiedByKey.set(req.key, req)
    })
  })
  return [...unsatisfiedByKey.values()].sort((a, b) => {
    const severityDiff = suggestionSeverityRank(a) - suggestionSeverityRank(b)
    return severityDiff !== 0 ? severityDiff : recommendedPriorityRank(a) - recommendedPriorityRank(b)
  })
}
