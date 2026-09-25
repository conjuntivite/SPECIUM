import { faClipboardList, faBox, faMagnifyingGlass, faTag, faFileShield, faComments } from '@fortawesome/free-solid-svg-icons'

// Telas liberáveis por usuário — mesmas chaves de SCREENS em lib/auth.js (o servidor também barra).
// Usuários e Instruções da IA não entram: são sempre só de admin.
export const SCREENS = [
  { value: 'budget', icon: faClipboardList, label: 'Orçamento' },
  { value: 'search', icon: faMagnifyingGlass, label: 'Busca avançada por item' },
  { value: 'products', icon: faBox, label: 'Produtos' },
  { value: 'categories', icon: faTag, label: 'Categorias' },
  { value: 'quote-audit', icon: faFileShield, label: 'Validar orçamento (PDF)' },
  { value: 'assistant', icon: faComments, label: 'Assistente' },
]

// Admin e conta sem lista (criada antes das permissões) veem todas.
export function allowedScreens(user) {
  if (!user) return []
  if (user.role === 'admin' || !Array.isArray(user.screens)) return SCREENS.map((s) => s.value)
  return SCREENS.map((s) => s.value).filter((v) => user.screens.includes(v))
}
