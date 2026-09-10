async function requestJson(path, { method = 'GET', body } = {}) {
  const response = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}))
    const error = new Error(errData.detail || 'Não foi possível completar a requisição.')
    if (errData.errors) error.errors = errData.errors
    throw error
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

export function importProducts(csv) {
  return postJson('/api/products/import', { csv })
}

export function getCategories() {
  return requestJson('/api/categories')
}

export function createCategory(data) {
  return postJson('/api/categories', data)
}

export function updateCategory(id, data) {
  return requestJson(`/api/categories/${id}`, { method: 'PUT', body: data })
}

export function deleteCategory(id) {
  return requestJson(`/api/categories/${id}`, { method: 'DELETE' })
}

export function getGroups() {
  return requestJson('/api/groups')
}

export function createGroup(name) {
  return postJson('/api/groups', { name })
}

export function deleteGroup(id) {
  return requestJson(`/api/groups/${id}`, { method: 'DELETE' })
}

export function register(email, password) {
  return postJson('/api/auth/register', { email, password })
}

export function login(email, password) {
  return postJson('/api/auth/login', { email, password })
}

export function logout() {
  return postJson('/api/auth/logout', {})
}

export function getMe() {
  return requestJson('/api/auth/me')
}

export function listBudgets() {
  return requestJson('/api/budgets')
}

export function createBudget() {
  return postJson('/api/budgets', {})
}

export function getBudget(id) {
  return requestJson(`/api/budgets/${id}`)
}

export function updateBudget(id, patch) {
  return requestJson(`/api/budgets/${id}`, { method: 'PATCH', body: patch })
}

export function setBudgetAddress(id, data) {
  return postJson(`/api/budgets/${id}/address`, data)
}

export function deleteBudget(id) {
  return requestJson(`/api/budgets/${id}`, { method: 'DELETE' })
}

export function getResources() {
  return requestJson('/api/resources')
}

export function createResource(data) {
  return postJson('/api/resources', data)
}

export function deleteResource(id) {
  return requestJson(`/api/resources/${id}`, { method: 'DELETE' })
}
