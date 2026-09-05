import catalog from './catalog.json'

function groupValues(groupName) {
  const group = catalog.find((g) => g.group === groupName)
  return group ? group.items.map((item) => item.value) : []
}

// Requisitos da engine de sugestões (server.js RECIPES) que já correspondem a uma única categoria
// exata do catálogo — sem variação de canal/porta, mapeamento 1:1.
const SINGLE_CATEGORY_BY_KEY = {
  cabo_rede: 'Cabo de Rede CAT6',
  fonte_12v: 'Fonte 12V',
  fonte_poe_alt: 'Fonte 12V',
  caixa_steck: 'Caixa Steck',
  canaleta: 'Canaleta',
  corrugado: 'Cano Corrugado',
  caixa_passagem: 'Caixa de Passagem',
  cotovelo: 'Cotovelo',
  abracadeira: 'Abraçadeira',
  eletroduto: 'Eletroduto',
  adaptador: 'Adaptador',
  cabo_coaxial: 'Cabo Coaxial CFTV',
  baluns: 'Baluns',
  conectores_bnc_p4: 'Conector BNC/P4',
  central_alarme: 'Central de Alarme',
  cartao_memoria: 'Cartão de Memória',
  hd_interno: 'HD Interno (armazenamento)',
  fechadura: 'Fechadura Elétrica',
  nobreak: 'Nobreak',
  rack: 'Rack',
}

// Requisitos genéricos (sem canal/porta definidos) que cobrem várias categorias do catálogo — o
// diálogo de produto mostra a categoria de cada linha pra diferenciar (ex.: "NVR 8 Canais" vs
// "NVR 16 Canais"). "switch_poe" cobre Fast e Giga porque a receita não distingue velocidade.
const GROUPS_BY_KEY = {
  switch_giga: ['Switch Giga'],
  switch_poe: ['Switch PoE Fast', 'Switch PoE Giga'],
  nvr: ['NVR'],
  dvr: ['DVR'],
  cameras: ['Câmeras'],
}

export function categoryValuesForRequirement(key) {
  if (SINGLE_CATEGORY_BY_KEY[key]) return [SINGLE_CATEGORY_BY_KEY[key]]
  if (GROUPS_BY_KEY[key]) return GROUPS_BY_KEY[key].flatMap(groupValues)
  return []
}
