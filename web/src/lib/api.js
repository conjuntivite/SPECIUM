async function requestJson(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    throw new Error(errData.detail || 'Não foi possível completar a requisição.')
  }
  return response.status === 204 ? null : response.json()
}

function postJson(path, body) {
  return requestJson(path, { method: 'POST', body })
}

export function searchDeals({ item_name, brand, model, provider }) {
  return postJson('/api/search', { item_name, brand, model, provider })
}

export function compareDeals(items) {
  return postJson('/api/compare', { items })
}

export function getSuggestions(items) {
  return postJson('/api/recipe/suggestions', { items })
}

export function getPrices(items) {
  return postJson('/api/recipe/prices', { items })
}

export function getProducts(category) {
  const qs = category ? `?category=${encodeURIComponent(category)}` : ''
  return requestJson(`/api/products${qs}`)
}

export function createProduct(data) {
  return postJson('/api/products', data)
}

export function updateProduct(id, data) {
  return requestJson(`/api/products/${id}`, { method: 'PUT', body: data })
}

export function deleteProduct(id) {
  return requestJson(`/api/products/${id}`, { method: 'DELETE' })
}
