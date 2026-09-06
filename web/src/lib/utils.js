export { cn } from "cn"

// Normaliza pra comparação de busca: minúsculo e sem acento ("Câmera" e "camera" batem igual).
export function normalizeSearch(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
