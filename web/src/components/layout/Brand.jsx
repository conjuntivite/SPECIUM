// Wordmark do sistema: "SPECIUM" em negrito, cor do texto padrão (sem split de cor — ao contrário
// do antigo "RED"+"VISION", o nome não tem uma quebra semântica natural em duas palavras).
// `icon` põe o olho da logo (web/public/logo-eye.png) à esquerda do nome.
export function Brand({ className = '', icon = false }) {
  return (
    <span className={`inline-flex items-center gap-2 font-bold tracking-tight ${className}`}>
      {icon ? <img src="/logo-eye.png" alt="" className="h-[1.7em] w-auto" /> : null}
      <span>SPECIUM</span>
    </span>
  )
}
