// Portado de static/app.js:169-179 e :204-213 (categorias da busca avançada).

export const CATEGORY_OPTIONS = [
  { value: '', label: 'Personalizado (usar campo ao lado)' },
  { value: 'dvr_nvr', label: 'Gravador de Vídeo (DVR/NVR)' },
  { value: 'facial', label: 'Terminal de Reconhecimento Facial' },
  { value: 'porteiro', label: 'Vídeo Porteiro' },
  { value: 'switch', label: 'Switch (PoE / Gerenciável)' },
  { value: 'fonte', label: 'Fonte (Chaveada / 12V)' },
  { value: 'cabo', label: 'Cabeamento (CAT5e, CCI, etc.)' },
  { value: 'mikrotik', label: 'Mikrotik / RouterBoard' },
  { value: 'roteador', label: 'Roteador' },
  { value: 'acabamento', label: 'Solução de Acabamento' },
]

export const CATEGORY_PRESETS = {
  dvr_nvr: { item: 'DVR/NVR', brandPlaceholder: 'Ex: Intelbras, Hikvision', modelPlaceholder: 'Ex: MHDX 1116, 16 canais Full HD' },
  facial: { item: 'Terminal de Reconhecimento Facial', brandPlaceholder: 'Ex: Intelbras, Hikvision', modelPlaceholder: 'Ex: 3000 usuários' },
  porteiro: { item: 'Vídeo Porteiro', brandPlaceholder: 'Ex: Intelbras', modelPlaceholder: 'Ex: Wi-Fi, 1 ponto' },
  switch: { item: 'Switch', brandPlaceholder: 'Ex: Intelbras, TP-Link', modelPlaceholder: 'Ex: 8 portas PoE gerenciável' },
  fonte: { item: 'Fonte', brandPlaceholder: 'Ex: Intelbras', modelPlaceholder: 'Ex: 12V 5A Chaveada' },
  cabo: { item: 'Cabo', brandPlaceholder: 'Ex: Furukawa, Lynx', modelPlaceholder: 'Ex: CAT5e 305m' },
  mikrotik: { item: 'Mikrotik', brandPlaceholder: 'Ex: Mikrotik', modelPlaceholder: 'Ex: hAP ac2, RB750Gr3' },
  roteador: { item: 'Roteador', brandPlaceholder: 'Ex: TP-Link, Intelbras', modelPlaceholder: 'Ex: Wi-Fi 6 Dual Band' },
  acabamento: { item: 'Solução de Acabamento', brandPlaceholder: 'Ex: Steck, Dutotec', modelPlaceholder: 'Ex: Canaleta 20x10mm, Rack 12U' },
}

export const DEFAULT_PLACEHOLDERS = {
  brand: 'Ex: Intelbras, Mikrotik, TP-Link',
  model: 'Ex: MHDX 1116, hAP ac2, 16 canais',
}

export const PROVIDER_OPTIONS = [
  { value: 'all', label: 'Todos os provedores (recomendado)' },
  { value: 'intelbras', label: 'Intelbras (catálogo oficial)' },
  { value: 'amazon', label: 'Amazon (busca própria)' },
  { value: 'serper', label: 'Serper' },
  { value: 'serpapi', label: 'SerpApi' },
]

export const PROVIDER_LABELS = {
  all: 'todos os provedores',
  intelbras: 'Intelbras',
  amazon: 'Amazon',
  serper: 'Serper',
  serpapi: 'SerpApi',
}

export const QUICK_TAGS = [
  { category: 'dvr_nvr', item: 'DVR', brand: 'Intelbras', model: '16 canais Full HD', label: 'DVR 16 canais' },
  { category: 'switch', item: 'Switch', brand: 'Intelbras', model: '8 portas PoE', label: 'Switch PoE 8 portas' },
  { category: 'mikrotik', item: 'Mikrotik', brand: 'Mikrotik', model: 'hAP ac2', label: 'Mikrotik hAP ac²' },
  { category: 'porteiro', item: 'Vídeo Porteiro', brand: 'Intelbras', model: 'Wi-Fi', label: 'Vídeo Porteiro Wi-Fi' },
  { category: 'fonte', item: 'Fonte', brand: 'Intelbras', model: '12V 5A Chaveada', label: 'Fonte 12V 5A' },
  { category: 'cabo', item: 'Cabo', brand: '', model: 'CAT5e 305m', label: 'Cabo CAT5e 305m' },
  { category: 'facial', item: 'Terminal de Reconhecimento Facial', brand: 'Intelbras', model: '', label: 'Terminal Facial' },
]
