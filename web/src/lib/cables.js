// Tipos de cabo das ligações do canvas: uma cor por tipo. Ligação antiga (sem `cable`) é rede, o cyan de sempre.
export const CABLES = [
  { id: 'rede', label: 'Cabo de rede', color: 'rgba(34,211,238,0.85)' },
  { id: 'cci', label: 'Cabo CCI', color: 'rgba(250,204,21,0.9)' },
  { id: 'coaxial', label: 'Cabo coaxial', color: 'rgba(244,114,182,0.9)' },
  { id: 'duplacapa', label: 'Cabo duplacapa', color: 'rgba(74,222,128,0.9)' },
  { id: 'paralelo', label: 'Cabo paralelo', color: 'rgba(251,146,60,0.9)' },
]

export const cableById = (id) => CABLES.find((c) => c.id === id) || CABLES[0]
