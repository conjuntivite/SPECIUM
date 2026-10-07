// Logo do sistema (public/brand/, Trade UI): logo horizontal ou, com `icon`, só o ícone do gato.
// Cada uma tem versão clara e escura; o CSS (.logo-light/.logo-dark) mostra só a do tema ativo.
export function Brand({ className = '', icon = false }) {
  const name = icon ? 'icon' : 'lockup'
  return (
    <span className={`inline-flex ${className}`}>
      <img src={`/brand/specium-${name}-light.svg`} alt="SPECIUM" className="logo-light h-full w-auto" />
      <img src={`/brand/specium-${name}-dark.svg`} alt="SPECIUM" className="logo-dark h-full w-auto" />
    </span>
  )
}
