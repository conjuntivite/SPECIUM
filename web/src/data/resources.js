// Recursos conhecidos pelo motor de capacidade (server.js/categoryResourceSeed.js) — mesmos
// identificadores usados lá. "Personalizado" na tela deixa digitar um novo identificador livre
// (ex.: "power.va", "license.ai_channel") sem precisar mexer em código, como o documento de
// arquitetura previu ("no futuro esse conceito pode virar um cadastro próprio").
export const KNOWN_RESOURCES = [
  { value: 'network.gigabit_port', label: 'Porta Gigabit' },
  { value: 'power.poe_port', label: 'Porta PoE' },
  { value: 'recording.ip_channel', label: 'Canal de gravação IP' },
  { value: 'recording.analog_channel', label: 'Canal de gravação analógica' },
]

export function resourceLabel(value) {
  return KNOWN_RESOURCES.find((r) => r.value === value)?.label || value
}
